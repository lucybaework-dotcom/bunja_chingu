// dist/index.html → 아티팩트용 조각 (doctype/html/head/body 태그 제거)
import fs from 'node:fs';
let h = fs.readFileSync('dist/index.html', 'utf8');
h = h.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body>/gi, '')
  .replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
const title = h.match(/<title>.*?<\/title>/)[0];
h = title + '\n' + h.replace(title, '');
fs.writeFileSync('dist/bunja-chingu.html', h.trim() + '\n');
console.log(fs.statSync('dist/bunja-chingu.html').size);
