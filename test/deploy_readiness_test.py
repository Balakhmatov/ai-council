import importlib.util
import io
from pathlib import Path
import unittest
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


if __name__ == '__main__':
    unittest.main()
