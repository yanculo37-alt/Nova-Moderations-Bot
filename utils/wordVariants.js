const LEET_MAP = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '2': 'z', '3': 'e', '4': 'a',
  '@': 'a', '5': 's', '$': 's', '6': 'g', '7': 't', '+': 't', '8': 'b',
  '9': 'g', '£': 'l', '€': 'e', '¥': 'y', '#': 'h', '(': 'c', '{': 'c',
  '<': 'c', 'ß': 'b',
};

const EXPAND_MAP = {
  a: ['a', '4', '@'],
  b: ['b', '8'],
  c: ['c', '(', 'k'],
  e: ['e', '3'],
  g: ['g', '9', '6'],
  i: ['i', '1', '!', 'l', '|'],
  l: ['l', '1', '|', 'i'],
  o: ['o', '0'],
  s: ['s', '5', '$', 'z'],
  t: ['t', '7', '+'],
  u: ['u', 'v'],
  z: ['z', '2', 's'],
};

function normalize(input) {
  const base = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  let out = '';
  for (const ch of base) {
    const mapped = LEET_MAP[ch] || ch;
    if (mapped >= 'a' && mapped <= 'z') out += mapped;

  }

  return out.replace(/(.)\1+/g, '$1');
}

function root(input) {
  const base = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of base) {
    const mapped = LEET_MAP[ch] || ch;
    if (mapped >= 'a' && mapped <= 'z') out += mapped;
  }
  return out;
}

function expand(word, limit = 40) {
  const w = root(word);
  if (!w) return [];

  let combos = [''];
  for (const ch of w) {
    const opts = EXPAND_MAP[ch] || [ch];
    const next = [];
    for (const prefix of combos) {
      for (const o of opts) {
        next.push(prefix + o);
        if (next.length >= limit * 4) break;
      }
      if (next.length >= limit * 4) break;
    }
    combos = next;
  }

  combos.sort((a, b) => {
    const score = s => [...s].filter(c => c < 'a' || c > 'z').length;
    return score(a) - score(b);
  });

  const out = [];
  const seen = new Set();
  for (const c of combos) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

function variantsFor(word, limit = 40) {
  const original = String(word || '').trim().toLowerCase();
  const r = root(original);
  const set = new Set();
  if (original) set.add(original);
  if (r) set.add(r);
  const squashed = normalize(original);
  if (squashed) set.add(squashed);
  if (r) {
    set.add(r + r.slice(-1));
    for (const v of expand(r, limit)) set.add(v);
  }
  return [...set].filter(Boolean);
}

function distance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let best = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = tmp;
      if (prev[j] < best) best = prev[j];
    }
    if (best > max) return max + 1;
  }
  return prev[b.length];
}

function isSimilar(candidate, blacklisted) {
  const a = normalize(candidate);
  const b = normalize(blacklisted);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  const max = b.length <= 4 ? 0 : b.length <= 6 ? 1 : 2;
  return max > 0 && distance(a, b, max) <= max;
}

function findMatch(text, blacklist = []) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const whole = normalize(text);
  for (const bad of blacklist) {
    const b = normalize(bad);
    if (!b) continue;
    if (b.length >= 4 && whole.includes(b)) return bad;
    for (const w of words) if (isSimilar(w, bad)) return bad;
  }
  return null;
}

module.exports = { normalize, root, expand, variantsFor, isSimilar, findMatch, distance };
