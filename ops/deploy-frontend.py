"""Bounded frontend-only inspect/deploy/rollback; never opens business data.

Run with nice -n 19 ionice -c 3 python3. Build/install happens locally only.
The inspect mode writes nothing. Upload one ZIP to WORK/release.zip afterwards.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit
from uuid import uuid4
import zipfile

ROOT = Path('/var/www/webtrade-v2')
COURSE = Path('/var/www/course/index.html')
CONFIG_FILES = ('/etc/nginx/nginx.conf', '/etc/nginx/sites-enabled/course.conf',
                '/etc/nginx/sites-enabled/webtrade-v2.conf', '/etc/nginx/sites-enabled/webtrade-admin-v2.conf')
SERVICES = ('webtrade-bff.service', 'webtrade-pb.service', 'nginx.service')
FIXED_SOURCE = {'frontend/' + name for name in ('index.html', 'package.json', 'package-lock.json',
                'vite.config.js', 'tailwind.config.js', 'postcss.config.js', '.eslintrc.cjs')}
PUBLIC = {'favicon.svg', 'robots.txt', 'sitemap.xml'}
MAX_FILES = 256
MAX_FILE = 4 * 1024 * 1024
MAX_TOTAL = 20 * 1024 * 1024
MAX_ARCHIVE = 12 * 1024 * 1024
INDEX = 'frontend/dist/index.html'
SHA = re.compile(r'^[0-9a-f]{64}$')


def emit(event, **values):
    print(json.dumps({'event': event, **values}), flush=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_path(name):
    return name in FIXED_SOURCE or name in {'frontend/public/' + value for value in PUBLIC} or bool(re.fullmatch(
        r'frontend/src/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:js|jsx|css|svg)', name)) or bool(re.fullmatch(
        r'frontend/src/assets/[A-Za-z0-9_-]+\.webp', name))


def asset_path(name):
    return bool(re.fullmatch(r'frontend/dist/assets/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:js|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?)', name))


def allowed_path(name):
    if not isinstance(name, str) or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name:
        return False
    return name == INDEX or name in {'frontend/dist/' + value for value in PUBLIC} or source_path(name) or asset_path(name)


def safe_target(name, root=None):
    root = ROOT if root is None else root
    if not allowed_path(name):
        raise RuntimeError('Unapproved frontend path: ' + str(name))
    target = root / name
    # Check every existing ancestor: a symlinked assets/src directory is unsafe too.
    for candidate in [target, *target.parents]:
        if candidate.is_symlink():
            raise RuntimeError('Refusing a symlink in a frontend path')
        if candidate.exists() and candidate != target and not candidate.is_dir():
            raise RuntimeError('Frontend parent is not a directory')
    if target.exists() and not target.is_file():
        raise RuntimeError('Frontend target is not a regular file')
    return target


def read_small(path, limit=MAX_FILE):
    if path.stat().st_size > limit:
        raise RuntimeError('Unexpectedly large frontend or configuration file')
    with path.open('rb') as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError('File grew beyond its read limit')
    return data


def command(args):
    # Keep bytes verbatim; text mode previously caused a false CRLF mismatch.
    result = subprocess.run(args, capture_output=True, check=True, timeout=20)
    return result.stdout


def https(path, limit=MAX_FILE):
    if not path.startswith('/') or path.startswith('//') or any(char in path for char in ('\r', '\n')):
        raise RuntimeError('Unexpected health-check URL')
    data = command(['curl', '--silent', '--show-error', '--fail', '--max-time', '12',
                    '--max-filesize', str(limit), '--limit-rate', '256K',
                    '--resolve', 'www.hgelectrons.com:443:127.0.0.1', 'https://www.hgelectrons.com' + path])
    if len(data) > limit:
        raise RuntimeError('Health response exceeded size limit')
    return data


def course_http():
    return command(['curl', '--silent', '--show-error', '--fail', '--max-time', '8', '--max-filesize', str(MAX_FILE),
                    '--limit-rate', '256K', 'http://127.0.0.1:8886/'])


def service_state():
    output = command(['systemctl', 'show', *SERVICES, '--property=Id,MainPID,ActiveState']).decode()
    result = {}
    for part in output.strip().split('\n\n'):
        values = dict(line.split('=', 1) for line in part.splitlines() if '=' in line)
        if values.get('Id') in SERVICES:
            result[values['Id']] = values
    if set(result) != set(SERVICES) or any(value.get('ActiveState') != 'active' or value.get('MainPID') in ('', '0') for value in result.values()):
        raise RuntimeError('A required service is not active')
    return result


def resources():
    mem = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    available = int(mem['MemAvailable'].split()[0]) // 1024
    load = os.getloadavg()[0]
    pressure_path = Path('/proc/pressure/io')
    pressure = pressure_path.read_text() if pressure_path.exists() else ''
    values = [float(match) for match in re.findall(r'avg10=([0-9.]+)', pressure)]
    io_pressure = max(values, default=0)
    free = shutil.disk_usage(ROOT).free
    backup_free = shutil.disk_usage('/var/backups').free
    if available < 256 or load > 1.5 or io_pressure >= 10 or min(free, backup_free) < 512 * 1024 * 1024:
        raise RuntimeError('Resource pressure: frontend deployment deferred')
    return {'available_mb': available, 'load1': load, 'io_psi_avg10': io_pressure,
            'disk_free_mb': free // (1024 * 1024), 'backup_disk_free_mb': backup_free // (1024 * 1024)}


def configuration_hashes():
    # These Nginx files contain no application environment credentials.
    return {name: digest(read_small(Path(name))) for name in CONFIG_FILES}


def products():
    value = json.loads(https('/api/products?limit=1&page=1', 128 * 1024))
    if not isinstance(value.get('totalItems'), int) or value['totalItems'] < 1 or not value.get('items'):
        raise RuntimeError('Product-list health check failed')
    return value


def inspect(work, encoded):
    if len(encoded) > 64 * 1024:
        raise RuntimeError('Source inspection list exceeds its size limit')
    try:
        names = json.loads(base64.b64decode(encoded, validate=True))
    except Exception as error:
        raise RuntimeError('Invalid source path list') from error
    if not isinstance(names, list) or len(names) > MAX_FILES or len(set(names)) != len(names) or any(not isinstance(name, str) or not source_path(name) for name in names):
        raise RuntimeError('Unapproved source inspection paths')
    state = resources()
    index = read_small(safe_target(INDEX), 64 * 1024)
    if digest(https('/')) != digest(index):
        raise RuntimeError('Live HTTPS entry differs from the frontend file')
    source_hashes = {}
    inspected_bytes = len(index)
    for name in names:
        target = safe_target(name)
        data = read_small(target) if target.exists() else None
        inspected_bytes += len(data) if data is not None else 0
        if inspected_bytes > MAX_TOTAL:
            raise RuntimeError('Frontend inspection exceeds its total byte limit')
        source_hashes[name] = digest(data) if data is not None else None
        time.sleep(0.03)
    # Fixed public files need rollback even if their previous version is absent.
    fixed_hashes = {}
    for name in sorted(PUBLIC):
        target = safe_target('frontend/dist/' + name)
        fixed_hashes['frontend/dist/' + name] = digest(read_small(target)) if target.exists() else None
    course_hash = digest(read_small(COURSE))
    if digest(course_http()) != course_hash:
        raise RuntimeError('Course HTTP entry differs from its file')
    catalog = products()
    return {'kind': 'webtrade-frontend-baseline-v1', 'captured_at': datetime.now(timezone.utc).isoformat(),
            'work': str(work), 'index_sha256': digest(index), 'source_hashes': source_hashes,
            'fixed_hashes': fixed_hashes, 'course_sha256': course_hash, 'config_hashes': configuration_hashes(),
            'services': service_state(), 'products': catalog['totalItems'], 'resources': state}


def atomic_write(target, data, mode=0o644):
    missing = []
    parent = target.parent
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    target.parent.mkdir(parents=True, exist_ok=True)
    # A process umask of 077 protects WORK, but new served asset directories must
    # remain traversable by Nginx. WORK itself stays 0700 around private backups.
    for directory in reversed(missing):
        directory.chmod(0o755)
    temporary = target.with_name('.' + target.name + '.frontend-' + uuid4().hex + '.tmp')
    try:
        with temporary.open('xb') as handle:
            os.chmod(temporary, mode)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        if hasattr(os, 'O_DIRECTORY'):
            descriptor = os.open(str(target.parent), os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def validate_archive(archive_path, expected):
    if not SHA.fullmatch(expected or '') or archive_path.is_symlink() or archive_path.stat().st_size > MAX_ARCHIVE:
        raise RuntimeError('Invalid frontend archive')
    raw = read_small(archive_path, MAX_ARCHIVE)
    if digest(raw) != expected:
        raise RuntimeError('Frontend archive checksum mismatch')
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > MAX_FILES + 2 or len(names) != len(set(names)) or any(entry.is_dir() for entry in entries):
            raise RuntimeError('Unexpected archive entries')
        if any(entry.file_size > MAX_FILE or stat.S_ISLNK(entry.external_attr >> 16) for entry in entries) or sum(entry.file_size for entry in entries) > MAX_TOTAL:
            raise RuntimeError('Frontend archive exceeds limits or contains a symlink')
        if 'frontend-manifest.json' not in names or archive.getinfo('frontend-manifest.json').file_size > 256 * 1024:
            raise RuntimeError('Missing or oversized release manifest')
        manifest = json.loads(archive.read('frontend-manifest.json'))
        files = manifest.get('files')
        if manifest.get('kind') != 'webtrade-frontend-release-v1' or not isinstance(files, list) or not files or len(files) > MAX_FILES:
            raise RuntimeError('Invalid frontend release manifest')
        file_names = [item.get('path') for item in files]
        if any(not allowed_path(name) for name in file_names) or len(file_names) != len(set(file_names)) or set(names) != set(file_names) | {'frontend-manifest.json', 'deploy-frontend.py'} or INDEX not in file_names:
            raise RuntimeError('Release manifest path mismatch')
        tool = manifest.get('deployment_tool', {})
        tool_bytes = archive.read('deploy-frontend.py')
        if tool.get('path') != 'deploy-frontend.py' or len(tool_bytes) != tool.get('bytes') or digest(tool_bytes) != tool.get('sha256') or len(tool_bytes) > 256 * 1024:
            raise RuntimeError('Deployment rollback tool checksum mismatch')
        payload = {}
        for item in files:
            data = archive.read(item['path'])
            if len(data) != item.get('bytes') or digest(data) != item.get('sha256'):
                raise RuntimeError('Frontend file checksum mismatch')
            payload[item['path']] = data
        return manifest, payload, tool_bytes


def unchanged_services(baseline):
    current = service_state()
    if any(current[name]['MainPID'] != baseline['services'][name]['MainPID'] for name in SERVICES):
        raise RuntimeError('A service PID changed during the deployment window')
    if configuration_hashes() != baseline['config_hashes'] or digest(read_small(COURSE)) != baseline['course_sha256']:
        raise RuntimeError('An unrelated site or Nginx configuration changed')
    return current


def baseline_match(baseline, payload):
    if baseline.get('kind') != 'webtrade-frontend-baseline-v1' or digest(read_small(safe_target(INDEX))) != baseline.get('index_sha256'):
        raise RuntimeError('Live frontend changed since inspection')
    for name in payload:
        target = safe_target(name)
        if asset_path(name):
            if target.exists() and digest(read_small(target)) != digest(payload[name]):
                raise RuntimeError('Refusing to overwrite an existing immutable asset: ' + name)
            continue
        if name == INDEX:
            continue
        mapping = baseline['source_hashes'] if source_path(name) else baseline['fixed_hashes']
        if name not in mapping:
            raise RuntimeError('A frontend path was not inspected: ' + name)
        actual = digest(read_small(target)) if target.exists() else None
        if actual != mapping[name]:
            raise RuntimeError('Frontend source or public file changed since inspection: ' + name)
    unchanged_services(baseline)


def health(manifest, payload):
    baseline = manifest['baseline']
    if digest(https('/')) != digest(payload[INDEX]):
        raise RuntimeError('HTTPS entry does not match the frontend release')
    # Include one script, one stylesheet and a lazy chunk where present; serial and paced.
    assets = [name for name in payload if asset_path(name)]
    chosen = []
    for suffix in ('.js', '.css', '.js'):
        candidate = next((name for name in assets if name.endswith(suffix) and name not in chosen), None)
        if candidate:
            chosen.append(candidate)
            if digest(https('/' + candidate.removeprefix('frontend/dist/'))) != digest(payload[candidate]):
                raise RuntimeError('A frontend asset was not served correctly')
            time.sleep(0.1)
    for name in payload:
        if digest(read_small(safe_target(name))) != digest(payload[name]):
            raise RuntimeError('Installed frontend file checksum mismatch')
    catalog = products()
    images = catalog['items'][0].get('images') or []
    image_result = 'none'
    if images:
        parsed = urlsplit(images[0])
        if not parsed.path.startswith('/images/'):
            raise RuntimeError('Unexpected product image URL')
        if not https(parsed.path + ('?' + parsed.query if parsed.query else ''), MAX_FILE):
            raise RuntimeError('Product image health check failed')
        image_result = 'ok'
    if digest(course_http()) != baseline['course_sha256']:
        raise RuntimeError('Course HTTP entry changed')
    states = unchanged_services(baseline)
    return {'https_entry': 200, 'representative_assets': len(chosen), 'products': catalog['totalItems'],
            'products_before': baseline['products'], 'image': image_result, 'course_http': 200,
            'all_service_pids_unchanged': True, 'services': states, 'resources': resources()}


def rollback(work, automatic=False):
    record_path = work / 'rollback-manifest.json'
    record = json.loads(read_small(record_path, 256 * 1024))
    if record.get('kind') != 'webtrade-frontend-rollback-v1' or record.get('work') != str(work):
        raise RuntimeError('Invalid frontend rollback manifest')
    items = record['files']
    if len(items) > MAX_FILES or len({item['path'] for item in items}) != len(items) or not any(item['path'] == INDEX for item in items):
        raise RuntimeError('Invalid rollback file list')
    # Preflight every backup before mutating anything. Do not clobber a later release.
    backups = {}
    for item in items:
        name = item['path']
        if not allowed_path(name) or asset_path(name):
            raise RuntimeError('Unexpected rollback target')
        target = safe_target(name)
        actual = digest(read_small(target)) if target.exists() else None
        if actual not in (item['before_sha256'], item['after_sha256']):
            raise RuntimeError('Frontend changed after release; automatic rollback refused')
        if item['existed']:
            backup = work / 'rollback' / name
            if backup.is_symlink():
                raise RuntimeError('Rollback backup is a symlink')
            data = read_small(backup)
            if digest(data) != item['before_sha256']:
                raise RuntimeError('Rollback backup checksum mismatch')
            backups[name] = data
    # Restore the old entry first; its immutable assets were retained.
    for item in sorted(items, key=lambda item: item['path'] != INDEX):
        target = safe_target(item['path'])
        if item['existed']:
            atomic_write(target, backups[item['path']], item['mode'])
        else:
            target.unlink(missing_ok=True)
    if digest(https('/')) != record['baseline']['index_sha256']:
        raise RuntimeError('Rollback entry health check failed')
    unchanged_services(record['baseline'])
    if digest(course_http()) != record['baseline']['course_sha256']:
        raise RuntimeError('Course HTTP check failed after rollback')
    result = {'status': 'rolled_back', 'automatic': automatic, 'completed_at': datetime.now(timezone.utc).isoformat(), 'service_restart': False}
    atomic_write(work / 'deployment-result.json', json.dumps(result, indent=2).encode(), 0o600)
    return result


def deploy(work, expected):
    resources()
    manifest, payload, tool_bytes = validate_archive(work / 'release.zip', expected)
    baseline = manifest.get('baseline', {})
    if baseline.get('work') != str(work):
        raise RuntimeError('Baseline belongs to a different deployment directory')
    baseline_match(baseline, payload)
    if (work / 'rollback-manifest.json').exists():
        raise RuntimeError('This deployment directory has already been used; inspect into a fresh directory')
    atomic_write(work / 'deploy-frontend.py', tool_bytes, 0o600)
    changed = []
    for name, data in payload.items():
        if asset_path(name):
            continue
        target = safe_target(name)
        existed = target.exists()
        previous = read_small(target) if existed else None
        # Always preserve index.html even if rebuilding the same entry.
        if name != INDEX and previous == data:
            continue
        item = {'path': name, 'existed': existed, 'mode': stat.S_IMODE(target.stat().st_mode) if existed else 0o644,
                'before_sha256': digest(previous) if existed else None, 'after_sha256': digest(data)}
        if existed:
            atomic_write(work / 'rollback' / name, previous, 0o600)
        changed.append(item)
        time.sleep(0.03)
    record = {'kind': 'webtrade-frontend-rollback-v1', 'work': str(work), 'baseline': baseline, 'files': changed}
    atomic_write(work / 'rollback-manifest.json', json.dumps(record, indent=2).encode(), 0o600)
    emit('frontend_rollback_saved', files=len(changed), work=str(work))
    try:
        # Write and verify assets first, then source and fixed public files, entry last.
        ordered = sorted(payload, key=lambda name: (name == INDEX, not asset_path(name), name))
        records = {item['path']: item for item in changed}
        for name in ordered:
            resources()
            target = safe_target(name)
            data = payload[name]
            if target.exists() and digest(read_small(target)) == digest(data):
                continue
            if asset_path(name) and target.exists():
                raise RuntimeError('Asset collision detected during install')
            if name in records:
                current = digest(read_small(target)) if target.exists() else None
                if current != records[name]['before_sha256']:
                    raise RuntimeError('Frontend changed immediately before installation: ' + name)
            atomic_write(target, data)
            time.sleep(0.05)
        result = health(manifest, payload)
        result.update({'status': 'deployed', 'completed_at': datetime.now(timezone.utc).isoformat(),
                       'release_sha256': expected, 'frontend_only': True, 'database_access': False,
                       'service_restart': False, 'work': str(work),
                       'rollback_command': 'python3 ' + str(work / 'deploy-frontend.py') + ' --mode rollback --work ' + str(work)})
        atomic_write(work / 'deployment-result.json', json.dumps(result, indent=2).encode(), 0o600)
        return result
    except Exception as error:
        emit('frontend_deploy_failed', error_type=type(error).__name__, rolling_back=True)
        rollback(work, automatic=True)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('inspect', 'deploy', 'rollback'), required=True)
    parser.add_argument('--work', required=True)
    parser.add_argument('--archive-sha')
    parser.add_argument('--paths-b64')
    args = parser.parse_args()
    work = Path(args.work)
    if not re.fullmatch(r'/var/backups/webtrade-frontend-\d{8}T\d{6}Z', str(work)) or work.is_symlink() or Path('/var/backups').is_symlink():
        raise RuntimeError('Unexpected frontend deployment directory')
    os.umask(0o077)
    if args.mode == 'inspect':
        if not args.paths_b64:
            raise RuntimeError('Provide --paths-b64 from the local builder --list-paths output')
        print(json.dumps(inspect(work, args.paths_b64), indent=2))
        return
    if not work.is_dir() or stat.S_IMODE(work.stat().st_mode) != 0o700:
        raise RuntimeError('Create the private deployment directory with mode 0700 before uploading')
    result = deploy(work, args.archive_sha) if args.mode == 'deploy' else rollback(work)
    emit('frontend_' + result['status'], **result)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        reason = 'A bounded command failed' if isinstance(error, subprocess.CalledProcessError) else str(error)
        emit('frontend_stopped', error_type=type(error).__name__, reason=reason)
        sys.exit(1)
