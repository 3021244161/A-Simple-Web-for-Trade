// Run only on the local workstation after a fresh Vite build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const AdmZip = require(require.resolve('adm-zip', { paths: [path.join(root, 'backend')] }));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const fixedSource = ['index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', '.eslintrc.cjs'].map(name => `frontend/${name}`);
const publicNames = new Set(['favicon.svg', 'robots.txt', 'sitemap.xml']);
const sourcePattern = /^frontend\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|jsx|css|svg)$/;
const sourceImagePattern = /^frontend\/src\/assets\/[A-Za-z0-9_-]+\.webp$/;
const limits = { files: 256, fileBytes: 4 * 1024 * 1024, totalBytes: 20 * 1024 * 1024, archiveBytes: 12 * 1024 * 1024 };

function list(directory, prefix) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  function walk(folder, relative, depth) {
    if (depth > 6) throw new Error('Unexpected frontend directory depth');
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${relative}/${entry.name}`);
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(folder, entry.name), name, depth + 1);
      else if (entry.isFile()) output.push(name);
      else throw new Error(`Unexpected file type: ${name}`);
      if (output.length > limits.files) throw new Error('Too many frontend files');
    }
  }
  walk(directory, prefix, 0);
  return output;
}

const source = [...fixedSource.filter(name => fs.existsSync(path.join(root, name))),
  ...list(path.join(root, 'frontend/src'), 'frontend/src'),
  ...list(path.join(root, 'frontend/public'), 'frontend/public')].sort();
for (const name of source) {
  if (name.startsWith('frontend/src/') && !sourcePattern.test(name) && !sourceImagePattern.test(name)) throw new Error(`Unexpected source path: ${name}`);
  if (name.startsWith('frontend/public/') && !publicNames.has(name.slice('frontend/public/'.length))) throw new Error(`Unexpected public file: ${name}`);
}
if (process.argv.includes('--list-paths')) {
  console.log(JSON.stringify({ paths: source, paths_base64: Buffer.from(JSON.stringify(source)).toString('base64') }, null, 2));
  process.exit(0);
}

const baselinePath = path.join(root, '.maintenance/frontend-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8').replace(/^\uFEFF/, ''));
if (baseline.kind !== 'webtrade-frontend-baseline-v1' || !/^[a-f0-9]{64}$/.test(baseline.index_sha256 || '')) throw new Error('Capture a fresh frontend baseline first');
for (const name of source) {
  if (!Object.hasOwn(baseline.source_hashes, name)) throw new Error(`Inspect this source path before release: ${name}`);
}
const dist = list(path.join(root, 'frontend/dist'), 'frontend/dist').sort();
const assetPattern = /^frontend\/dist\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?)$/;
for (const name of dist) {
  if (name !== 'frontend/dist/index.html' && !publicNames.has(name.slice('frontend/dist/'.length)) && !assetPattern.test(name)) throw new Error(`Unexpected build file: ${name}`);
}
if (!dist.includes('frontend/dist/index.html') || !dist.some(name => name.startsWith('frontend/dist/assets/') && name.endsWith('.js'))) throw new Error('Build the frontend first');
const builtAt = fs.statSync(path.join(root, 'frontend/dist/index.html')).mtimeMs;
if (source.some(name => fs.statSync(path.join(root, name)).mtimeMs > builtAt + 1000)) throw new Error('Source changed after the build; rebuild before packaging');
const names = [...dist, ...source];
if (names.length > limits.files) throw new Error('Too many release files');
const manifest = { kind: 'webtrade-frontend-release-v1', built_at: new Date().toISOString(), baseline,
  effects: { frontend_only: true, service_restart: false, database_access: false }, files: [] };
const deploymentTool = fs.readFileSync(path.join(root, 'ops/deploy-frontend.py'));
manifest.deployment_tool = { path: 'deploy-frontend.py', bytes: deploymentTool.length, sha256: digest(deploymentTool) };
const zip = new AdmZip();
zip.addFile('deploy-frontend.py', deploymentTool);
let total = deploymentTool.length;
for (const name of names) {
  const full = path.join(root, name);
  if (fs.lstatSync(full).isSymbolicLink()) throw new Error(`Refusing symlink: ${name}`);
  const data = fs.readFileSync(full);
  total += data.length;
  if (data.length > limits.fileBytes || total > limits.totalBytes) throw new Error('Release exceeds the frontend size limit');
  manifest.files.push({ path: name, bytes: data.length, sha256: digest(data) });
  zip.addFile(name, data);
}
zip.addFile('frontend-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
const directory = path.join(root, '.maintenance/frontend-release');
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, 'webtrade-frontend.zip');
const archive = zip.toBuffer();
if (archive.length > limits.archiveBytes) throw new Error('Compressed release exceeds the transfer limit');
fs.writeFileSync(output, archive);
fs.writeFileSync(path.join(directory, 'frontend-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, bytes: archive.length, expanded_bytes: total, sha256: digest(archive), files: names.length,
  baseline_index_sha256: baseline.index_sha256, work: baseline.work, deployed: false }, null, 2));
