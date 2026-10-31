import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('reconcile', Path(__file__).resolve().parents[1] / 'deploy/reconcile-vps.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReconcileTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.seed = self.root / 'seed'
        self.seed.mkdir()
        self.run_git(self.seed, 'init', '-q', '-b', 'main')
        self.run_git(self.seed, 'config', 'user.email', 'test@example.invalid')
        self.run_git(self.seed, 'config', 'user.name', 'Test')
        (self.seed / 'app.mjs').write_text('base')
        (self.seed / 'other.mjs').write_text('unchanged')
        (self.seed / '.gitignore').write_text('.env.private\n')
        self.commit(self.seed)
        self.origin = self.root / 'origin.git'
        self.run_git(self.root, 'clone', '-q', '--bare', str(self.seed), str(self.origin))
        self.source = self.root / 'source'
        self.run_git(self.root, 'clone', '-q', str(self.origin), str(self.source))
        self.run_git(self.source, 'config', 'user.email', 'test@example.invalid')
        self.run_git(self.source, 'config', 'user.name', 'Test')
        self.run_git(self.seed, 'remote', 'add', 'origin', str(self.origin))
        (self.seed / 'app.mjs').write_text('release with prices')
        for p in ['email-auth.mjs', 'deploy/reconcile-vps.py', 'docs/model-costs.md']:
            f = self.seed / p
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text('reviewed release')
        self.commit(self.seed)
        self.run_git(self.seed, 'push', '-q', 'origin', 'main')
        (self.source / 'app.mjs').write_text('reviewed server snapshot')
        (self.source / 'email-auth.mjs').write_text('reviewed server email')
        (self.source / '.env.private').write_text('TEST_SECRET=preserve-me')
        self.old_manifest = module.SNAPSHOT
        module.SNAPSHOT = {p: self.run_git(self.source, 'hash-object', p) for p in ['app.mjs', 'email-auth.mjs']}
        self.addCleanup(setattr, module, 'SNAPSHOT', self.old_manifest)

    @staticmethod
    def run_git(where, *args):
        return subprocess.check_output(['git', *args], cwd=where, text=True, stderr=subprocess.DEVNULL).strip()

    def commit(self, repo):
        self.run_git(repo, 'add', '.')
        self.run_git(repo, 'commit', '-qm', 'test snapshot')

    def reconcile(self):
        return module.reconcile(self.source, self.root / 'deploy.lock', self.root / 'backups')

    def test_preserves_snapshot_and_secrets_then_fast_forwards(self):
        self.run_git(self.source, 'config', '--unset', 'user.name')
        self.run_git(self.source, 'config', '--unset', 'user.email')
        revision = self.reconcile()
        self.assertEqual(self.run_git(self.source, 'rev-parse', 'HEAD'), revision)
        self.assertEqual((self.source / 'app.mjs').read_text(), 'release with prices')
        self.assertEqual((self.source / '.env.private').read_text(), 'TEST_SECRET=preserve-me')
        self.assertEqual(self.run_git(self.source, 'status', '--porcelain'), '')
        self.assertTrue(list((self.root / 'backups').glob('*.tar.gz')))
        saved = self.run_git(self.source, 'rev-parse', 'refs/stash')
        self.assertEqual(self.run_git(self.source, 'show', saved + ':app.mjs'), 'reviewed server snapshot')
        self.assertEqual(self.reconcile(), revision)

    def test_refuses_a_file_edited_after_export(self):
        (self.source / 'app.mjs').write_text('new work after export')
        with self.assertRaisesRegex(RuntimeError, 'changed after snapshot'):
            self.reconcile()
        self.assertEqual((self.source / 'app.mjs').read_text(), 'new work after export')

    def test_refuses_unreviewed_tracked_changes(self):
        (self.source / 'other.mjs').write_text('unreviewed work')
        with self.assertRaisesRegex(RuntimeError, 'Unreviewed local change'):
            self.reconcile()
        self.assertEqual((self.source / 'app.mjs').read_text(), 'reviewed server snapshot')

    def test_refuses_unknown_untracked_collision(self):
        (self.source / 'docs').mkdir()
        (self.source / 'docs/model-costs.md').write_text('local unpublished document')
        with self.assertRaisesRegex(RuntimeError, 'Unreviewed untracked'):
            self.reconcile()


if __name__ == '__main__':
    unittest.main()
