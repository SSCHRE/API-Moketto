import { helpers } from '../template.js';

const SKIP = Symbol('skip');
const MODIFIERS = /\b(public|private|protected|static|final|transient|volatile|abstract|synchronized|native|default|sealed|non-sealed|strictfp)\b/g;
const COLLECTIONS = new Set(['List', 'Set', 'Collection', 'ArrayList', 'LinkedList', 'HashSet', 'LinkedHashSet', 'TreeSet', 'SortedSet', 'Iterable', 'Queue', 'Deque']);
const MAPS = new Set(['Map', 'HashMap', 'LinkedHashMap', 'TreeMap', 'SortedMap', 'ConcurrentHashMap']);
const INTS = new Set(['int', 'Integer', 'long', 'Long', 'short', 'Short', 'byte', 'Byte', 'BigInteger', 'AtomicInteger', 'AtomicLong']);
const DECIMALS = new Set(['double', 'Double', 'float', 'Float', 'BigDecimal']);
const BOOLS = new Set(['boolean', 'Boolean']);
const STRINGS = new Set(['String', 'CharSequence', 'StringBuilder']);
const DATES = { LocalDate: 'date', LocalDateTime: 'datetime', LocalTime: 'time', OffsetTime: 'time', Instant: 'instant', ZonedDateTime: 'instant', OffsetDateTime: 'instant', Date: 'instant', Timestamp: 'instant', Calendar: 'instant', YearMonth: 'yearmonth', Year: 'year' };
const ENTITY = ['Entity', 'Document', 'Table'];

const ADJECTIVES = ['Classic', 'Compact', 'Deluxe', 'Ergonomic', 'Handmade', 'Lightweight', 'Modern', 'Organic', 'Premium', 'Rustic', 'Sleek', 'Vintage', 'Wireless', 'Smart'];
const NOUNS = ['Backpack', 'Chair', 'Desk Lamp', 'Headphones', 'Kettle', 'Keyboard', 'Mug', 'Notebook', 'Sneakers', 'Speaker', 'Sunglasses', 'Watch', 'Water Bottle', 'Jacket'];
const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Park Rd', 'Elm St', 'Lake View', 'Hill St', 'River Rd', 'Station Rd'];
const CITIES = ['Amsterdam', 'Berlin', 'Lisbon', 'London', 'Madrid', 'Milan', 'New York', 'Oslo', 'Paris', 'Prague', 'Seattle', 'Tokyo', 'Toronto', 'Vienna'];
const COUNTRIES = [['Germany', 'DE'], ['France', 'FR'], ['Italy', 'IT'], ['Spain', 'ES'], ['Netherlands', 'NL'], ['United Kingdom', 'GB'], ['United States', 'US'], ['Canada', 'CA'], ['Japan', 'JP'], ['Portugal', 'PT']];
const REGIONS = ['Bavaria', 'California', 'Ontario', 'Catalonia', 'Lombardy', 'Texas', 'Queensland', 'Île-de-France'];
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Ltd', 'Stark Industries', 'Wayne Enterprises', 'Hooli', 'Vandelay Industries', 'Soylent', 'Wonka Ltd'];
const JOBS = ['Software Engineer', 'Product Manager', 'Designer', 'Data Analyst', 'Accountant', 'Sales Manager', 'Support Specialist', 'Marketing Lead'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Support', 'Operations', 'HR'];
const CATEGORIES = ['Books', 'Electronics', 'Garden', 'Home', 'Sports', 'Toys', 'Clothing', 'Food'];
const PERSONISH = /user|person|customer|employee|author|member|account|client|owner|student|patient|contact|profile|driver|teacher|staff|player|admin|people|guest|subscriber|candidate|applicant|doctor|agent/i;
const PRODUCTISH = /product|item|article|merch|good|offer|listing/i;

const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = list => list[Math.floor(Math.random() * list.length)];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const words = name => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
const kebab = name => words(name).join('-');
const label = name => cap(words(name).join(' '));
const num = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

function skipString(src, i) {
  if (src.startsWith('"""', i)) {
    const end = src.indexOf('"""', i + 3);
    return end === -1 ? src.length : end + 3;
  }
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === quote || src[j] === '\n') return j + 1;
  }
  return src.length;
}

