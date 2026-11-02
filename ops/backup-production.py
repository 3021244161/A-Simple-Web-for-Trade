"""Stream a paced, private backup to stdout. Run through SSH with nice/ionice.

No production service is stopped. Only data.db gets a temporary online snapshot;
rebuildable dependencies, thumbnail caches and request logs are omitted.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import stat
import re
import sys
import tarfile
import time
from datetime import datetime, timezone

ROOT = Path('/var/www/webtrade-v2')
RATE = 1024 * 1024
RUN_ID = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
WORK = Path('/var/backups') / ('webtrade-maintenance-' + RUN_ID)
EXCLUDED_NAMES = {'node_modules', '.git', '.tmp_uploads', '.tmp_extract', '__pycache__', '.maintenance'}
manifest = {'run_id': RUN_ID, 'created_at': datetime.now(timezone.utc).isoformat(), 'files': [],
            'exclusions': ['process environment credentials', 'dotenv files', 'node_modules', '.git', 'temporary uploads', 'PocketBase logs.db and WAL/SHM', 'PocketBase thumbnail cache', 'nested backups'],
            'sensitive_configuration': 'Exact application source and unit files stay in a private server-only rollback directory; exported copies redact credential defaults and Environment directives.'}
last_guard = 0
last_report = 0
copied_bytes = 0
file_count = 0


def emit(event, **data):
    print(json.dumps({'event': event, 'run_id': RUN_ID, **data}), file=sys.stderr, flush=True)


def guard(force=False):
    global last_guard
    now = time.monotonic()
    if not force and now - last_guard < 3:
        return
    for attempt in range(120):
        mem = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        available = int(mem['MemAvailable'].split()[0]) // 1024
        pressure = Path('/proc/pressure/io').read_text() if Path('/proc/pressure/io').exists() else ''
        io_pressure = float(pressure.split('avg10=')[1].split()[0]) if pressure else 0
        load = os.getloadavg()[0]
        if available >= 256 and io_pressure < 10 and load < 1.5:
            last_guard = time.monotonic()
            return
        if attempt % 6 == 0:
            emit('resource_pause', available_mb=available, io_pressure=io_pressure, load=load)
        time.sleep(5)
    raise RuntimeError('Resource pressure persisted; no deployment is permitted')


class PacedReader:
    def __init__(self, source):
        self.source = source
        self.digest = hashlib.sha256()
        self.started = time.monotonic()
        self.bytes = 0

    def read(self, size):
        global copied_bytes, last_report
        guard()
        data = self.source.read(min(size, 128 * 1024))
        self.digest.update(data)
        self.bytes += len(data)
        copied_bytes += len(data)
        time.sleep(max(0, self.started + self.bytes / RATE - time.monotonic()))
        if time.monotonic() - last_report >= 15:
            emit('copy_progress', files=file_count, copied_mb=round(copied_bytes / RATE, 2))
            last_report = time.monotonic()
        return data


class HashWriter:
    def __init__(self, target):
        self.target = target
        self.digest = hashlib.sha256()
        self.bytes = 0

    def write(self, data):
        self.digest.update(data)
        self.bytes += len(data)
        return self.target.write(data)

    def flush(self):
        self.target.flush()


def add_file(archive, source, name):
    global file_count
    guard()
    info = archive.gettarinfo(str(source), arcname=name)
    if not info.isfile():
        archive.addfile(info)
        manifest['files'].append({'path': name, 'type': 'directory' if info.isdir() else 'symlink', 'link': info.linkname})
        return
    before = source.stat()
    if name in ('webtrade-v2/backend/index.js', 'webtrade-v2/backend/pbClient.js') or name.startswith('host-config/'):
        # Exact private rollback copies stay on this server. Never export process env.
        raw = source.read_bytes()
        private_copy = WORK / 'rollback' / name
        private_copy.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        private_copy.write_bytes(raw)
        private_copy.chmod(0o600)
        text = raw.decode('utf-8-sig')
        text = re.sub(r"(?m)^(\s*const\s+(?:ADMIN_PASS|PB_ADMIN_PASSWORD)\s*=).*$", r"\1 '<redacted>';", text)
        text = re.sub(r'(?m)^\s*Environment\s*=.*$', 'Environment=<redacted>', text)
        data = text.encode()
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
        manifest['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'configuration_redacted': True})
        file_count += 1
        time.sleep(0.03)
        return
    with source.open('rb') as handle:
        reader = PacedReader(handle)
        archive.addfile(info, reader)
    after = source.stat()
    if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
        raise RuntimeError('A source file changed during backup; retry before deployment')
    manifest['files'].append({'path': name, 'bytes': info.size, 'sha256': reader.digest.hexdigest()})
    file_count += 1
    # Limit metadata operations even for tiny images and empty directories.
    time.sleep(0.03)


def walk(archive, folder):
    with os.scandir(folder) as entries:
        for entry in entries:
            guard()
            if entry.name in EXCLUDED_NAMES or entry.name == '.env' or entry.name.startswith('.env.'):
                continue
            p = Path(entry.path)
            relative = p.relative_to(ROOT).as_posix()
            if relative.startswith('backend/pb_data/'):
                if relative in ('backend/pb_data/data.db', 'backend/pb_data/logs.db', 'backend/pb_data/auxiliary.db'):
                    continue
                if entry.name.endswith(('-wal', '-shm')) or entry.name == 'thumbs' or relative.startswith('backend/pb_data/backups'):
                    continue
            if entry.name.endswith('.log'):
                continue
            name = 'webtrade-v2/' + relative
            if entry.is_dir(follow_symlinks=False):
                add_file(archive, p, name)
                time.sleep(0.03)
                walk(archive, p)
            elif entry.is_file(follow_symlinks=False) or entry.is_symlink():
                add_file(archive, p, name)


def main():
    os.umask(0o077)
    WORK.mkdir(mode=0o700)
    guard(force=True)
    emit('started', work_directory=str(WORK), rate_bytes_per_second=RATE)
    source = sqlite3.connect('file:' + str(ROOT / 'backend/pb_data/data.db') + '?mode=ro', uri=True, timeout=0.5)
    destination_path = WORK / 'data.db'
    destination = sqlite3.connect(destination_path)
    started = time.monotonic()

    def progress(status, remaining, total):
        guard()
        if time.monotonic() - started > 600:
            raise RuntimeError('Online DB snapshot exceeded the bounded window')
        time.sleep(0.0625)  # 16 x 4 KiB pages per step: approximately 1 MiB/s.

    source.backup(destination, pages=16, progress=progress, sleep=0.2)
    destination.close()
    source.close()
    emit('database_snapshot_complete', bytes=destination_path.stat().st_size)
    output = HashWriter(sys.stdout.buffer)
    with tarfile.open(fileobj=output, mode='w|', format=tarfile.PAX_FORMAT) as archive:
        add_file(archive, destination_path, 'webtrade-v2/backend/pb_data/data.db')
        walk(archive, ROOT)
        for name in ('/etc/nginx/nginx.conf', '/etc/nginx/sites-enabled/webtrade-v2.conf',
                     '/etc/nginx/sites-enabled/webtrade-admin-v2.conf', '/etc/nginx/sites-enabled/course.conf',
                     '/etc/systemd/system/webtrade-bff.service', '/etc/systemd/system/webtrade-pb.service'):
            p = Path(name)
            if p.is_file():
                # Dereference configuration symlinks; don't create links to /etc on restore.
                add_file(archive, p.resolve(), 'host-config/' + p.name)
        manifest['course_file_sha256'] = hashlib.sha256(Path('/var/www/course/index.html').read_bytes()).hexdigest()
        data = json.dumps(manifest, ensure_ascii=True, indent=2).encode()
        info = tarfile.TarInfo('backup-manifest.json')
        info.size = len(data)
        info.mode = 0o600
        archive.addfile(info, io.BytesIO(data))
    output.flush()
    result = {'run_id': RUN_ID, 'work_directory': str(WORK), 'archive_bytes': output.bytes,
              'archive_sha256': output.digest.hexdigest(), 'files': file_count, 'status': 'stream_complete'}
    (WORK / 'backup-result.json').write_text(json.dumps(result, indent=2))
    emit('complete', **{k: v for k, v in result.items() if k != 'run_id'})


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('failed', error_type=type(error).__name__, message=str(error))
        raise
