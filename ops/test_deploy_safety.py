import ast
import os
from pathlib import Path
import re
import tempfile
import unittest
from types import SimpleNamespace
from uuid import uuid4

TREE = ast.parse(Path(__file__).with_name('deploy-production.py').read_text())


def load_function(name, namespace):
    function = next(node for node in ast.walk(TREE) if isinstance(node, ast.FunctionDef) and node.name == name)
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<deployment-test>', 'exec'), namespace)
    return namespace[name]


class DeploymentSafetyTest(unittest.TestCase):
    def test_network_checksums_preserve_crlf_bytes(self):
        payload = b'<html>\r\n</html>\r\n'
        def run(args, **options):
            self.assertNotIn('text', options)
            return SimpleNamespace(stdout=payload)
        function = load_function('command_bytes', {'subprocess': SimpleNamespace(run=run)})
        self.assertEqual(function(['curl']), payload)

    def test_credentials_are_preserved_and_environment_values_are_quoted(self):
        namespace = {'ast': ast, 're': re}
        resolve = load_function('resolve_setting', namespace)
        source = "const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'old-default';"
        self.assertEqual(resolve('ADMIN_PASS', {'ADMIN_PASSWORD': 'current-value'}, source, 'ADMIN_PASSWORD'), 'current-value')
        self.assertEqual(resolve('ADMIN_PASS', {}, source, 'ADMIN_PASSWORD'), 'old-default')
        line = load_function('env_line', {})
        self.assertEqual(line('KEY', 'a"b\\c'), 'KEY="a\\"b\\\\c"\n')
        with self.assertRaises(RuntimeError):
            line('KEY', 'a\nb')

    def test_rollback_restores_original_file_and_only_removes_new_owned_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = root / 'original.js'
            backup = root / 'original.backup'
            env = root / 'new.env'
            drop_in = root / 'new.conf'
            original.write_bytes(b'new code')
            backup.write_bytes(b'old code')
            env.write_bytes(b'test')
            drop_in.write_bytes(b'test')
            commands = []
            namespace = {'os': os, 'Path': Path, 'uuid4': uuid4, 'ENV_FILE': env, 'DROP_IN': drop_in,
                         'command': lambda args: commands.append(args),
                         'changed': [
                             {'target': str(original), 'exists': True, 'backup': str(backup), 'mode': 0o644},
                             {'target': str(env), 'exists': False}, {'target': str(drop_in), 'exists': False}
                         ]}
            load_function('atomic_write', namespace)
            load_function('restore', namespace)()
            self.assertEqual(original.read_bytes(), b'old code')
            self.assertFalse(env.exists())
            self.assertFalse(drop_in.exists())
            self.assertEqual(commands, [['systemctl', 'daemon-reload'], ['systemctl', 'restart', 'webtrade-bff.service']])


if __name__ == '__main__':
    unittest.main()
