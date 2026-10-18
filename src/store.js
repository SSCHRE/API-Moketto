import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { routeScore } from './router.js';

export const METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const newId = () => crypto.randomBytes(6).toString('hex');

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const num = (v, d) => {
  const n = Number(v);
  return v !== '' && v !== null && Number.isFinite(n) ? n : d;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizePath(p) {
  let s = String(p ?? '').trim().replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s;
}

export function normalize(cfg) {
  const c = isObj(cfg) ? cfg : {};
  const s = isObj(c.settings) ? c.settings : {};
  const settings = {
    port: clamp(Math.round(num(s.port, 3000)), 0, 65535),
    cors: s.cors !== false,
    delay: Math.max(0, num(s.delay, 0))
  };
  const routes = (Array.isArray(c.routes) ? c.routes : []).filter(isObj).map(r => {
    const method = String(r.method || 'GET').toUpperCase();
    return {
      id: String(r.id || newId()),
      name: String(r.name || ''),
      method: METHODS.includes(method) ? method : 'GET',
      path: normalizePath(r.path),
      status: clamp(Math.round(num(r.status, 200)), 100, 599),
      delay: Math.max(0, num(r.delay, 0)),
      failRate: clamp(num(r.failRate, 0), 0, 1),
      failStatus: clamp(Math.round(num(r.failStatus, 500)), 100, 599),
      enabled: r.enabled !== false,
      headers: isObj(r.headers) ? Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, String(v)])) : {},
      body: r.body === undefined ? null : r.body
    };
  });
  const resources = (Array.isArray(c.resources) ? c.resources : []).filter(isObj).map(r => {
    const p = normalizePath(r.path || r.name);
    return {
      id: String(r.id || newId()),
      name: String(r.name || p.split('/').pop() || 'items'),
      path: p,
      idField: String(r.idField || 'id'),
      persist: r.persist === true,
      enabled: r.enabled !== false,
      data: Array.isArray(r.data) ? r.data : []
    };
  });
  return { settings, routes, resources };
}

export function sampleConfig() {
  return {
    settings: { port: 3000, cors: true, delay: 0 },
    routes: [
      {
        name: 'Health check',
        method: 'GET',
        path: '/api/health',
        body: { status: 'ok', time: '{{now}}' }
      },
      {
        name: 'Login',
        method: 'POST',
        path: '/api/auth/login',
        delay: 300,
        body: { token: '{{uuid}}', user: { email: '{{body.email || "guest@example.com"}}', name: '{{fullName}}' } }
      },
      {
        name: 'Current user',
        method: 'GET',
        path: '/api/me',
        headers: { 'Cache-Control': 'no-store' },
        body: { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' }
      },
      {
        name: 'Generated feed',
        method: 'GET',
        path: '/api/feed',
        body: {
          page: '{{int(query.page || 1)}}',
          items: {
            $repeat: '{{query.limit || 5}}',
            $item: {
              id: '{{uuid}}',
              position: '{{add(index, 1)}}',
              author: '{{fullName}}',
              text: '{{lorem(12)}}',
              likes: '{{randomInt(0, 500)}}',
              createdAt: '{{date(-3)}}'
            }
          }
        }
      },
      {
        name: 'Flaky endpoint',
        method: 'GET',
        path: '/api/flaky',
        failRate: 0.3,
        failStatus: 503,
        body: { message: 'Lucky you, it worked' }
      },
      {
        name: 'Echo',
        method: 'ANY',
        path: '/api/echo/*',
        body: { method: '{{method}}', path: '{{path}}', rest: '{{params.wildcard}}', query: '{{query}}', body: '{{body}}' }
      }
    ],
    resources: [
      {
        name: 'users',
        path: '/api/users',
        data: [
          { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
          { id: 2, name: 'Alan Turing', email: 'alan@example.com', role: 'user' },
          { id: 3, name: 'Grace Hopper', email: 'grace@example.com', role: 'user' }
        ]
      },
      {
        name: 'todos',
        path: '/api/todos',
        data: [
          { id: 1, title: 'Build the login page', done: true, userId: 1 },
          { id: 2, title: 'Wire up the dashboard', done: false, userId: 1 },
          { id: 3, title: 'Write some tests', done: false, userId: 2 }
        ]
      }
    ]
  };
}

const compareScore = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

export class Store extends EventEmitter {
  constructor(file) {
    super();
    this.file = path.resolve(file);
    this.raw = null;
    this.config = normalize({});
    this.live = new Map();
    this.sorted = [];
  }

  load() {
    if (!fs.existsSync(this.file)) this.write(normalize(sampleConfig()));
    const raw = fs.readFileSync(this.file, 'utf8');
    this.raw = raw;
    this.apply(JSON.parse(raw.replace(/^\uFEFF/, '')));
  }

  apply(cfg) {
    const next = normalize(cfg);
    const seeds = new Map(this.config.resources.map(r => [r.path, JSON.stringify(r.data)]));
    const live = new Map();
    for (const r of next.resources) {
      const keep = this.live.has(r.path) && seeds.get(r.path) === JSON.stringify(r.data);
      live.set(r.path, keep ? this.live.get(r.path) : structuredClone(r.data));
    }
    this.live = live;
    this.config = next;
    this.sorted = next.routes
      .map((route, index) => ({ route, index, score: routeScore(route.path) }))
      .sort((a, b) => compareScore(a.score, b.score) || a.index - b.index)
      .map(x => x.route);
    this.emit('change', next);
    return next;
  }

  write(cfg) {
    const text = JSON.stringify(cfg, null, 2) + '\n';
    this.raw = text;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, text);
  }

  save(cfg) {
    const next = normalize(cfg);
    this.write(next);
    return this.apply(next);
  }

  persist(resourcePath) {
    const r = this.config.resources.find(x => x.path === resourcePath);
    if (!r || !r.persist) return;
    r.data = structuredClone(this.live.get(resourcePath));
    this.write(this.config);
  }

  reset(resourcePath) {
    const r = this.config.resources.find(x => x.path === resourcePath);
    if (!r) return false;
    this.live.set(r.path, structuredClone(r.data));
    return true;
  }

  watch() {
    const dir = path.dirname(this.file);
    const base = path.basename(this.file);
    let timer;
    try {
      this.watcher = fs.watch(dir, (_, name) => {
        if (name && name !== base) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.reload(), 120);
      });
      this.watcher.on('error', () => {});
    } catch {}
  }

  reload() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return;
    }
    if (raw === this.raw) return;
    this.raw = raw;
    try {
      this.apply(JSON.parse(raw.replace(/^\uFEFF/, '')));
      this.emit('reload');
    } catch (e) {
      this.emit('invalid', e);
    }
  }
}
