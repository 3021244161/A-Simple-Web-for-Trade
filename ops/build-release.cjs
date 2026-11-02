// Run on the local workstation after tests and frontend build. Never on production.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const AdmZip = require(require.resolve('adm-zip', { paths: [path.join(root, 'backend')] }));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const files = [
  'backend/index.js', 'backend/pbClient.js', 'backend/admin-mobile.html',
  'backend/runtimeCache.js', 'backend/knowledgeBase.js', 'backend/security.js',
  'frontend/dist/index.html', 'ops/nginx/webtrade-performance.conf'
];
const dist = path.join(root, 'frontend/dist');
// Use only assets referenced by the built HTML, so stale build files cannot leak in.
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[A-Za-z0-9._-]+)"/g)) files.push(`frontend/dist/${match[1]}`);
if (!files.some(file => file.endsWith('.js') && file.startsWith('frontend/'))) throw new Error('Build the frontend before packaging');
const manifest = {
  builtAt: new Date().toISOString(),
  requiresVerifiedBusinessBackup: true,
  requiresEnvironment: ['ADMIN_PASSWORD', 'PB_ADMIN_PASSWORD'],
  firstRollout: { restartService: 'webtrade-bff.service', nginxChange: false, databaseChange: false },
  files: []
};
const zip = new AdmZip();
for (const name of files) {
  const data = fs.readFileSync(path.join(root, name));
  if (data.length > 1024 * 1024) throw new Error(`Unexpectedly large release file: ${name}`);
  zip.addFile(name, data);
  manifest.files.push({ path: name, bytes: data.length, sha256: digest(data) });
}
const snapshot = path.join(root, '.maintenance/production-snapshot.json');
if (fs.existsSync(snapshot)) {
  const baseline = JSON.parse(fs.readFileSync(snapshot, 'utf8').replace(/^\uFEFF/, ''));
  manifest.productionBaseline = {
    capturedAt: baseline.captured_at,
    files: Object.fromEntries(Object.entries(baseline.files).filter(([, entry]) => entry.sha256).map(([name, entry]) => [name, entry.sha256]))
  };
}
zip.addFile('release-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
const directory = path.join(root, '.maintenance/release');
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, 'webtrade-maintenance.zip');
zip.writeZip(output);
const data = fs.readFileSync(output);
fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, bytes: data.length, sha256: digest(data), entries: zip.getEntries().length, deployed: false }, null, 2));
