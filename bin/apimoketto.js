#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { Store, sampleConfig, normalize } from '../src/store.js';
import { createServer, ADMIN } from '../src/server.js';
import { readAsset } from '../src/assets.js';
import { importers, findImporter, importerFor } from '../src/importers/index.js';

const { version } = JSON.parse(readAsset('package.json', '../package.json'));

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => s => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const blue = paint('34');
const magenta = paint('35');
const cyan = paint('36');
const methodColor = { GET: green, POST: blue, PUT: yellow, PATCH: magenta, DELETE: red };

const HELP = `
  ${bold('ApiMoketto')} ${dim('v' + version)}  fake REST APIs for frontend development

  ${bold('Usage')}
    apimoketto [file] [options]  start the server (default file: mock.json)
    apimoketto init [file]       write a sample config file
    apimoketto import <files...> turn source code into resources

  ${bold('Options')}
    -c, --config <file>          config file to use (default: mock.json)
    -f, --from <type>            what to import from (${importers.map(i => i.id).join(', ')}), guessed from the extension if left out
    -n, --count <rows>           rows to generate when importing (default: 10)
    -p, --port <port>            port to listen on (default: config, PORT env or 3000)
    -H, --host <host>            interface to bind (default: all interfaces)
    -o, --open                   open the admin UI in your browser
    -q, --quiet                  do not print requests
    -h, --help                   show this help
    -v, --version                show the version
`;

function fail(message) {
  console.error(red('error') + ' ' + message);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      count: { type: 'string', short: 'n' },
      from: { type: 'string', short: 'f' },
      port: { type: 'string', short: 'p' },
      host: { type: 'string', short: 'H' },
      open: { type: 'boolean', short: 'o' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' }
    }
  });
} catch (e) {
  fail(e.message);
}

const { values, positionals } = args;

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.version) {
  console.log(version);
  process.exit(0);
}

if (positionals[0] === 'init') {
  const target = path.resolve(positionals[1] || 'mock.json');
  if (fs.existsSync(target)) fail(`${target} already exists`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(normalize(sampleConfig()), null, 2) + '\n');
  console.log(green('created') + ' ' + target);
  process.exit(0);
}

if (positionals[0] === 'import') {
  const files = positionals.slice(1);
  if (!files.length) fail(`give it at least one file, e.g. ${bold('apimoketto import User.java')}`);
  const known = importers.map(i => `${i.id} (${i.extensions.join(', ')})`).join(', ');
  let importer = null;
  if (values.from) {
    importer = findImporter(values.from);
    if (!importer) fail(`there's no importer called "${values.from}", try one of: ${known}`);
  } else {
    const kinds = new Set(files.map(f => (importerFor(f) || {}).id));
    if (kinds.size !== 1 || kinds.has(undefined)) fail(`can't tell what to import these as, pass ${bold('--from')} with one of: ${known}`);
    importer = findImporter([...kinds][0]);
  }
  const sources = files.map(f => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      fail(`could not read ${f}`);
    }
  });
  let imported;
  try {
    imported = importer.run(sources, { count: values.count ?? 10 });
  } catch (e) {
    fail(e.message);
  }
  const target = new Store(values.config || 'mock.json');
  if (fs.existsSync(target.file)) {
    try {
      target.load();
    } catch (e) {
      fail(`could not read ${target.file}\n      ${e.message}`);
    }
  }
  const resources = target.config.resources.slice();
  for (const r of imported) {
    const i = resources.findIndex(x => x.path === r.path);
    const entry = { ...(i === -1 ? {} : resources[i]), name: r.name, path: r.path, idField: r.idField, data: r.data };
    if (i === -1) resources.push(entry);
    else resources[i] = entry;
    console.log(`${green(i === -1 ? 'added   ' : 'replaced')} ${bold(r.path)} ${dim(`from ${r.source}, ${r.data.length} rows`)}`);
    for (const note of r.notes) console.log(`         ${yellow('!')} ${note}`);
  }
  target.save({ ...target.config, resources });
  console.log(dim(`saved to ${target.file}`));
  process.exit(0);
}

const store = new Store(positionals[0] || values.config || 'mock.json');
const created = !fs.existsSync(store.file);
try {
  store.load();
} catch (e) {
  fail(`could not read ${store.file}\n      ${e.message}`);
}
store.watch();

const time = () => dim(new Date().toTimeString().slice(0, 8));

store.on('reload', () => console.log(`${time()} ${cyan('config reloaded from disk')}`));
store.on('invalid', e => console.log(`${time()} ${yellow('config file is invalid, keeping the previous version:')} ${e.message}`));

function printEntry(e) {
  const statusColor = e.status >= 500 ? red : e.status >= 400 ? yellow : e.status >= 300 ? cyan : green;
  const method = (methodColor[e.method] || dim)(e.method.padEnd(7));
  const source = e.source ? dim('-> ' + e.source.label + (e.source.failed ? ' (simulated failure)' : '')) : red('no match');
  console.log(`${time()} ${method}${e.path} ${statusColor(e.status)} ${dim(e.ms + 'ms')} ${source}`);
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] :
    process.platform === 'darwin' ? ['open', [url]] :
    ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
  } catch {}
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

const port = Number(values.port ?? process.env.PORT ?? store.config.settings.port ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port "${values.port ?? process.env.PORT}"`);

const { server } = createServer(store, { logger: values.quiet ? null : printEntry });

server.on('error', e => {
  if (e.code === 'EADDRINUSE') fail(`port ${port} is already in use, try ${bold('apimoketto -p ' + (port + 1))}`);
  if (e.code === 'EACCES') fail(`no permission to use port ${port}`);
  fail(e.message);
});

server.listen(port, values.host, () => {
  const actual = server.address().port;
  const local = `http://localhost:${actual}`;
  const { routes, resources, settings } = store.config;
  const lines = [
    '',
    `  ${bold(magenta('ApiMoketto'))} ${dim('v' + version)}`,
    '',
    `  ${dim('API    ')} ${bold(local)}`,
    ...(values.host && values.host !== '0.0.0.0' && values.host !== '::' ? [] : lanAddresses().map(ip => `  ${dim('Network')} http://${ip}:${actual}`)),
    `  ${dim('Admin  ')} ${cyan(local + ADMIN)}`,
    `  ${dim('Config ')} ${store.file}${created ? green(' (created)') : ''}`,
    '',
    `  ${dim(`${routes.length} routes, ${resources.length} resources, CORS ${settings.cors ? 'on' : 'off'}`)}`,
    ''
  ];
  console.log(lines.join('\n'));
  if (values.open) openBrowser(local + ADMIN);
});

const shutdown = () => {
  console.log(dim('\n  bye'));
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