function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
      out += ' ';
    } else if (c === '"' || c === "'") {
      const end = skipString(src, i);
      out += src.slice(i, end);
      i = end - 1;
    } else out += c;
  }
  return out;
}

function closing(src, open, openChar = '{', closeChar = '}') {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = skipString(src, i) - 1;
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar && --depth === 0) return i;
  }
  return src.length;
}

function splitTop(src, sep) {
  const out = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = skipString(src, i) - 1;
      continue;
    }
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    else if (c === sep && depth === 0) {
      out.push(src.slice(last, i));
      last = i + 1;
    }
  }
  out.push(src.slice(last));
  return out.map(s => s.trim()).filter(Boolean);
}

function annotations(text) {
  const list = [];
  let rest = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '@' && /[A-Za-z_$]/.test(text[i + 1] || '') && !text.startsWith('@interface', i)) {
      let j = i + 1;
      while (j < text.length && /[\w$.]/.test(text[j])) j++;
      const name = text.slice(i + 1, j).split('.').pop();
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;
      let args = '';
      if (text[k] === '(') {
        const end = closing(text, k, '(', ')');
        args = text.slice(k + 1, end);
        j = end + 1;
      }
      list.push({ name, args });
      rest += ' ';
      i = j;
    } else if (c === '"' || c === "'") {
      const end = skipString(text, i);
      rest += text.slice(i, end);
      i = end;
    } else {
      rest += c;
      i++;
    }
  }
  return { list, rest };
}

const has = (anns, ...names) => anns.some(a => names.includes(a.name));
const get = (anns, name) => anns.find(a => a.name === name);

function literal(s) {
  const v = s.trim();
  if (v.startsWith('"')) return v.slice(1, -1);
  const n = Number(v.replace(/[lLdDfF]$/, ''));
  return Number.isNaN(n) ? v : n;
}

function attr(a, key) {
  if (!a || !a.args.trim()) return undefined;
  const m = new RegExp(`\\b${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|[^,)]+)`).exec(a.args);
  if (m) return literal(m[1]);
  if (key === 'value' && !/^\s*\w+\s*=/.test(a.args)) return literal(a.args);
  return undefined;
}

function scan(src, from, to, owner, classes) {
  let buf = '';
  let paren = 0;
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const end = skipString(src, i);
      buf += src.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === '(') paren++;
    else if (c === ')') paren--;
    if (paren === 0 && c === '{') {
      const end = closing(src, i);
      const decl = /\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/.exec(buf);
      if (decl && !/@interface\s*$/.test(buf.slice(0, decl.index))) declare(src, buf, decl, i, end, owner, classes);
      buf = '';
      i = end;
      continue;
    }
    if (paren === 0 && c === ';') {
      if (owner) owner.statements.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
}

function declare(src, header, decl, open, close, owner, classes) {
  const after = header.slice(decl.index);
  const info = {
    name: decl[2],
    kind: decl[1],
    annotations: annotations(header.slice(0, decl.index)).list,
    extends: decl[1] === 'class' ? ((/\bextends\s+([\w$.]+)/.exec(after) || [])[1] || '').split('.').pop() || null : null,
    top: !owner,
    statements: [],
    components: [],
    values: []
  };
  if (info.kind === 'record') {
    const start = after.indexOf('(');
    if (start !== -1) info.components = splitTop(after.slice(start + 1, closing(after, start, '(', ')')), ',');
  }
  if (info.kind === 'enum') {
    const body = src.slice(open + 1, close);
    const head = splitTop(body, ';')[0] || '';
    info.values = splitTop(head, ',').map(v => (/^([A-Za-z_$][\w$]*)/.exec(annotations(v).rest.trim()) || [])[1]).filter(Boolean);
  } else scan(src, open + 1, close, info, classes);
  if (!classes.has(info.name)) classes.set(info.name, info);
}

