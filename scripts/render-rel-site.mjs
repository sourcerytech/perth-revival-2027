import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitHtmlFromIr } from '../source/html-rel/plugins/html-rel/emitter.mjs';
import { projectRelToIr } from '../source/html-rel/plugins/html-rel/projection.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function renderRelSite(out, spec) {
  const sourceRoot = resolve(root, 'source/rel');
  await mkdir(out, {recursive: true});
  for (const page of spec.pages) {
    const rel = await readFile(resolve(sourceRoot, page.path.replace(/\.html$/u, '.rel')), 'utf8');
    const projected = projectRelToIr(rel, {file: `source/rel/${page.path.replace(/\.html$/u, '.rel')}`});
    const errors = projected.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
    if (errors.length) throw new Error(`${page.path}: REL projection failed: ${JSON.stringify(errors)}`);
    await writeFile(resolve(out, page.path), `<!doctype html>${emitHtmlFromIr(projected.ir)}\n`);
  }
}
