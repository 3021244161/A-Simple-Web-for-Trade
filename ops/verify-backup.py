"""Verify a streamed backup locally, including every database file reference."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sqlite3
import sys
import tarfile

archive_path = Path(sys.argv[1]).resolve()
output = archive_path.parent / 'restore-check'
output.mkdir(exist_ok=True)
digests = {}
names = set()
db_path = output / 'data.db'
manifest = None
archive_digest = hashlib.sha256()

class Reader:
    def __init__(self, handle):
        self.handle = handle
    def read(self, size):
        data = self.handle.read(size)
        archive_digest.update(data)
        return data

with archive_path.open('rb') as handle:
    with tarfile.open(fileobj=Reader(handle), mode='r|') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or member.name in names:
                raise RuntimeError('Unsafe or duplicate archive path')
            names.add(member.name)
            if not member.isfile():
                continue
            source = archive.extractfile(member)
            digest = hashlib.sha256()
            contents = bytearray() if member.name == 'backup-manifest.json' else None
            destination = db_path.open('wb') if member.name == 'webtrade-v2/backend/pb_data/data.db' else None
            try:
                while True:
                    data = source.read(1024 * 1024)
                    if not data:
                        break
                    digest.update(data)
                    if contents is not None:
                        contents.extend(data)
                    if destination:
                        destination.write(data)
            finally:
                if destination:
                    destination.close()
            digests[member.name] = digest.hexdigest()
            if contents is not None:
                manifest = json.loads(contents)
    # Include tar padding in the digest of the actual downloaded bytes.
    for data in iter(lambda: handle.read(1024 * 1024), b''):
        archive_digest.update(data)
if not manifest or not db_path.is_file():
    raise RuntimeError('Incomplete backup: manifest or DB missing')
for entry in manifest['files']:
    if 'sha256' in entry and digests.get(entry['path']) != entry['sha256']:
        raise RuntimeError('Backup entry checksum mismatch: ' + entry['path'])

connection = sqlite3.connect('file:' + db_path.as_posix() + '?mode=ro', uri=True)
integrity = connection.execute('PRAGMA integrity_check').fetchall()
if integrity != [('ok',)]:
    raise RuntimeError('SQLite integrity check failed')

def quote(identifier):
    return '"' + identifier.replace('"', '""') + '"'

references = 0
missing = []
for collection_id, table, schema in connection.execute('SELECT id, name, schema FROM _collections'):
    fields = [field['name'] for field in json.loads(schema) if field.get('type') == 'file']
    if not fields:
        continue
    query = 'SELECT id, ' + ', '.join(map(quote, fields)) + ' FROM ' + quote(table)
    for row in connection.execute(query):
        record_id = row[0]
        for value in row[1:]:
            if not value:
                continue
            try:
                parsed = json.loads(value)
                values = parsed if isinstance(parsed, list) else [parsed]
            except (ValueError, TypeError):
                values = [value]
            for filename in values:
                if not filename:
                    continue
                references += 1
                target = f'webtrade-v2/backend/pb_data/storage/{collection_id}/{record_id}/{filename}'
                if target not in digests:
                    missing.append(target)
if missing:
    raise RuntimeError(f'{len(missing)} database attachment references are missing from the backup')
products = connection.execute('SELECT count(*) FROM products').fetchone()[0]
connection.close()
result = {'run_id': manifest['run_id'], 'archive_bytes': archive_path.stat().st_size,
          'archive_sha256': archive_digest.hexdigest(), 'verified_files': len(digests),
          'sqlite_integrity': 'ok', 'products': products, 'attachment_references': references,
          'missing_attachments': 0, 'course_file_sha256': manifest['course_file_sha256'],
          'configuration_credentials_redacted': True}
(output / 'verification.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps(result, indent=2))