function parseField(stmt) {
  const { list, rest } = annotations(stmt);
  let text = rest.replace(/\s+/g, ' ').trim();
  const eq = text.indexOf('=');
  if (eq !== -1) text = text.slice(0, eq).trim();
  const isStatic = /\bstatic\b/.test(text);
  text = text.replace(MODIFIERS, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?)\s+([A-Za-z_$][\w$]*)\s*((?:\[\s*\])*)$/.exec(text);
  if (!m || /[()]/.test(m[1]) || /^(return|throw|package|import)$/.test(m[1])) return null;
  return { name: m[2], type: m[1].replace(/\s+/g, '') + m[3].replace(/\s+/g, ''), annotations: list, isStatic };
}

function typeInfo(t) {
  let array = 0;
  while (t.endsWith('[]')) {
    array++;
    t = t.slice(0, -2);
  }
  const g = t.indexOf('<');
  return {
    base: (g === -1 ? t : t.slice(0, g)).split('.').pop(),
    args: g === -1 ? [] : splitTop(t.slice(g + 1, t.lastIndexOf('>')), ','),
    array
  };
}

function fieldsOf(cls, ctx, seen = new Set()) {
  if (seen.has(cls.name)) return [];
  seen.add(cls.name);
  let fields = [];
  if (cls.extends) {
    const parent = ctx.classes.get(cls.extends);
    if (parent) fields = fieldsOf(parent, ctx, seen);
    else ctx.notes.add(`${cls.name} extends ${cls.extends}, which wasn't in the paste, so any fields it adds are missing. Paste it too if you need them.`);
  }
  const own = cls.kind === 'record' ? cls.components.map(parseField) : cls.statements.map(parseField);
  return fields.concat(own.filter(f => f && !f.isStatic));
}

const keyOf = f => {
  const v = attr(get(f.annotations, 'JsonProperty'), 'value');
  return typeof v === 'string' && v ? v : f.name;
};

function bounds(a, lo, hi) {
  const min = num(attr(get(a, 'Min'), 'value') ?? attr(get(a, 'DecimalMin'), 'value') ?? attr(get(a, 'Range'), 'min'));
  const max = num(attr(get(a, 'Max'), 'value') ?? attr(get(a, 'DecimalMax'), 'value') ?? attr(get(a, 'Range'), 'max'));
  if (has(a, 'Positive')) lo = Math.max(lo, 1);
  if (has(a, 'PositiveOrZero')) lo = Math.max(lo, 0);
  if (has(a, 'Negative')) [lo, hi] = [Math.min(lo, -1000), -1];
  if (min !== undefined) {
    lo = min;
    if (hi < lo) hi = lo + 100;
  }
  if (max !== undefined) {
    hi = max;
    if (lo > hi) lo = hi - 100;
  }
  return [lo, hi];
}

function intFor(name, a, ctx) {
  const w = words(name);
  const any = (...xs) => xs.some(x => w.includes(x));
  let r = [1, 1000];
  if (any('age')) r = [18, 80];
  else if (any('year')) r = [1990, 2025];
  else if (any('timestamp', 'millis', 'epoch')) return Date.now() - rint(0, 365 * 864e5);
  else if (w.length > 1 && w[w.length - 1] === 'id') r = [1, ctx.count];
  else if (any('quantity', 'qty', 'count', 'stock', 'inventory', 'units', 'amount')) r = [0, 100];
  else if (any('rating', 'stars')) r = [1, 5];
  else if (any('score', 'percent', 'percentage', 'discount', 'progress')) r = [0, 100];
  else if (any('priority', 'level', 'rank', 'tier')) r = [1, 5];
  else if (any('minutes', 'duration')) r = [5, 240];
  else if (any('seconds')) r = [1, 3600];
  else if (any('port')) r = [1024, 65535];
  else if (any('version')) r = [0, 5];
  else if (any('size', 'length', 'width', 'height', 'weight')) r = [1, 200];
  else if (any('salary', 'income', 'wage', 'compensation')) r = [30000, 150000];
  else if (any('price', 'cost', 'total', 'balance')) r = [1, 1000];
  const [lo, hi] = bounds(a, ...r);
  return rint(Math.ceil(lo), Math.floor(hi));
}

