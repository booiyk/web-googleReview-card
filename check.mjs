// Validator HTML ringan: cek nesting tag, atribut wajib, dan referensi internal.
import { readFileSync } from 'node:fs';

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','use','path','circle','rect','line','polygon','polyline','ellipse','stop']);

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
// buang komentar, script, style
const stripped = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '');

const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const stack = [];
const errors = [];
let m;
while ((m = tagRe.exec(stripped)) !== null) {
  const [full, closing, name, attrs, selfClose] = m;
  const tag = name.toLowerCase();
  if (VOID.has(tag) || selfClose === '/') continue;
  if (closing) {
    const top = stack.pop();
    if (!top) errors.push(`</${tag}> tanpa pembuka`);
    else if (top.tag !== tag) errors.push(`</${tag}> menutup <${top.tag}> (baris ~${stripped.slice(0, m.index).split('\n').length})`);
  } else {
    stack.push({ tag, line: stripped.slice(0, m.index).split('\n').length });
  }
}
stack.forEach((s) => errors.push(`<${s.tag}> line ${s.line} tidak ditutup`));

console.log('=== NESTING ===');
console.log(errors.length ? errors.join('\n') : 'OK semua tag seimbang');

// atribut wajib
console.log('\n=== ATRIBUT ===');
const issues = [];
const imgTags = [...stripped.matchAll(/<img\b[^>]*>/g)].map((x) => x[0]);
imgTags.forEach((t) => {
  if (!/\balt=/.test(t)) issues.push('img tanpa alt: ' + t.slice(0, 70));
  if (!/\bwidth=/.test(t) || !/\bheight=/.test(t)) issues.push('img tanpa width/height (CLS): ' + t.slice(0, 70));
});
const btns = [...stripped.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
const idSet = new Set([...stripped.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));
[...stripped.matchAll(/\b(?:aria-controls|for|aria-labelledby)="([^"]+)"/g)].forEach((x) => {
  if (!idSet.has(x[1])) issues.push('referensi id hilang: ' + x[1]);
});
// duplikat id
const seen = new Set();
[...stripped.matchAll(/\bid="([^"]+)"/g)].forEach((x) => {
  if (seen.has(x[1])) issues.push('id duplikat: ' + x[1]);
  seen.add(x[1]);
});
// tabindex positif
[...stripped.matchAll(/\btabindex="(\d+)"/g)].forEach((x) => {
  if (+x[1] > 0) issues.push('tabindex positif (gangguan urutan tab): ' + x[1]);
});
console.log(issues.length ? issues.join('\n') : 'OK alt/label/aria/id');
