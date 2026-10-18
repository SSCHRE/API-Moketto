const cache = new Map();

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const safeDecode = s => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function compile(pattern) {
  let hit = cache.get(pattern);
  if (hit) return hit;
  const keys = [];
  const parts = pattern.split('/').filter(Boolean).map(seg => {
    if (seg === '*') {
      keys.push('wildcard');
      return '(?:/(.*))?';
    }
    if (seg.startsWith(':')) {
      const optional = seg.endsWith('?');
      keys.push(seg.slice(1, optional ? -1 : undefined));
      return optional ? '(?:/([^/]+))?' : '/([^/]+)';
    }
    return '/' + escapeRe(seg);
  });
  hit = { re: new RegExp('^' + (parts.join('') || '/?') + '/?$', 'i'), keys };
  cache.set(pattern, hit);
  return hit;
}

export function match(pattern, pathname) {
  const { re, keys } = compile(pattern);
  const m = re.exec(pathname);
  if (!m) return null;
  const params = {};
  keys.forEach((key, i) => {
    if (m[i + 1] !== undefined) params[key] = safeDecode(m[i + 1]);
  });
  return params;
}

export function routeScore(pattern) {
  const segs = pattern.split('/').filter(Boolean);
  return [
    segs.filter(s => s === '*').length,
    segs.filter(s => s.startsWith(':')).length,
    -segs.length
  ];
}
