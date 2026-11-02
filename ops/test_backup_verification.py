import hashlib
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import unittest


class BackupVerificationTest(unittest.TestCase):
    def fixture(self, directory, include_image):
        db = directory / 'source.db'
        connection = sqlite3.connect(db)
        connection.execute('CREATE TABLE _collections (id TEXT, name TEXT, schema TEXT)')
        connection.execute('CREATE TABLE products (id TEXT, images TEXT)')
        connection.execute('INSERT INTO _collections VALUES (?, ?, ?)', ('productsid00001', 'products', json.dumps([{'name': 'images', 'type': 'file'}])))
        connection.execute('INSERT INTO products VALUES (?, ?)', ('recordid0000001', '["photo.jpg"]'))
        connection.commit()
        connection.close()
        files = {'webtrade-v2/backend/pb_data/data.db': db.read_bytes()}
        if include_image:
            files['webtrade-v2/backend/pb_data/storage/productsid00001/recordid0000001/photo.jpg'] = b'test image'
        manifest = {'run_id': 'fixture', 'course_file_sha256': 'fixture', 'files': [
            {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in files.items()
        ]}
        files['backup-manifest.json'] = json.dumps(manifest).encode()
        archive = directory / 'backup.tar'
        with tarfile.open(archive, 'w') as tar:
            for name, data in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
        return archive

    def test_complete_backup_and_archive_digest(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = self.fixture(Path(temporary), True)
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('verify-backup.py')), str(archive)], capture_output=True, text=True, check=True)
            report = json.loads(result.stdout)
            self.assertEqual(report['archive_sha256'], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertEqual(report['attachment_references'], 1)
            self.assertEqual(report['sqlite_integrity'], 'ok')

    def test_missing_database_attachment_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = self.fixture(Path(temporary), False)
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('verify-backup.py')), str(archive)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('attachment references are missing', result.stderr)


if __name__ == '__main__':
    unittest.main()
