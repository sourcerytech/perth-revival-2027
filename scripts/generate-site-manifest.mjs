import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySite } from './site-assurance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'source/perth-encounter.process.json');
const outputPath = resolve(root, 'generated/site-manifest.json');
const sourceBytes = await readFile(sourcePath);
const spec = JSON.parse(sourceBytes);
const assurance = await verifySite(root, spec);
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
