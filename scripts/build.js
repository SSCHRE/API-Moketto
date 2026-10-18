import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { inject } from 'postject';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const windows = process.platform === 'win32';
const os = windows ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform;
const target = process.argv[2] || `${os}-${process.arch}`;
const name = `apimoketto-${version}-${target}`;
const stage = path.join(dist, name);
const exe = path.join(stage, windows ? 'apimoketto.exe' : 'apimoketto');
const bundle = path.join(dist, 'apimoketto.cjs');
const blob = path.join(dist, 'sea-prep.blob');
const seaConfig = path.join(dist, 'sea-config.json');

const step = msg => console.log(`\x1b[36m>\x1b[0m ${msg}`);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

step('bundling');
await build({
  entryPoints: [path.join(root, 'bin', 'apimoketto.js')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  logOverride: { 'empty-import-meta': 'silent' }
});

step('creating the SEA blob');
fs.writeFileSync(seaConfig, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets: {
    'admin.html': path.join(root, 'src', 'admin.html'),
    'package.json': path.join(root, 'package.json')
  }
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

step(`injecting into ${path.basename(exe)}`);
fs.copyFileSync(process.execPath, exe);
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', exe]);
await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(blob), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined
});
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe]);
if (!windows) fs.chmodSync(exe, 0o755);

for (const file of ['README.md', 'LICENSE']) {
  if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(stage, file));
}

step('packing');
const archive = windows ? `${name}.zip` : `${name}.tar.gz`;
if (windows) {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-cf', archive, name], { cwd: dist, stdio: 'inherit' });
} else {
  execFileSync('tar', ['-czf', archive, name], { cwd: dist, stdio: 'inherit' });
}

for (const tmp of [bundle, blob, seaConfig]) fs.rmSync(tmp, { force: true });
step(`done: dist/${archive}`);