function decimalFor(name, a) {
  const w = words(name);
  const any = (...xs) => xs.some(x => w.includes(x));
  let r = [0, 1000];
  let digits = 2;
  if (any('lat', 'latitude')) [r, digits] = [[-90, 90], 6];
  else if (any('lng', 'lon', 'long', 'longitude')) [r, digits] = [[-180, 180], 6];
  else if (any('rating', 'stars')) [r, digits] = [[1, 5], 1];
  else if (any('tax', 'vat')) r = [0, 30];
  else if (any('percent', 'percentage', 'rate', 'discount', 'progress')) r = [0, 100];
  else if (any('weight')) r = [0.1, 100];
  else if (any('salary', 'income', 'wage', 'compensation')) r = [30000, 150000];
  else if (any('price', 'cost', 'amount', 'total', 'subtotal', 'fee', 'balance', 'budget', 'revenue')) r = [1, 1000];
  const [lo, hi] = bounds(a, ...r);
  return Number((Math.random() * (hi - lo) + lo).toFixed(digits));
}

function boolFor(name) {
  const w = words(name);
  const any = (...xs) => xs.some(x => w.includes(x));
  if (any('active', 'enabled', 'verified', 'visible', 'published', 'available', 'valid', 'confirmed', 'approved')) return Math.random() < 0.8;
  if (any('deleted', 'archived', 'locked', 'banned', 'blocked', 'disabled', 'expired', 'hidden', 'deprecated')) return Math.random() < 0.15;
  return Math.random() < 0.5;
}

