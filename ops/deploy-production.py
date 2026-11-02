"""Deploy the locally verified release; preserve credentials ONLY on this host.

The user must authorize deployment. Does not install/build, change business data,
modify Nginx, restart PocketBase, or export environment credentials.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from uuid import uuid4
from datetime import datetime, timezone

ROOT = Path('/var/www/webtrade-v2')
WORK = Path(sys.argv[1])
EXPECTED_ZIP = 'dcb14c9ec7d31d96df9a2ce482e461c301b11ea6b3d40f58cdef64b22d647c02'
ENV_FILE = Path('/etc/webtrade-bff.env')
DROP_IN = Path('/etc/systemd/system/webtrade-bff.service.d/maintenance-env.conf')
ALLOWED_BACKEND = {'index.js', 'pbClient.js', 'admin-mobile.html', 'runtimeCache.js', 'knowledgeBase.js', 'security.js'}


def emit(event, **data):
    print(json.dumps({'event': event, **data}), flush=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(args, **options):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=45, **options)


def command_bytes(args):
    # Hash network bytes verbatim: text=True would normalize CRLF to LF.
    return subprocess.run(args, capture_output=True, check=True, timeout=45).stdout


def services():
    text = command(['systemctl', 'show', 'webtrade-bff', 'webtrade-pb', 'nginx', '--property=Id,MainPID,ActiveState']).stdout
    return {block['Id']: block for block in (dict(line.split('=', 1) for line in part.splitlines() if '=' in line) for part in text.strip().split('\n\n'))}


def check_resources():
    mem = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    available = int(mem['MemAvailable'].split()[0]) // 1024
    if available < 256 or os.getloadavg()[0] >= 1.5:
        raise RuntimeError('Resource pressure: defer deployment')
    return available


def atomic_write(target, data, mode=0o644):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.maintenance-' + uuid4().hex + '.tmp')
    with temporary.open('xb') as handle:
        os.chmod(temporary, mode)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, target)


def resolve_setting(name, environment, source, env_name=None):
    # Read existing credentials locally, for a same-host environment file only.
    env_name = env_name or name
    if environment.get(env_name):
        return environment[env_name]
    match = re.search(r'const\s+' + re.escape(name) + r"\s*=\s*process\.env\." + re.escape(env_name) + r"\s*\|\|\s*('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", source)
    if not match:
        raise RuntimeError('Required credential configuration could not be resolved: ' + name)
    return ast.literal_eval(match.group(1))


def request_json(path, data=None, cookie=None):
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie
    request = urllib.request.Request('http://127.0.0.1:8088' + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, json.load(response), response.headers.get('Set-Cookie')


def health(environment, manifest, before):
    # Verify the real HTTPS site through loopback, with normal SNI/certificate checks.
    home = command_bytes(['curl', '--silent', '--show-error', '--fail', '--max-time', '10', '--resolve', 'www.hgelectrons.com:443:127.0.0.1', 'https://www.hgelectrons.com/'])
    expected = next(item['sha256'] for item in manifest['files'] if item['path'] == 'frontend/dist/index.html')
    if digest(home) != expected:
        raise RuntimeError('HTTPS entry does not match the release')
    with urllib.request.urlopen('http://127.0.0.1:3001/api/products?limit=1&page=1', timeout=10) as response:
        products = json.load(response)
    if not products.get('items') or not products.get('totalItems'):
        raise RuntimeError('Product list health check failed')
    images = products['items'][0].get('images', [])
    if images:
        from urllib.parse import urlsplit
        path = urlsplit(images[0]).path
        with urllib.request.urlopen('http://127.0.0.1:3001' + path, timeout=10) as response:
            if not response.headers.get('Content-Type', '').startswith('image/'):
                raise RuntimeError('Product image health check failed')
            while response.read(65536):
                pass
    status, data, cookie = request_json('/admin/login', {'username': environment['ADMIN_USERNAME'], 'password': environment['ADMIN_PASSWORD']})
    if status != 200 or not data.get('success') or not cookie:
        raise RuntimeError('Admin login health check failed')
    status, data, _ = request_json('/admin/api/products?perPage=1', cookie=cookie.split(';')[0])
    if status != 200 or not data.get('items'):
        raise RuntimeError('Admin session health check failed')
    with urllib.request.urlopen('http://127.0.0.1:8886/', timeout=10) as response:
        course_hash = digest(response.read())
    if course_hash != before['course_sha256']:
        raise RuntimeError('Course site changed during the deployment window')
    after = services()
    for name in ('webtrade-pb.service', 'nginx.service'):
        if after[name]['MainPID'] != before['services'][name]['MainPID'] or after[name]['ActiveState'] != 'active':
            raise RuntimeError('Unrelated service state changed: ' + name)
    for name, checksum in before['nginx_files'].items():
        if digest(Path(name).read_bytes()) != checksum:
            raise RuntimeError('Nginx configuration unexpectedly changed')
    return {'https_entry': 200, 'products': products['totalItems'], 'image': 'ok' if images else 'none',
            'admin_login_and_session': 'ok', 'course_http': 200, 'course_sha256_unchanged': True,
            'pocketbase_and_nginx_pids_unchanged': True, 'bff_pid': after['webtrade-bff.service']['MainPID'],
            'available_mb': check_resources()}


def main():
    os.umask(0o077)
    if not re.fullmatch(r'/var/backups/webtrade-maintenance-\d{8}T\d{6}Z', str(WORK)) or WORK.is_symlink():
        raise RuntimeError('Unexpected work directory')
    verified = json.loads((WORK / 'verified-backup.json').read_text())
    backup = json.loads((WORK / 'backup-result.json').read_text())
    if verified['archive_sha256'] != backup['archive_sha256'] or verified['sqlite_integrity'] != 'ok' or verified['missing_attachments'] != 0:
        raise RuntimeError('A complete, locally verified backup is required')
    check_resources()
    release = WORK / 'release.zip'
    if digest(release.read_bytes()) != EXPECTED_ZIP:
        raise RuntimeError('Release archive checksum mismatch')
    stage = WORK / 'staged-release'
    if stage.is_symlink():
        raise RuntimeError('Unexpected staging symlink')
    stage.mkdir(mode=0o700, exist_ok=True)
    with zipfile.ZipFile(release) as archive:
        manifest = json.loads(archive.read('release-manifest.json'))
        for item in manifest['files']:
            name = item['path']
            allowed = (name.startswith('backend/') and name.split('/')[-1] in ALLOWED_BACKEND and name.count('/') == 1) or name == 'frontend/dist/index.html' or re.fullmatch(r'frontend/dist/assets/[A-Za-z0-9._-]+', name) or name == 'ops/nginx/webtrade-performance.conf'
            if not allowed or item['bytes'] > 1024 * 1024:
                raise RuntimeError('Unapproved release path')
            data = archive.read(name)
            if digest(data) != item['sha256']:
                raise RuntimeError('Release file checksum mismatch')
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    baseline = manifest['productionBaseline']['files']
    for name in ('backend/index.js', 'backend/pbClient.js', 'backend/admin-mobile.html', 'backend/package.json', 'backend/package-lock.json', 'frontend/dist/index.html'):
        if digest((ROOT / name).read_bytes()) != baseline[name]:
            raise RuntimeError('Production code changed since inspection: ' + name)
    before = {'services': services(), 'course_sha256': digest(Path('/var/www/course/index.html').read_bytes()),
              'nginx_files': {name: digest(Path(name).read_bytes()) for name in ('/etc/nginx/nginx.conf', '/etc/nginx/sites-enabled/course.conf', '/etc/nginx/sites-enabled/webtrade-v2.conf', '/etc/nginx/sites-enabled/webtrade-admin-v2.conf')}}
    if before['course_sha256'] != verified['course_file_sha256']:
        raise RuntimeError('Course file changed since backup; inspect before deployment')
    pid = before['services']['webtrade-bff.service']['MainPID']
    # This environment never leaves this server and is never printed.
    running_env = dict(item.split(b'=', 1) for item in Path('/proc/' + pid + '/environ').read_bytes().split(b'\0') if b'=' in item)
    environment = {key.decode(): value.decode() for key, value in running_env.items()}
    old_pb = (ROOT / 'backend/pbClient.js').read_text()
    old_app = (ROOT / 'backend/index.js').read_text()
    for name in ('PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD'):
        environment[name] = resolve_setting(name, environment, old_pb)
    environment['ADMIN_USERNAME'] = resolve_setting('ADMIN_USER', environment, old_app, 'ADMIN_USERNAME')
    environment['ADMIN_PASSWORD'] = resolve_setting('ADMIN_PASS', environment, old_app, 'ADMIN_PASSWORD')
    environment['PB_URL'] = 'http://127.0.0.1:8090'
    environment['NODE_PATH'] = str(ROOT / 'backend/node_modules')
    if not environment['ADMIN_PASSWORD'] or not environment['PB_ADMIN_PASSWORD']:
        raise RuntimeError('Required credentials are empty')
    for name in ALLOWED_BACKEND:
        if name.endswith('.js'):
            command(['/usr/bin/node', '--check', str(stage / 'backend' / name)])
    canary = r'''
const assert = require('node:assert/strict');
const app = require(process.argv[1]);
const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/site-config')).status, 200);
    const products = await fetch(base + '/api/products?limit=1').then(r => r.json());
    assert.ok(products.totalItems > 0 && products.items.length === 1);
    const login = await fetch(base + '/admin/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/admin/api/products?perPage=1', {headers:{Cookie:cookie}})).status, 200);
    assert.equal((await fetch(base + '/admin/api/categories', {method:'POST',headers:{Cookie:'wb_admin_token=forged','Content-Type':'application/json'},body:JSON.stringify({category:'unused'})})).status, 401);
    console.log(JSON.stringify({canary:'passed',products:products.totalItems,node:process.version}));
    server.closeAllConnections(); server.close(); process.exit(0);
  } catch(error) { console.error('Canary failed: ' + error.message); process.exit(1); }
});
setTimeout(() => process.exit(2), 30000).unref();
'''
    tested = command(['/usr/bin/node', '-e', canary, str(stage / 'backend/index.js')], env=environment)
    emit('staged_canary_passed', result=json.loads(tested.stdout))
    changed = []
    private_rollback = WORK / ('rollback-deploy-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    private_rollback.mkdir(mode=0o700)

    def save(target, label):
        if target.is_symlink():
            raise RuntimeError('Refusing to replace a symlink')
        record = {'target': str(target), 'exists': target.exists(), 'backup': str(private_rollback / label)}
        if target.exists():
            copy = Path(record['backup'])
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, copy)
            record['mode'] = target.stat().st_mode & 0o777
            copy.chmod(0o600)
        changed.append(record)
        (WORK / 'rollback-files.json').write_text(json.dumps(changed, indent=2))

    def restore():
        for record in reversed(changed):
            target = Path(record['target'])
            if record['exists']:
                atomic_write(target, Path(record['backup']).read_bytes(), record['mode'])
            elif target in (ENV_FILE, DROP_IN):
                target.unlink(missing_ok=True)
        command(['systemctl', 'daemon-reload'])
        command(['systemctl', 'restart', 'webtrade-bff.service'])

    try:
        # EnvironmentFile overrides old Environment directives without changing credentials.
        values = {name: environment[name] for name in ('ADMIN_USERNAME', 'ADMIN_PASSWORD', 'PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD', 'PB_URL')}
        def env_line(name, value):
            if '\n' in value or '\r' in value:
                raise RuntimeError('Unsupported credential configuration')
            return name + '="' + value.replace('\\', '\\\\').replace('"', '\\"') + '"\n'
        save(ENV_FILE, 'host-config/webtrade-bff.env')
        atomic_write(ENV_FILE, ''.join(env_line(k, v) for k, v in values.items()).encode(), 0o600)
        save(DROP_IN, 'host-config/maintenance-env.conf')
        atomic_write(DROP_IN, b'[Service]\nEnvironmentFile=/etc/webtrade-bff.env\n', 0o644)
        # Hash-named assets first; index.html last. Retain all older assets.
        deploy_files = [item for item in manifest['files'] if item['path'].startswith(('backend/', 'frontend/'))]
        deploy_files.sort(key=lambda item: item['path'] == 'frontend/dist/index.html')
        for item in deploy_files:
            target = ROOT / item['path']
            if target.exists() and digest(target.read_bytes()) == item['sha256']:
                continue
            if target.exists() and item['path'] not in baseline:
                raise RuntimeError('Unexpected existing file outside baseline: ' + item['path'])
            save(target, 'webtrade-v2/' + item['path'])
            atomic_write(target, (stage / item['path']).read_bytes())
        check_resources()
        command(['systemctl', 'daemon-reload'])
        emit('restarting_bff_only')
        command(['systemctl', 'restart', 'webtrade-bff.service'])
        for attempt in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:3001/api/site-config', timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(0.5)
        result = health(environment, manifest, before)
        result.update({'status': 'deployed', 'completed_at': datetime.now(timezone.utc).isoformat(), 'release_sha256': EXPECTED_ZIP, 'backup_run_id': verified['run_id']})
        (WORK / 'deployment-result.json').write_text(json.dumps(result, indent=2))
        emit('deployment_complete', **result)
    except Exception as error:
        emit('deployment_failed_rolling_back', error_type=type(error).__name__)
        restore()
        (WORK / 'deployment-result.json').write_text(json.dumps({'status': 'rolled_back', 'error_type': type(error).__name__}))
        emit('rollback_complete', bff_active=services()['webtrade-bff.service']['ActiveState'])
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print exception locals, response bodies or process environment.
        emit('stopped', error_type=type(error).__name__, reason=str(error) if not isinstance(error, subprocess.CalledProcessError) else 'A bounded subprocess failed; inspect private server state')
        sys.exit(1)
