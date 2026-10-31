import importlib.util
import io
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('auto_deploy', Path(__file__).resolve().parents[1] / 'deploy/auto-deploy.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReadinessTest(unittest.TestCase):
    def check(self, outcomes, timeout=5):
        clock = [0]
        def response(*args, **kwargs):
            value = outcomes.pop(0) if len(outcomes) > 1 else outcomes[0]
            if isinstance(value, Exception):
                raise value
            value = io.BytesIO(value)
            value.status = 200
            return value
        def advance(seconds):
            clock[0] += seconds
        with patch.object(module.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(module.time, 'sleep', side_effect=advance), patch.object(module.urllib.request, 'urlopen', side_effect=response):
            return module.healthy(timeout)

    def test_waits_for_port_to_listen(self):
        self.assertTrue(self.check([urllib.error.URLError(ConnectionRefusedError()), b'{"ok":true}']))

    def test_retries_invalid_and_not_ready_responses(self):
        self.assertTrue(self.check([b'not JSON', b'{"ok":false}', b'{"ok":true}']))

    def test_returns_false_after_bounded_failure(self):
        self.assertFalse(self.check([urllib.error.URLError('offline')], timeout=3))

    def test_public_revision_marker_is_readable_by_the_api_user(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'deployed-revision'
            marker.write_text('old')
            marker.chmod(0o600)
            with patch.object(module, 'STAMP', marker):
                module.stamp_revision('a' * 40)
            self.assertEqual(marker.read_text(), 'a' * 40 + '\n')
            self.assertEqual(marker.stat().st_mode & 0o777, 0o644)


if __name__ == '__main__':
    unittest.main()
