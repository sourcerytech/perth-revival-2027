import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHtmlToIr } from '../source/html-rel/plugins/html-rel/parser.mjs';
import { lowerIrToRel } from '../source/html-rel/plugins/html-rel/lowering.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const spec = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.process.json'), 'utf8'));
const inputRoot = resolve(root, 'dist');
const outputRoot = resolve(root, 'source/rel');
await mkdir(outputRoot, {recursive: true});
for (const page of spec.pages) {
  const file = resolve(inputRoot, page.path);
  const html = (await readFile(file, 'utf8'))
    .replaceAll('<time>', '<span class="time">')
    .replaceAll('</time>', '</span>')
    .replaceAll('<figure class="page-image">', '<div class="page-image">')
    .replaceAll('<figure class="page-image page-image-quiet">', '<div class="page-image page-image-quiet">')
    .replaceAll('</figure>', '</div>')
    .replaceAll('<figcaption>', '<p class="figcaption">')
    .replaceAll('</figcaption>', '</p>');
  const ir = parseHtmlToIr(html, {file: page.path});
  const result = lowerIrToRel(ir, {file: page.path, documentSubject: `doc.${page.role}`});
  const errors = result.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  if (errors.length) throw new Error(`${page.path}: ${JSON.stringify(errors)}`);
  await writeFile(resolve(outputRoot, page.path.replace(/\.html$/u, '.rel')), result.rel);
}
console.log(JSON.stringify({protocol: 'sourcery/html-rel-lowering/v1', pages: spec.pages.length, output: 'source/rel'}, null, 2));
