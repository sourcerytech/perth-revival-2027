import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitHtmlFromIr } from '../source/html-rel/plugins/html-rel/emitter.mjs';
import { projectRelToIr } from '../source/html-rel/plugins/html-rel/projection.mjs';
import { projectSemanticPagesToDomRel } from '../source/projection/semantic-page-to-dom-rel.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function renderRelSite(out, spec) {
  const semanticSource = await readFile(resolve(root, 'source/semantic/perth-encounter.rel'), 'utf8');
  const projectedDomRel = projectSemanticPagesToDomRel(semanticSource);
  await mkdir(out, {recursive: true});
  for (const page of spec.pages) {
    const rel = projectedDomRel;
    const projected = projectRelToIr(rel, {file: 'source/projection/semantic-page-to-dom-rel.mjs', documentSubject: `projection.document.${page.role}`});
    const errors = projected.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
    if (errors.length) throw new Error(`${page.path}: REL projection failed: ${JSON.stringify(errors)}`);
    await writeFile(resolve(out, page.path), `<!doctype html>${emitHtmlFromIr(projected.ir)}\n`);
  }
}
