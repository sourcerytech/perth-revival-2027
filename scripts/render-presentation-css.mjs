import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../source/html-rel/core/rel-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const value = (facts, subject, predicate) => facts.find(f => f.s === subject && f.p === predicate && f.pol !== 'is-not')?.o;
const subjectsOfType = (facts, type) => [...new Set(facts.filter(f => f.p === 'isa' && f.o === type).map(f => f.s))];

export async function renderPresentationCss(out) {
  const source = await readFile(resolve(root, 'source/semantic/presentation.rel'), 'utf8');
  const facts = parse(source, { file: 'source/semantic/presentation.rel' });
  const grammar = subjectsOfType(facts, 'PresentationGrammar')[0];
  if (!grammar) throw new Error('Presentation REL has no PresentationGrammar.');
  const tokens = facts.filter(f => f.p === 'token' && f.s === grammar).map(f => f.o);
  const declarations = tokens.map(subject => {
    const name = value(facts, subject, 'name');
    const cssValue = value(facts, subject, 'cssValue');
    if (!name || !cssValue) throw new Error(`Presentation token ${subject} is incomplete.`);
    return `--${name}:${cssValue}`;
  });
  const roles = facts.filter(f => f.p === 'role' && f.s === grammar).map(f => f.o);
  for (const role of roles) {
    if (!value(facts, role, 'selector') || !value(facts, role, 'meaning')) throw new Error(`Presentation role ${role} is incomplete.`);
  }
  const rawBase = await readFile(resolve(root, 'source/runtime/styles.css'), 'utf8');
  const imports = rawBase.match(/^(?:@import[^\r\n]*\r?\n)+/u)?.[0] || '';
  const base = rawBase.slice(imports.length).replace(/:root\{[^}]+\}/u, '');
  const header = `/* Generated from source/semantic/presentation.rel via the presentation projection grammar. */\n:root{${declarations.join(';')}}\n/* Roles: ${roles.map(role => `${value(facts, role, 'selector')} = ${value(facts, role, 'meaning')}`).join(' | ')} */\n`;
  await writeFile(resolve(out, 'styles.css'), `${imports}${header}${base}`);
}
