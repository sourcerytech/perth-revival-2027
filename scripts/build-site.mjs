import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySite } from './site-assurance.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'dist');
const spec = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.process.json'), 'utf8'));
const assurance = await verifySite(root, spec);
if (!assurance.ok) {
  console.error(JSON.stringify({published: false, failures: assurance.failures}, null, 2));
  process.exit(1);
}

await mkdir(out, {recursive: true});
const excluded = new Set(['.git', '.github', 'dist', 'generated', 'scripts', 'source']);
for (const entry of await readdir(root, {withFileTypes: true})) {
  if (excluded.has(entry.name)) continue;
  await cp(resolve(root, entry.name), resolve(out, entry.name), {recursive: true, force: true});
}

const navigation = spec.navigation.map(item => {
  const className = item.cta ? ' class="nav-cta"' : '';
  return `<a${className} href="${item.href}">${item.label}</a>`;
}).join('');
for (const page of spec.pages) {
  const path = resolve(out, page.path);
  let html = await readFile(path, 'utf8');
  html = html.replace(/(<nav\b[^>]*id="site-nav"[^>]*>)[\s\S]*?(<\/nav>)/i, `$1${navigation}$2`);
  await writeFile(path, html);
}
await writeFile(resolve(out, 'build-receipt.json'), `${JSON.stringify({
  protocol: 'sourcery/publishable-site-build/v1',
  source: 'source/perth-encounter.process.json',
  assurance,
  pages: spec.pages.map(page => page.path),
  publication: 'ready-for-non-github-host'
}, null, 2)}\n`);
console.log(JSON.stringify({published: true, output: 'dist/', pages: spec.pages.length, navigation: spec.navigation.length}, null, 2));
