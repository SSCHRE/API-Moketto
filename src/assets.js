import fs from 'node:fs';

const sea = typeof process.getBuiltinModule === 'function' ? process.getBuiltinModule('node:sea') : null;

export function readAsset(name, devPath) {
  if (sea && sea.isSea()) return sea.getAsset(name, 'utf8');
  return fs.readFileSync(new URL(devPath, import.meta.url), 'utf8');
}
