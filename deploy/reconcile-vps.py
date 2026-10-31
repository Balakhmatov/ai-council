#!/usr/bin/env python3
"""One-time import of the reviewed VPS snapshot, then use the normal deploy service."""
import fcntl
from pathlib import Path
import subprocess
import tarfile
import time

SNAPSHOT = {'.env.example': 'd74d5b3', '.github/workflows/pages.yml': '385b592', 'README.md': '28390ef', 'deploy/auto-deploy.py': '8ddb3fc', 'deploy/install-vps.py': '0f19081', 'economy.mjs': '17f6432', 'package.json': '831a729', 'public/app.js': '3a98082', 'public/assets/models/grok.svg': 'aee13e6', 'public/assets/models/openai.svg': 'fc21f45', 'public/index.html': '0db5b89', 'public/style.css': '3c9ad0c', 'server.mjs': '3ae6ae3', 'test/economy.test.mjs': '372eff8', 'test/server.test.mjs': '51503e6', 'test/ui-smoke.test.mjs': '9a4ea14', 'email-auth.mjs': '31cdaf405881a8344c1604403d0c1228b73ad89b', 'package-lock.json': 'f70287aed4c38084d50b65e56d0905d9bbe411fe', 'scripts/configure-email.py': 'c836ee2996f4ac6512722c8c1f81c010d723506a', 'test/email-auth.test.mjs': '844e619fa58c2f909f7f63c5f8c7e19682e18428'}  # Filled from the uploaded patch; git blob hashes, never credentials.


def git(source, *args):
    return subprocess.check_output(['git', *args], cwd=source, text=True).strip()


def reconcile(source, lock_path, backup_root):
    source = Path(source)
    lock_path = Path(lock_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if git(source, 'branch', '--show-current') != 'main':
            raise RuntimeError('Expected main; checkout unchanged')
        subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=source, check=True)
        git(source, 'fetch', '--quiet', 'origin', 'main')
        remote = git(source, 'rev-parse', 'FETCH_HEAD')
        previous = git(source, 'rev-parse', 'HEAD')
        git(source, 'merge-base', '--is-ancestor', previous, remote)
        # Never discard work not present in the reviewed uploaded snapshot.
        dirty = git(source, 'diff', '--name-only', 'HEAD', '-z').split('\0')
        dirty = [p for p in dirty if p]
        untracked = git(source, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
        untracked = [p for p in untracked if p]
        remote_paths = set(git(source, 'ls-tree', '-r', '--name-only', remote).splitlines())
        captured = dirty + [p for p in untracked if p in SNAPSHOT]
        collisions = [p for p in untracked if p in remote_paths and p not in SNAPSHOT]
        if collisions:
            raise RuntimeError('Unreviewed untracked file would be overwritten; checkout unchanged')
        for path in captured:
            expected = SNAPSHOT.get(path)
            item = source / path
            if not expected or item.is_symlink() or not item.is_file():
                raise RuntimeError('Unreviewed local change: ' + path)
            if not git(source, 'hash-object', '--', path).startswith(expected):
                raise RuntimeError('Local file changed after snapshot: ' + path)
        # Do not reconcile against an older main that lacks the imported auth code.
        required = {'email-auth.mjs', 'deploy/reconcile-vps.py', 'docs/model-costs.md'}
        if not required <= remote_paths:
            raise RuntimeError('GitHub main does not contain the reviewed release yet')
        if captured:
            backup_root = Path(backup_root)
            backup_root.mkdir(parents=True, exist_ok=True)
            backup_root.chmod(0o700)
            backup = backup_root / ('snapshot-' + str(time.time_ns()) + '.tar.gz')
            with backup.open('xb') as output:
                backup.chmod(0o600)
                with tarfile.open(fileobj=output, mode='w:gz') as archive:
                    for path in captured:
                        archive.add(source / path, arcname=path, recursive=False)
            git(source, 'stash', 'push', '--include-untracked', '-m',
                'Preserved reviewed VPS snapshot before GitHub reconciliation', '--', *captured)
            saved = git(source, 'rev-parse', 'refs/stash')
            try:
                git(source, 'merge', '--ff-only', remote)
            except Exception:
                git(source, 'stash', 'apply', '--index', saved)
                raise
            print('VPS files preserved in', backup, 'and git stash', saved)
        else:
            git(source, 'merge', '--ff-only', remote)
        subprocess.run(['git', 'diff', '--quiet'], cwd=source, check=True)
        subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=source, check=True)
        print('Checkout synchronized to GitHub main:', remote)
    return remote


if __name__ == '__main__':
    reconcile('/root/ai-council', '/run/lock/quorum-deploy.lock', '/root/quorum-reconcile-backups')
    # The existing deployment service remains the only installer/activation path.
    subprocess.run(['systemctl', 'start', 'quorum-deploy.service'], check=True)
    subprocess.run(['systemctl', 'is-active', 'quorum-api.service'], check=True)
    print('Normal deployment service finished; check /quorum/healthz for the installed revision.')
