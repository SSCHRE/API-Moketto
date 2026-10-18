import http from 'node:http';
import crypto from 'node:crypto';
import { match } from './router.js';
import { render, renderString } from './template.js';
import { newId } from './store.js';
import { readAsset } from './assets.js';
import { findImporter, describeImporters } from './importers/index.js';

export const ADMIN = '/admin';

const ADMIN_HTML = readAsset('admin.html', './admin.html');
const MAX_BODY = 10 * 1024 * 1024;
const LOG_SIZE = 300;
const CLIP = 20000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clip = s => (s && s.length > CLIP ? s.slice(0, CLIP) + '\n... truncated' : s || '');
const err = (status, message) => ({ status, headers: {}, body: { error: message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw, type = '') {
  if (!raw) return undefined;
  if (type.includes('json') || /^\s*[[{"]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

function queryObject(search) {
  const out = {};
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    'Access-Control-Allow-Origin': origin || '*',
    ...(origin ? { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
    'Access-Control-Expose-Headers': 'X-Total-Count, Location, Link, ETag',
    'Access-Control-Max-Age': '600'
  };
}

function serialize(body, headers) {
  if (body === null || body === undefined) return '';
  const hasType = Object.keys(headers).some(k => k.toLowerCase() === 'content-type');
  if (typeof body === 'string') {
    if (!hasType) headers['Content-Type'] = 'text/plain; charset=utf-8';
    return body;
  }
  if (!hasType) headers['Content-Type'] = 'application/json; charset=utf-8';
  return JSON.stringify(body, null, 2);
}

const getField = (obj, field) => field.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);

function test(value, op, expected) {
  const n = Number(expected);
  const numeric = typeof value === 'number' && expected !== '' && !Number.isNaN(n);
  const str = value == null ? '' : String(value);
  switch (op) {
    case 'eq':
      return Array.isArray(value) ? value.some(v => String(v) === expected) : str === expected;
    case 'ne':
      return str !== expected;
    case 'like':
      return str.toLowerCase().includes(expected.toLowerCase());
    case 'gt':
      return numeric ? value > n : str > expected;
    case 'gte':
      return numeric ? value >= n : str >= expected;
    case 'lt':
      return numeric ? value < n : str < expected;
    case 'lte':
      return numeric ? value <= n : str <= expected;
  }
  return true;
}

function list(items, search) {
  let out = items.slice();
  const q = search.get('q');
  if (q) out = out.filter(x => JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));
  for (const key of new Set(search.keys())) {
    if (key.startsWith('_') || key === 'q') continue;
    const values = search.getAll(key);
    const m = /^(.+)_(ne|gte|lte|gt|lt|like)$/.exec(key);
    const field = m ? m[1] : key;
    const op = m ? m[2] : 'eq';
    out = out.filter(x => {
      const v = getField(x, field);
      return op === 'ne' ? values.every(e => test(v, op, e)) : values.some(e => test(v, op, e));
    });
  }
  const sort = search.get('_sort');
  if (sort) {
    const fields = sort.split(',').map(s => s.trim()).filter(Boolean);
    const orders = (search.get('_order') || '').split(',');
    out.sort((a, b) => {
      for (let i = 0; i < fields.length; i++) {
        let f = fields[i];
        let dir = (orders[i] || orders[0] || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1;
        if (f.startsWith('-')) {
          f = f.slice(1);
          dir = -1;
        }
        const x = getField(a, f);
        const y = getField(b, f);
        if (x === y) continue;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        if (c) return c * dir;
      }
      return 0;
    });
  }
  const headers = { 'X-Total-Count': String(out.length) };
  const int = k => parseInt(search.get(k), 10);
  const start = int('_start');
  const end = int('_end');
  const page = int('_page');
  const limit = int('_limit') || int('_per_page');
  if (!Number.isNaN(start) || !Number.isNaN(end)) {
    out = out.slice(Number.isNaN(start) ? 0 : start, Number.isNaN(end) ? undefined : end);
  } else if (!Number.isNaN(page) || !Number.isNaN(limit)) {
    const size = Number.isNaN(limit) ? 10 : Math.max(1, limit);
    const p = Number.isNaN(page) ? 1 : Math.max(1, page);
    out = out.slice((p - 1) * size, p * size);
  }
  return { status: 200, headers, body: out };
}

function nextId(items, key) {
  const ids = items.filter(isObj).map(x => x[key]);
  if (ids.length && ids.every(v => typeof v === 'number' || /^\d+$/.test(String(v)))) {
    const max = Math.max(...ids.map(Number));
    return typeof ids[0] === 'number' ? max + 1 : String(max + 1);
  }
  if (!ids.length) return 1;
  return crypto.randomUUID();
}

export function createServer(store, { logger } = {}) {
  const log = [];
  const clients = new Set();

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };

  store.on('change', cfg => broadcast('config', cfg));
  store.on('invalid', e => broadcast('invalid', { message: e.message }));

  function matchRoute(method, pathname, ctx) {
    for (const r of store.sorted) {
      if (!r.enabled) continue;
      if (r.method !== 'ANY' && r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = match(r.path, pathname);
      if (!params) continue;
      ctx.params = params;
      const source = { type: 'route', id: r.id, label: r.name || `${r.method} ${r.path}` };
      if (r.failRate > 0 && Math.random() < r.failRate) {
        return { status: r.failStatus, headers: {}, body: { error: 'Simulated failure', route: r.path }, delay: r.delay, source: { ...source, failed: true } };
      }
      const headers = Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, renderString(v, ctx)]));
      return { status: r.status, headers, body: render(r.body, ctx), delay: r.delay, source };
    }
    return null;
  }

  function crud(r, method, id, pathname, search, body) {
    const items = store.live.get(r.path) || [];
    const key = r.idField;
    const changed = () => {
      store.persist(r.path);
      broadcast('data', { path: r.path });
    };
    if (id === null) {
      if (method === 'GET' || method === 'HEAD') return list(items, search);
      if (method === 'POST') {
        if (!isObj(body)) return err(400, 'Request body must be a JSON object');
        const entry = { ...body };
        if (entry[key] === undefined || entry[key] === null || entry[key] === '') entry[key] = nextId(items, key);
        else if (items.some(x => isObj(x) && String(x[key]) === String(entry[key]))) return err(409, `${r.name} with ${key} ${entry[key]} already exists`);
        items.push(entry);
        changed();
        return { status: 201, headers: { Location: `${pathname}/${encodeURIComponent(entry[key])}` }, body: entry };
      }
      return { ...err(405, `${method} is not allowed on a collection`), headers: { Allow: 'GET, HEAD, POST' } };
    }
    const index = items.findIndex(x => isObj(x) && String(x[key]) === String(id));
    if (index === -1) return err(404, `${r.name} with ${key} ${id} not found`);
    const current = items[index];
    switch (method) {
      case 'GET':
      case 'HEAD':
        return { status: 200, headers: {}, body: current };
      case 'PUT':
        if (!isObj(body)) return err(400, 'Request body must be a JSON object');
        items[index] = { ...body, [key]: current[key] };
        changed();
        return { status: 200, headers: {}, body: items[index] };
      case 'PATCH':
        if (!isObj(body)) return err(400, 'Request body must be a JSON object');
        items[index] = { ...current, ...body, [key]: current[key] };
        changed();
        return { status: 200, headers: {}, body: items[index] };
      case 'DELETE':
        items.splice(index, 1);
        changed();
        return { status: 200, headers: {}, body: current };
    }
    return { ...err(405, `${method} is not allowed on an item`), headers: { Allow: 'GET, HEAD, PUT, PATCH, DELETE' } };
  }

  function matchResource(method, pathname, search, ctx) {
    for (const r of store.config.resources) {
      if (!r.enabled) continue;
      const base = match(r.path, pathname);
      const item = base ? null : match(r.path + '/:__id', pathname);
      if (!base && !item) continue;
      const params = { ...(base || item) };
      const id = item ? params.__id : null;
      delete params.__id;
      ctx.params = params;
      return { ...crud(r, method, id, pathname.replace(/\/+$/, ''), search, ctx.body), source: { type: 'resource', id: r.id, label: r.name } };
    }
    return null;
  }

  async function admin(req, res, url) {
    const sub = url.pathname.slice(ADMIN.length).replace(/\/+$/, '') || '/';
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    const route = `${req.method} ${sub}`;
    if (sub === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(ADMIN_HTML);
    }
    if (route === 'GET /api/state') return send(200, { config: store.config, file: store.file, admin: ADMIN });
    if (route === 'PUT /api/config') {
      let cfg;
      try {
        cfg = JSON.parse(await readBody(req));
      } catch {
        return send(400, { error: 'Invalid JSON' });
      }
      try {
        return send(200, { config: store.save(cfg) });
      } catch (e) {
        return send(500, { error: e.message });
      }
    }
    if (route === 'GET /api/importers') return send(200, describeImporters());
    const importRoute = req.method === 'POST' && /^\/api\/import\/([\w-]+)$/.exec(sub);
    if (importRoute) {
      const importer = findImporter(importRoute[1]);
      if (!importer) return send(404, { error: `There's no importer called "${importRoute[1]}"` });
      let input;
      try {
        input = JSON.parse(await readBody(req));
      } catch {
        return send(400, { error: 'Invalid JSON' });
      }
      try {
        return send(200, { resources: importer.run(input.source || '', { count: input.count }) });
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    if (route === 'GET /api/log') return send(200, log);
    if (route === 'DELETE /api/log') {
      log.length = 0;
      broadcast('clear', {});
      return send(200, { ok: true });
    }
    if (route === 'GET /api/data') {
      const p = url.searchParams.get('path');
      if (!store.live.has(p)) return send(404, { error: 'Unknown resource' });
      return send(200, store.live.get(p));
    }
    if (route === 'POST /api/reset') {
      const p = url.searchParams.get('path');
      if (!store.reset(p)) return send(404, { error: 'Unknown resource' });
      broadcast('data', { path: p });
      return send(200, { ok: true });
    }
    if (route === 'GET /api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1500\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    return send(404, { error: 'Not found' });
  }

  async function handle(req, res) {
    const started = performance.now();
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (pathname === ADMIN || pathname.startsWith(ADMIN + '/')) return admin(req, res, url);

    const { settings } = store.config;
    const cors = settings.cors ? corsHeaders(req) : {};
    if (req.method === 'OPTIONS' && settings.cors && req.headers['access-control-request-method']) {
      res.writeHead(204, cors);
      return res.end();
    }

    const raw = await readBody(req);
    const ctx = {
      method: req.method,
      path: pathname,
      params: {},
      query: queryObject(url.searchParams),
      headers: req.headers,
      body: parseBody(raw, req.headers['content-type'])
    };

    const result =
      matchRoute(req.method, pathname, ctx) ||
      matchResource(req.method, pathname, url.searchParams, ctx) ||
      { status: 404, headers: {}, body: { error: 'No mock matches this request', method: req.method, path: pathname }, source: null };

    const wait = settings.delay + (result.delay || 0);
    if (wait > 0) await sleep(wait);

    const headers = { ...cors, ...result.headers };
    if (settings.cors && Object.keys(result.headers).length) {
      const exposed = new Set([...headers['Access-Control-Expose-Headers'].split(', '), ...Object.keys(result.headers)].map(h => h.toLowerCase()));
      headers['Access-Control-Expose-Headers'] = [...exposed].join(', ');
    }
    const payload = serialize(result.body, headers);
    const noBody = req.method === 'HEAD' || result.status === 204 || result.status === 304;
    res.writeHead(result.status, headers);
    res.end(noBody ? undefined : payload);

    const entry = {
      id: newId(),
      time: Date.now(),
      method: req.method,
      path: pathname + url.search,
      status: result.status,
      ms: Math.round(performance.now() - started),
      source: result.source,
      request: { headers: req.headers, body: clip(raw) },
      response: { headers, body: noBody ? '' : clip(payload) }
    };
    log.unshift(entry);
    if (log.length > LOG_SIZE) log.pop();
    broadcast('log', entry);
    if (logger) logger(entry);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Mock server error', message: e.message }));
    });
  });

  return { server, log };
}
