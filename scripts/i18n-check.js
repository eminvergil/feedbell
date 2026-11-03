#!/usr/bin/env node
// Translation report: missing keys, extra keys, placeholder mismatches and strings still identical to English.
//   npm run i18n:check          → every language
//   npm run i18n:check -- de    → one language
const fs = require('fs');
const path = require('path');
const { flatten } = require('../src/shared/i18n');

const DIR = path.join(__dirname, '..', 'src', 'locales');
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, '');
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => v !== 'count').sort().join(',');
const read = (code) => flatten(JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8')));

const en = read('en');
const enBase = new Map(Object.entries(en).filter(([k]) => !k.startsWith('meta.')).map(([k, v]) => [base(k), v]));
const only = process.argv[2];
const codes = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((c) => c !== 'en' && (!only || c === only));

let problems = 0;
for (const code of codes) {
  const d = read(code);
  const keys = Object.keys(d).filter((k) => !k.startsWith('meta.'));
  const have = new Set(keys.map(base));
  const missing = [...enBase.keys()].filter((k) => !have.has(k));
  const extra = [...have].filter((k) => !enBase.has(k));
  const badVars = keys.filter((k) => enBase.has(base(k)) && vars(d[k]) !== vars(enBase.get(base(k))));
  const same = keys.filter((k) => en[k] !== undefined && d[k] === en[k] && /[a-z]{3}/i.test(d[k]));
  const done = Math.round(((enBase.size - missing.length) / enBase.size) * 100);
  console.log(`\n${code} — ${d['meta.name'] || '?'}: ${done}% (${enBase.size - missing.length}/${enBase.size} keys)`);
  if (missing.length) console.log(`  missing (${missing.length}):\n    ${missing.join('\n    ')}`);
  if (extra.length) console.log(`  not in en.json (${extra.length}):\n    ${extra.join('\n    ')}`);
  if (badVars.length) console.log(`  placeholder mismatch (${badVars.length}):\n    ${badVars.map((k) => `${k}: "${d[k]}"`).join('\n    ')}`);
  if (same.length) console.log(`  same as English — fine for names, otherwise translate (${same.length}):\n    ${same.join('\n    ')}`);
  problems += missing.length + extra.length + badVars.length;
}
if (!codes.length) console.log(only ? `No src/locales/${only}.json yet — copy en.json to get started.` : 'Only en.json exists.');
process.exitCode = problems ? 1 : 0;
