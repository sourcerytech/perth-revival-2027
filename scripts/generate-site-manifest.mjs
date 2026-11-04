import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySite, verifySourceBoundary } from './site-assurance.mjs';
import { renderRelSite } from './render-rel-site.mjs';
import { renderPresentationCss } from './render-presentation-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'source/perth-encounter.process.json');
const outputPath = resolve(root, 'generated/site-manifest.json');
const sourceBytes = await readFile(sourcePath);
const spec = JSON.parse(sourceBytes);
try { await readFile(resolve(root, 'source/runtime/styles.css')); throw new Error('source/runtime/styles.css is forbidden: presentation CSS must be generated from semantic REL.'); } catch (error) { if (error.message.includes('forbidden')) throw error; }
const sourceBoundaryFailures = await verifySourceBoundary(root);
const outputRoot = resolve(root, 'dist');
await renderRelSite(outputRoot, spec);
await renderPresentationCss(outputRoot);
const assurance = await verifySite(outputRoot, spec);
if (sourceBoundaryFailures.length) assurance.failures.push(`root source boundary contains generated web files: ${sourceBoundaryFailures.join(', ')}`);
assurance.ok = assurance.failures.length === 0;
const manifest = {
  protocol: 'sourcery/generated-site-manifest/v1',
  source: 'source/perth-encounter.process.json',
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  generatedAt: new Date().toISOString(),
  event: {name: spec.name, date: spec.date, purpose: spec.purpose},
  process: spec.process,
  navigation: spec.navigation,
  pages: spec.pages,
  assurance
};
await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({output:'generated/site-manifest.json', sourceSha256:manifest.sourceSha256, assured:assurance.ok, failures:assurance.failures}, null, 2));
if (!assurance.ok) process.exitCode = 1;
