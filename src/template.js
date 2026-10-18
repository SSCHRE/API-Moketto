import crypto from 'node:crypto';

const FIRST = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Ken', 'Barbara', 'Dennis', 'Radia', 'Tim', 'Hedy', 'Guido', 'Frances', 'John', 'Katherine', 'Edsger'];
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Thompson', 'Liskov', 'Ritchie', 'Perlman', 'Berners-Lee', 'Lamarr', 'Rossum', 'Allen', 'Backus', 'Johnson', 'Dijkstra'];
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(' ');

const pick = list => list[Math.floor(Math.random() * list.length)];
const randomInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const helpers = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  timestamp: () => Date.now(),
  date: (days = 0) => new Date(Date.now() + toNumber(days) * 86400000).toISOString(),
  int: v => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  },
  float: v => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  },
  string: v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)),
  add: (...xs) => xs.reduce((sum, x) => sum + toNumber(x), 0),
  randomInt: (a = 0, b = 100) => randomInt(toNumber(a), toNumber(b, 100)),
  randomFloat: (a = 0, b = 1, d = 2) => Number((Math.random() * (toNumber(b, 1) - toNumber(a)) + toNumber(a)).toFixed(toNumber(d, 2))),
  randomBool: () => Math.random() < 0.5,
  pick: (...xs) => pick(xs),
  firstName: () => pick(FIRST),
  lastName: () => pick(LAST),
  fullName: () => `${pick(FIRST)} ${pick(LAST)}`,
  email: () => `${pick(FIRST)}.${pick(LAST)}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
  lorem: (n = 8) => Array.from({ length: Math.max(1, toNumber(n, 8)) }, () => pick(WORDS)).join(' '),
  upper: v => String(v ?? '').toUpperCase(),
  lower: v => String(v ?? '').toLowerCase(),
  json: v => JSON.stringify(v ?? null)
};

function splitTop(src, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && src.startsWith(sep, i)) {
      out.push(src.slice(last, i));
      last = i + sep.length;
      i += sep.length - 1;
    }
  }
  out.push(src.slice(last));
  return out;
}

function resolve(ctx, expr) {
  const parts = expr.match(/[^.[\]]+/g) || [];
  let cur = ctx;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const key = part.replace(/^['"]|['"]$/g, '');
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function evaluate(expr, ctx) {
  const src = expr.trim();
  if (!src) return undefined;
  const alternatives = splitTop(src, '||');
  if (alternatives.length > 1) {
    let value;
    for (const alt of alternatives) {
      value = evaluate(alt, ctx);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return value;
  }
  const call = /^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/.exec(src);
  if (call && Object.hasOwn(helpers, call[1])) {
    const args = call[2].trim() ? splitTop(call[2], ',').map(a => evaluate(a, ctx)) : [];
    return helpers[call[1]](...args);
  }
  if (Object.hasOwn(helpers, src)) return helpers[src]();
  if (/^(["'])[\s\S]*\1$/.test(src)) return src.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(src)) return Number(src);
  if (src === 'true') return true;
  if (src === 'false') return false;
  if (src === 'null') return null;
  return resolve(ctx, src);
}

const FULL = /^\{\{((?:(?!\{\{|\}\})[\s\S])+)\}\}$/;
const ANY = /\{\{((?:(?!\{\{|\}\})[\s\S])+)\}\}/g;

const stringify = v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function renderString(value, ctx) {
  return String(value).replace(ANY, (_, expr) => stringify(evaluate(expr, ctx)));
}

export function render(value, ctx) {
  if (typeof value === 'string') {
    const full = FULL.exec(value.trim());
    if (full) {
      const v = evaluate(full[1], ctx);
      return v === undefined ? null : v;
    }
    return renderString(value, ctx);
  }
  if (Array.isArray(value)) return value.map(v => render(v, ctx));
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, '$repeat')) {
      let n = value.$repeat;
      n = Array.isArray(n) ? randomInt(toNumber(n[0]), toNumber(n[1])) : toNumber(render(n, ctx));
      n = Math.max(0, Math.min(1000, Math.floor(n)));
      const item = Object.hasOwn(value, '$item') ? value.$item : null;
      return Array.from({ length: n }, (_, index) => render(item, { ...ctx, index }));
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [renderString(k, ctx), render(v, ctx)]));
  }
  return value;
}
