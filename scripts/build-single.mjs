// Inlines css/ and js/ into one self-contained HTML file.
// Usage: node scripts/build-single.mjs [out.html] [--fragment]
//   --fragment  drops <!doctype>/<html>/<head>/<body> for hosts that supply their own skeleton.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist/hockey-uniform-builder.html');

let html = readFileSync('index.html', 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => `<style>\n${readFileSync(href, 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(src, 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

if (fragment) {
  html = html
    .replace(/<!doctype html>/i, '')
    .replace(/<\/?html[^>]*>|<\/?head>|<\/?body>/gi, '')
    .replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/gi, '')
    .trim() + '\n';
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
