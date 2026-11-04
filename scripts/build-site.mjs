import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySite, verifySourceBoundary } from './site-assurance.mjs';
import { renderRelSite } from './render-rel-site.mjs';
import { renderPresentationCss } from './render-presentation-css.mjs';
import { renderRuntimeProcesses } from './render-runtime-processes.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'dist');
const spec = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.process.json'), 'utf8'));
if (await (async () => { try { await readFile(resolve(root, 'source/runtime/styles.css')); return true; } catch { return false; } })()) {
  throw new Error('source/runtime/styles.css is forbidden: presentation CSS must be generated from semantic REL.');
}
for (const runtimeSource of ['script.js', 'worker.js']) {
  try { await readFile(resolve(root, `source/runtime/${runtimeSource}`)); throw new Error(`source/runtime/${runtimeSource} is forbidden: runtime code must be generated from process REL.`); } catch (error) { if (error.message.includes('forbidden')) throw error; }
}
const sourceBoundaryFailures = await verifySourceBoundary(root);
if (sourceBoundaryFailures.length) {
  console.error(JSON.stringify({published: false, failures: [`root source boundary contains generated web files: ${sourceBoundaryFailures.join(', ')}`]}, null, 2));
  process.exit(1);
}
await mkdir(out, {recursive: true});
const excluded = new Set(['.git', '.github', 'dist', 'generated', 'scripts', 'source', ...spec.pages.map(page => page.path), 'styles.css', 'script.js', 'worker.js']);
for (const entry of await readdir(root, {withFileTypes: true})) {
  if (excluded.has(entry.name)) continue;
  await cp(resolve(root, entry.name), resolve(out, entry.name), {recursive: true, force: true});
}

await renderRelSite(out, spec);
await renderPresentationCss(out);
await renderRuntimeProcesses(out);

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
const assurance = await verifySite(out, spec);
if (!assurance.ok) {
  console.error(JSON.stringify({published: false, failures: assurance.failures}, null, 2));
  process.exit(1);
}
await writeFile(resolve(out, 'build-receipt.json'), `${JSON.stringify({
  protocol: 'sourcery/publishable-site-build/v1',
  source: 'source/perth-encounter.process.json',
  assurance,
  pages: spec.pages.map(page => page.path),
  publication: 'ready-for-non-github-host'
}, null, 2)}\n`);
console.log(JSON.stringify({published: true, output: 'dist/', pages: spec.pages.length, navigation: spec.navigation.length}, null, 2));
