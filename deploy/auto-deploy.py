#!/usr/bin/env python3
"""Deploy new main commits of the single Quorum repository from the local VPS checkout."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

SOURCE = Path('/root/ai-council')
DEPLOY = SOURCE / 'deploy/install-vps.py'
STAMP = Path('/var/lib/quorum/deployed-revision')
LOCK = Path('/run/lock/quorum-deploy.lock')
FAILED = Path('/var/lib/quorum/failed-revision')
HEALTH = 'http://127.0.0.1:8787/healthz'


def run(*command, timeout=120):
    result = subprocess.run(command, cwd=SOURCE, check=True, timeout=timeout,
                            capture_output=True, text=True)
    if result.stdout.strip():
        print(result.stdout.strip(), flush=True)
    return result.stdout.strip()


def git(*args, timeout=120):
    return run('git', *args, timeout=timeout)


def healthy():
    with urllib.request.urlopen(HEALTH, timeout=8) as response:
        return response.status == 200 and json.loads(response.read()).get('ok') is True


def stamp_revision(revision):
    STAMP.parent.mkdir(parents=True, exist_ok=True)
    temporary = STAMP.with_suffix('.tmp')
    temporary.write_text(revision + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, STAMP)


def clean_checkout():
    # Refuse to overwrite anyone's manually edited tracked files.
    return (subprocess.run(['git', 'diff', '--quiet'], cwd=SOURCE).returncode == 0 and
            subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=SOURCE).returncode == 0)


def main():
    if not SOURCE.is_dir():
        raise RuntimeError('Quorum checkout /root/ai-council is missing')
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open('a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Quorum deployment is already running', flush=True)
            return

        branch = git('branch', '--show-current')
        if branch != 'main':
            raise RuntimeError('Expected checkout on main, got ' + branch)
        if not clean_checkout():
            raise RuntimeError('Tracked local changes detected; refusing to overwrite files')

        previous = git('rev-parse', 'HEAD')
        git('fetch', '--quiet', 'origin', 'main')
        remote = git('rev-parse', 'FETCH_HEAD')
        installed = STAMP.read_text(encoding='utf-8').strip() if STAMP.exists() else ''
        if previous == remote and installed == previous:
            return
        if FAILED.exists() and FAILED.read_text(encoding='utf-8').strip() == remote:
            print('Skipping previously failed Quorum revision', remote[:10], flush=True)
            return

        if previous != remote:
            git('merge-base', '--is-ancestor', previous, remote)
            print('Quorum: updating', previous[:10], '->', remote[:10], flush=True)
            git('merge', '--ff-only', remote)

        try:
            run('npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', timeout=180)
            run('npm', 'test', timeout=180)
            run(sys.executable, '-m', 'unittest', 'discover', '-s', 'test', '-p', '*_test.py', timeout=180)
            run(sys.executable, str(DEPLOY), timeout=180)
            if not healthy():
                raise RuntimeError('Quorum health check failed after update')
            stamp_revision(git('rev-parse', 'HEAD'))
            FAILED.unlink(missing_ok=True)
            print('Quorum deployed and healthy', flush=True)
        except Exception as error:
            print('Quorum deployment failed:', error, file=sys.stderr, flush=True)
            FAILED.write_text(remote + '\n', encoding='utf-8')
            os.chmod(FAILED, 0o600)
            if previous != remote:
                try:
                    git('reset', '--hard', previous)
                    run(sys.executable, str(DEPLOY), timeout=180)
                    if not healthy():
                        raise RuntimeError('Rollback health check failed')
                    stamp_revision(previous)
                    print('Quorum rolled back to', previous[:10], flush=True)
                except Exception as rollback_error:
                    print('Quorum rollback failed:', rollback_error, file=sys.stderr, flush=True)
            raise


if __name__ == '__main__':
    main()