function stringFor(name, a, ctx) {
  const w = words(name);
  const any = (...xs) => xs.some(x => w.includes(x));
  const p = ctx.person;
  const i = ctx.row;
  let s;
  if (has(a, 'Email') || any('email', 'mail')) {
    let base = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '');
    if (ctx.emails.has(base)) base += i + 1;
    ctx.emails.add(base);
    s = base + '@example.com';
  } else if ((any('first', 'given') && any('name')) || any('firstname', 'forename')) s = p.first;
  else if ((any('last', 'family') && any('name')) || any('lastname', 'surname')) s = p.last;
  else if (any('username', 'login', 'handle', 'nickname', 'nick') || (any('user') && any('name'))) s = `${p.first}${p.last.charAt(0)}${rint(1, 99)}`.toLowerCase();
  else if (any('fullname', 'author', 'assignee', 'recipient', 'sender') || (any('full', 'display', 'contact') && any('name')) || (name === 'name' && PERSONISH.test(ctx.owner)) || (any('owner') && !any('id'))) s = `${p.first} ${p.last}`;
  else if (any('company', 'organization', 'organisation', 'employer', 'vendor', 'supplier', 'manufacturer', 'brand', 'publisher')) s = pick(COMPANIES);
  else if (any('phone', 'mobile', 'tel', 'telephone', 'fax', 'cell')) s = `+1 555 ${rint(100, 999)} ${rint(1000, 9999)}`;
  else if (any('password', 'secret', 'hash', 'salt', 'token', 'pin')) s = '********';
  else if (any('iban')) s = `DE${rint(10, 99)} ${rint(1000, 9999)} ${rint(1000, 9999)} ${rint(1000, 9999)} ${rint(1000, 9999)} ${rint(10, 99)}`;
  else if (any('street', 'address', 'line1', 'line2')) s = `${rint(1, 999)} ${pick(STREETS)}`;
  else if (any('city', 'town')) s = pick(CITIES);
  else if (any('country')) s = any('code', 'iso') ? pick(COUNTRIES)[1] : pick(COUNTRIES)[0];
  else if (any('region', 'province', 'county') || (name === 'state')) s = pick(REGIONS);
  else if (any('zip', 'postal', 'postcode', 'zipcode')) s = String(rint(10000, 99999));
  else if (any('image', 'avatar', 'photo', 'picture', 'thumbnail', 'logo', 'icon', 'banner', 'cover')) s = `https://picsum.photos/seed/${kebab(ctx.owner)}-${i + 1}/400/300`;
  else if (any('url', 'website', 'link', 'homepage', 'site', 'href', 'uri')) s = `https://example.com/${kebab(ctx.owner)}/${i + 1}`;
  else if (any('uuid', 'guid')) s = helpers.uuid();
  else if (any('slug')) s = helpers.lorem(3).replace(/ /g, '-');
  else if (any('tag', 'keyword', 'label', 'topic', 'hashtag')) s = helpers.lorem(1);
  else if (any('job', 'occupation', 'profession')) s = pick(JOBS);
  else if (any('title', 'subject', 'headline', 'heading', 'caption')) s = cap(helpers.lorem(rint(2, 5)));
  else if (any('description', 'summary', 'bio', 'about', 'content', 'body', 'text', 'comment', 'message', 'note', 'notes', 'details', 'remarks', 'review', 'feedback', 'excerpt')) s = cap(helpers.lorem(rint(8, 20))) + '.';
  else if (any('sku', 'code', 'reference', 'ref', 'serial', 'barcode', 'number', 'isbn')) s = `${(w[0] === 'code' ? ctx.owner : w[0]).slice(0, 3).toUpperCase()}-${rint(10000, 99999)}`;
  else if (any('color', 'colour')) s = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  else if (any('currency')) s = pick(['EUR', 'USD', 'GBP', 'JPY', 'CHF']);
  else if (any('locale', 'language', 'lang')) s = pick(['en', 'de', 'fr', 'es', 'it', 'nl']);
  else if (any('timezone', 'tz')) s = pick(['Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC']);
  else if (any('status', 'state')) s = pick(['ACTIVE', 'PENDING', 'INACTIVE']);
  else if (any('role')) s = pick(['USER', 'ADMIN', 'EDITOR']);
  else if (any('category', 'genre')) s = pick(CATEGORIES);
  else if (any('type', 'kind', 'plan')) s = pick(['STANDARD', 'PREMIUM', 'BASIC']);
  else if (any('gender', 'sex')) s = pick(['FEMALE', 'MALE', 'OTHER']);
  else if (any('job', 'occupation', 'position', 'profession')) s = pick(JOBS);
  else if (any('department', 'team')) s = pick(DEPARTMENTS);
  else if (any('ip')) s = `192.168.${rint(0, 255)}.${rint(1, 254)}`;
  else if (any('date', 'day')) s = new Date(Date.now() - rint(0, 365) * 864e5).toISOString().slice(0, 10);
  else if (any('name')) {
    const rest = w.filter(x => x !== 'name').join(' ');
    s = !rest && PRODUCTISH.test(ctx.owner) ? `${pick(ADJECTIVES)} ${pick(NOUNS)}` : `${label(rest || ctx.owner)} ${i + 1}`;
  } else s = `${label(name)} ${i + 1}`;
  const max = num(attr(get(a, 'Size'), 'max') ?? attr(get(a, 'Length'), 'max') ?? attr(get(a, 'Column'), 'length'));
  return max !== undefined && max > 0 ? s.slice(0, max) : s;
}

function formatDate(d, pattern) {
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const parts = { yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()), HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), SSS: pad(d.getUTCMilliseconds(), 3) };
  return pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|SSS/g, (tok, quoted) => (quoted !== undefined ? quoted : parts[tok]));
}

function dateFor(name, kind, a) {
  const w = words(name);
  const any = (...xs) => xs.some(x => w.includes(x));
  let range = [-365, 0];
  if (any('birth', 'dob', 'birthday', 'born', 'birthdate')) range = [-80 * 365, -18 * 365];
  else if (has(a, 'Future', 'FutureOrPresent') || any('expires', 'expiry', 'expiration', 'due', 'deadline', 'until', 'end', 'ends', 'scheduled', 'next', 'valid')) range = [1, 365];
  else if (any('updated', 'modified', 'changed', 'last', 'seen')) range = [-30, 0];
  const d = new Date(Date.now() + (range[0] + Math.random() * (range[1] - range[0])) * 864e5);
  const pattern = attr(get(a, 'JsonFormat'), 'pattern');
  if (typeof pattern === 'string' && pattern) return formatDate(d, pattern);
  const iso = d.toISOString();
  if (kind === 'date') return iso.slice(0, 10);
  if (kind === 'datetime') return iso.slice(0, 19);
  if (kind === 'time') return iso.slice(11, 19);
  if (kind === 'yearmonth') return iso.slice(0, 7);
  if (kind === 'year') return d.getUTCFullYear();
  return iso;
}

