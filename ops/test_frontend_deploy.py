import importlib.util
import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('frontend_deploy', Path(__file__).with_name('deploy-frontend.py'))
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


class FrontendDeploymentTest(unittest.TestCase):
    def test_source_webp_is_limited_to_flat_assets_directory(self):
        for name in ('frontend/src/assets/city-skyline.webp', 'frontend/src/assets/city-skyline-mobile.webp'):
            self.assertTrue(DEPLOY.source_path(name), name)
            self.assertTrue(DEPLOY.allowed_path(name), name)
        for name in ('frontend/src/city-skyline.webp', 'frontend/public/city-skyline.webp',
                     'frontend/src/assets/nested/city.webp', 'frontend/src/assets/../city.webp',
                     'frontend/src/assets/../../backend/data.webp', 'frontend/src/assets\\city.webp',
                     'frontend/src/assets/city.backup.webp', 'frontend/src/assets/.city.webp',
                     'frontend/src/assets/city.png', 'backend/pb_data/city.webp'):
            self.assertFalse(DEPLOY.source_path(name), name)
            self.assertFalse(DEPLOY.allowed_path(name), name)

    def test_inspect_records_absent_and_existing_source_images(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            names = ['frontend/src/assets/city-skyline.webp', 'frontend/src/assets/city-skyline-mobile.webp']
            (root / DEPLOY.INDEX).parent.mkdir(parents=True)
            (root / DEPLOY.INDEX).write_bytes(b'entry')
            (root / names[0]).parent.mkdir(parents=True)
            (root / names[0]).write_bytes(b'old image')
            course = root / 'course.html'
            course.write_bytes(b'course')
            encoded = base64.b64encode(json.dumps(names).encode()).decode()
            with patch.object(DEPLOY, 'ROOT', root), patch.object(DEPLOY, 'COURSE', course), \
                 patch.object(DEPLOY, 'resources', return_value={}), patch.object(DEPLOY, 'https', return_value=b'entry'), \
                 patch.object(DEPLOY, 'course_http', return_value=b'course'), patch.object(DEPLOY, 'products', return_value={'totalItems': 1072}), \
                 patch.object(DEPLOY, 'configuration_hashes', return_value={}), patch.object(DEPLOY, 'service_state', return_value={}), \
                 patch.object(DEPLOY.time, 'sleep'):
                baseline = DEPLOY.inspect(root / 'work', encoded)
            self.assertEqual(baseline['source_hashes'], {names[0]: DEPLOY.digest(b'old image'), names[1]: None})
            self.assertFalse((root / 'work').exists())

    def test_allowlist_rejects_data_backend_traversal_and_symlinked_parent(self):
        for name in ('backend/pb_data/data.db', 'backend/index.js', 'frontend/dist/../../backend/index.js',
                     '/frontend/dist/index.html', 'frontend/src/../index.html', 'frontend/src/a\\b.js',
                     'frontend/dist/.env', 'frontend/public/unapproved.txt'):
            self.assertFalse(DEPLOY.allowed_path(name), name)
        self.assertTrue(DEPLOY.allowed_path('frontend/dist/assets/AiChat-ab12CD34.js'))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'elsewhere').mkdir()
            (root / 'frontend').mkdir()
            try:
                (root / 'frontend' / 'src').symlink_to(root / 'elsewhere', target_is_directory=True)
            except OSError:
                return  # Windows may prohibit local symlink creation without elevation.
            with self.assertRaises(RuntimeError):
                DEPLOY.safe_target('frontend/src/index.js', root)

    def test_archive_includes_lazy_chunks_and_rejects_unmanifested_and_duplicate_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / 'release.zip'
            payload = {DEPLOY.INDEX: b'<html>\r\n</html>\r\n',
                       'frontend/dist/assets/AiChat-ab12CD34.js': b'export default 1',
                       'frontend/src/assets/city-skyline.webp': b'RIFF' + b'image' * 1024,
                       'frontend/dist/assets/city-skyline-ab12CD34.webp': b'RIFF' + b'image' * 1024}
            manifest = {'kind': 'webtrade-frontend-release-v1', 'files': [
                {'path': name, 'bytes': len(data), 'sha256': DEPLOY.digest(data)} for name, data in payload.items()]}
            manifest['deployment_tool'] = {'path': 'deploy-frontend.py', 'bytes': 6, 'sha256': DEPLOY.digest(b'# tool')}
            with zipfile.ZipFile(archive_path, 'w') as archive:
                for name, data in payload.items():
                    archive.writestr(name, data)
                archive.writestr('frontend-manifest.json', json.dumps(manifest))
                archive.writestr('deploy-frontend.py', b'# tool')
            _, actual, _ = DEPLOY.validate_archive(archive_path, DEPLOY.digest(archive_path.read_bytes()))
            self.assertEqual(actual, payload)
            with patch.object(DEPLOY, 'MAX_FILE', 5000):
                with self.assertRaisesRegex(RuntimeError, 'exceeds limits'):
                    DEPLOY.validate_archive(archive_path, DEPLOY.digest(archive_path.read_bytes()))
            with zipfile.ZipFile(archive_path, 'a') as archive:
                archive.writestr('backend/pb_data/data.db', b'forbidden')
            with self.assertRaises(RuntimeError):
                DEPLOY.validate_archive(archive_path, DEPLOY.digest(archive_path.read_bytes()))
            duplicate = Path(temporary) / 'duplicate.zip'
            with zipfile.ZipFile(duplicate, 'w') as archive:
                archive.writestr(DEPLOY.INDEX, b'a')
                with self.assertWarns(UserWarning):
                    archive.writestr(DEPLOY.INDEX, b'b')
            with self.assertRaises(RuntimeError):
                DEPLOY.validate_archive(duplicate, DEPLOY.digest(duplicate.read_bytes()))

    def test_raw_http_checks_preserve_crlf(self):
        raw = b'<html>\r\n</html>\r\n'
        with patch.object(DEPLOY.subprocess, 'run') as run:
            run.return_value.stdout = raw
            self.assertEqual(DEPLOY.https('/'), raw)
            self.assertNotIn('text', run.call_args.kwargs)
            self.assertIn('--limit-rate', run.call_args.args[0])

    def test_resource_pressure_stops_before_reading_or_writing_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            sentinel = work / 'release.zip'
            sentinel.write_bytes(b'unread archive')
            with patch.object(DEPLOY, 'resources', side_effect=RuntimeError('Resource pressure')), \
                 patch.object(DEPLOY, 'validate_archive') as validate:
                with self.assertRaisesRegex(RuntimeError, 'Resource pressure'):
                    DEPLOY.deploy(work, 'a' * 64)
            validate.assert_not_called()
            self.assertEqual([entry.name for entry in work.iterdir()], ['release.zip'])

    def test_existing_asset_collision_is_rejected_before_live_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            index = root / DEPLOY.INDEX
            index.parent.mkdir(parents=True)
            index.write_bytes(b'old index')
            asset = 'frontend/dist/assets/index-abcd1234.js'
            (root / asset).parent.mkdir()
            (root / asset).write_bytes(b'old immutable bytes')
            baseline = {'kind': 'webtrade-frontend-baseline-v1', 'index_sha256': DEPLOY.digest(index.read_bytes())}
            with patch.object(DEPLOY, 'ROOT', root):
                with self.assertRaisesRegex(RuntimeError, 'immutable asset'):
                    DEPLOY.baseline_match(baseline, {DEPLOY.INDEX: b'new', asset: b'collision'})
            self.assertEqual(index.read_bytes(), b'old index')

    def test_failure_rolls_back_entry_source_and_fixed_files_but_preserves_assets_and_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'root'
            work = Path(temporary) / 'work'
            work.mkdir()
            old = {DEPLOY.INDEX: b'old entry\r\n', 'frontend/src/App.jsx': b'old app',
                   'backend/pb_data/data.db': b'untouched database', 'frontend/dist/assets/old-abcd1234.js': b'old asset',
                   'frontend/src/assets/city-skyline.webp': b'old source image'}
            for name, data in old.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            payload = {DEPLOY.INDEX: b'new entry\r\n', 'frontend/src/App.jsx': b'new app',
                       'frontend/src/New.jsx': b'new file', 'frontend/dist/robots.txt': b'new robots',
                       'frontend/dist/assets/new-abcd1234.js': b'new asset',
                       'frontend/src/assets/city-skyline.webp': b'new source image',
                       'frontend/src/assets/city-skyline-mobile.webp': b'new mobile image',
                       'frontend/dist/assets/city-skyline-ab12CD34.webp': b'new immutable image'}
            baseline = {'kind': 'webtrade-frontend-baseline-v1', 'work': str(work),
                        'index_sha256': DEPLOY.digest(old[DEPLOY.INDEX]), 'source_hashes': {
                            'frontend/src/App.jsx': DEPLOY.digest(old['frontend/src/App.jsx']), 'frontend/src/New.jsx': None,
                            'frontend/src/assets/city-skyline.webp': DEPLOY.digest(old['frontend/src/assets/city-skyline.webp']),
                            'frontend/src/assets/city-skyline-mobile.webp': None},
                        'fixed_hashes': {'frontend/dist/robots.txt': None}, 'course_sha256': DEPLOY.digest(b'course')}
            manifest = {'baseline': baseline}
            writes = []
            original_write = DEPLOY.atomic_write
            def tracked_write(target, data, mode=0o644):
                if root in target.parents:
                    writes.append(target.relative_to(root).as_posix())
                original_write(target, data, mode)
            with patch.object(DEPLOY, 'ROOT', root), patch.object(DEPLOY, 'resources', return_value={}), \
                 patch.object(DEPLOY, 'validate_archive', return_value=(manifest, payload, b'# tool')), \
                 patch.object(DEPLOY, 'unchanged_services', return_value={}), \
                 patch.object(DEPLOY, 'health', side_effect=RuntimeError('simulated health failure')), \
                 patch.object(DEPLOY, 'https', side_effect=lambda path: (root / DEPLOY.INDEX).read_bytes()), \
                 patch.object(DEPLOY, 'course_http', return_value=b'course'), \
                 patch.object(DEPLOY, 'atomic_write', side_effect=tracked_write), patch.object(DEPLOY.time, 'sleep'):
                with self.assertRaisesRegex(RuntimeError, 'simulated health failure'):
                    DEPLOY.deploy(work, 'a' * 64)
            for name, data in old.items():
                self.assertEqual((root / name).read_bytes(), data)
            self.assertFalse((root / 'frontend/src/New.jsx').exists())
            self.assertFalse((root / 'frontend/dist/robots.txt').exists())
            self.assertFalse((root / 'frontend/src/assets/city-skyline-mobile.webp').exists())
            self.assertEqual((root / 'frontend/dist/assets/new-abcd1234.js').read_bytes(), b'new asset')
            self.assertEqual((root / 'frontend/dist/assets/city-skyline-ab12CD34.webp').read_bytes(), b'new immutable image')
            self.assertEqual(writes[len(payload) - 1], DEPLOY.INDEX)
            self.assertEqual(writes[len(payload)], DEPLOY.INDEX)
            self.assertEqual(json.loads((work / 'deployment-result.json').read_text())['status'], 'rolled_back')

    def test_rollback_refuses_to_clobber_a_later_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'root'
            work = Path(temporary) / 'work'
            work.mkdir()
            target = root / DEPLOY.INDEX
            target.parent.mkdir(parents=True)
            target.write_bytes(b'later release')
            record = {'kind': 'webtrade-frontend-rollback-v1', 'work': str(work), 'files': [
                {'path': DEPLOY.INDEX, 'before_sha256': DEPLOY.digest(b'before'),
                 'after_sha256': DEPLOY.digest(b'after'), 'existed': True}]}
            (work / 'rollback-manifest.json').write_text(json.dumps(record))
            with patch.object(DEPLOY, 'ROOT', root):
                with self.assertRaisesRegex(RuntimeError, 'changed after release'):
                    DEPLOY.rollback(work)
            self.assertEqual(target.read_bytes(), b'later release')


if __name__ == '__main__':
    unittest.main()