function idValue(t, row) {
  if (t.base === 'UUID' || STRINGS.has(t.base)) return helpers.uuid();
  return row + 1;
}

function objectFor(cls, ctx, depth) {
  const obj = {};
  for (const f of fieldsOf(cls, ctx)) {
    const v = fieldValue(f, ctx, false, depth + 1);
    if (v !== SKIP) obj[keyOf(f)] = v;
  }
  return obj;
}

function typed(name, t, a, ctx, depth) {
  if (t.base === 'Optional' && t.args[0] && !t.array) return typed(name, typeInfo(t.args[0]), a, ctx, depth);
  if (t.array === 1 && (t.base === 'byte' || t.base === 'Byte')) {
    ctx.notes.add(`Skipped ${name}, it's binary data.`);
    return SKIP;
  }
  if (t.array || COLLECTIONS.has(t.base)) {
    const inner = t.array ? { ...t, array: t.array - 1 } : typeInfo(t.args[0] || 'String');
    const single = name.replace(/ies$/, 'y').replace(/s$/, '');
    const out = [];
    const seen = new Set();
    for (let k = rint(1, 3), tries = 0; out.length < k && tries < 10; tries++) {
      const v = typed(single, inner, [], ctx, depth);
      if (v === SKIP) return SKIP;
      const key = JSON.stringify(v);
      if (v !== null && typeof v !== 'object' && seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }
  if (MAPS.has(t.base)) return {};
  if (INTS.has(t.base)) return intFor(name, a, ctx);
  if (DECIMALS.has(t.base)) return decimalFor(name, a);
  if (BOOLS.has(t.base)) return boolFor(name);
  if (t.base === 'char' || t.base === 'Character') return pick('ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''));
  if (STRINGS.has(t.base)) return stringFor(name, a, ctx);
  if (t.base === 'UUID') return helpers.uuid();
  if (DATES[t.base]) return dateFor(name, DATES[t.base], a);
  if (t.base === 'Duration') return `PT${rint(5, 240)}M`;
  if (t.base === 'Period') return `P${rint(1, 12)}M`;
  if (t.base === 'Currency') return pick(['EUR', 'USD', 'GBP', 'JPY', 'CHF']);
  if (t.base === 'Locale') return pick(['en_US', 'en_GB', 'de_DE', 'fr_FR', 'es_ES']);
  if (t.base === 'ZoneId' || t.base === 'TimeZone') return pick(['Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC']);
  if (t.base === 'URI' || t.base === 'URL') return `https://example.com/${kebab(ctx.owner)}/${ctx.row + 1}`;
  if (t.base === 'InetAddress') return `192.168.${rint(0, 255)}.${rint(1, 254)}`;
  if (t.base === 'Object' || t.base === 'JsonNode' || t.base === 'ObjectNode') return {};
  const known = ctx.classes.get(t.base);
  const ordinal = /ORDINAL/.test((get(a, 'Enumerated') || {}).args || '');
  if (known && known.kind === 'enum') {
    if (!known.values.length) return null;
    const index = rint(0, known.values.length - 1);
    return ordinal ? index : known.values[index];
  }
  if (known && (known.kind === 'class' || known.kind === 'record')) {
    if (has(known.annotations, ...ENTITY)) return { id: rint(1, ctx.count) };
    return depth >= 3 ? null : objectFor(known, ctx, depth);
  }
  if (has(a, 'Enumerated')) {
    ctx.notes.add(`${t.base} looks like an enum that wasn't in the paste, so ${name} got placeholder values. Paste the enum too for the real ones.`);
    return ordinal ? rint(0, 2) : pick(['VALUE_A', 'VALUE_B', 'VALUE_C']);
  }
  ctx.notes.add(`Didn't recognise the type ${t.base} on ${name}, so it's null. Paste that class or enum too.`);
  return null;
}

function fieldValue(f, ctx, isId, depth) {
  const a = f.annotations;
  if (has(a, 'JsonIgnore', 'JsonBackReference')) return SKIP;
  const t = typeInfo(f.type);
  if (isId) return idValue(t, ctx.row);
  if (has(a, 'Version')) return 0;
  if (has(a, 'OneToMany', 'ManyToMany')) {
    ctx.notes.add(`Skipped ${f.name}, it's a collection relationship.`);
    return SKIP;
  }
  if (has(a, 'ManyToOne', 'OneToOne', 'DBRef', 'DocumentReference')) return { id: rint(1, ctx.count) };
  return typed(f.name, t, a, ctx, depth);
}

function pluralize(slug) {
  const parts = slug.split('-');
  const last = parts.pop();
  const irregular = { person: 'people', child: 'children', man: 'men', woman: 'women', mouse: 'mice', datum: 'data', status: 'statuses' };
  let plural;
  if (irregular[last]) plural = irregular[last];
  else if (/[^aeiou]y$/.test(last)) plural = last.slice(0, -1) + 'ies';
  else if (/(s|x|z|ch|sh)$/.test(last)) plural = /ss$|x$|z$|ch$|sh$/.test(last) ? last + 'es' : last;
  else plural = last + 's';
  return [...parts, plural].join('-');
}

function buildResource(cls, classes, count) {
  const ctx = { classes, count, notes: new Set(), emails: new Set(), owner: cls.name, row: 0, person: null };
  const fields = fieldsOf(cls, ctx);
  const idField = fields.find(f => has(f.annotations, 'Id', 'EmbeddedId', 'MongoId')) || fields.find(f => f.name === 'id') || null;
  if (!idField) ctx.notes.add(`${cls.name} has no @Id, so an "id" field was added.`);
  const data = [];
  for (let row = 0; row < count; row++) {
    ctx.row = row;
    ctx.person = { first: helpers.firstName(), last: helpers.lastName() };
    const item = {};
    if (!idField) item.id = row + 1;
    for (const f of fields) {
      const v = fieldValue(f, ctx, f === idField, 0);
      if (v !== SKIP) item[keyOf(f)] = v;
    }
    data.push(item);
  }
  const base = cls.name.replace(/(Entity|Model|Dto|DTO|Document|Record)$/, '') || cls.name;
  const slug = pluralize(kebab(base));
  return {
    source: cls.name,
    name: slug,
    path: '/api/' + slug,
    idField: idField ? keyOf(idField) : 'id',
    data,
    notes: [...ctx.notes]
  };
}

export function importJava(sources, { count = 10 } = {}) {
  const list = (Array.isArray(sources) ? sources : [sources]).map(s => stripComments(String(s)));
  const classes = new Map();
  for (const src of list) scan(src, 0, src.length, null, classes);
  const types = [...classes.values()].filter(c => c.kind === 'class' || c.kind === 'record');
  if (!types.length) throw new Error("Couldn't find a Java class or record in there");
  let targets = types.filter(c => has(c.annotations, ...ENTITY));
  if (!targets.length) targets = types.filter(c => c.top).slice(0, 1);
  if (!targets.length) targets = [types[0]];
  const n = Math.max(1, Math.min(500, Math.floor(Number(count) || 10)));
  return targets.map(cls => buildResource(cls, classes, n));
}

export default {
  id: 'spring',
  label: 'Spring Boot entity',
  language: 'Java',
  extensions: ['.java'],
  indent: 4,
  hint: 'Paste one or more classes with `@Entity` on them, or drop the .java files in here. Enums, embeddables and base classes in the same paste get picked up too.',
  placeholder: '@Entity\npublic class User {\n    @Id @GeneratedValue\n    private Long id;\n    private String email;\n}',
  run: importJava
};
