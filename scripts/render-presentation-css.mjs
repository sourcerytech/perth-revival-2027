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
  const imports = facts.filter(f => f.p === 'statement' && f.s.startsWith('font-import.')).map(f => f.o).join('\n');
  const rules = facts.filter(f => f.p === 'isa' && f.o === 'StyleRule').sort((left, right) => Number(value(facts, left.s, 'order')) - Number(value(facts, right.s, 'order')));
  const emitted = rules.map(fact => {
    const subject = fact.s;
    const selector = value(facts, subject, 'selector');
    const declarationsForRule = facts.filter(candidate => candidate.p === 'declaration' && candidate.s === subject).map(candidate => {
      const declaration = candidate.o;
      return `${value(facts, declaration, 'property')}:${value(facts, declaration, 'value')}`;
    }).join(';');
    const rule = `${selector}{${declarationsForRule}}`;
    const context = value(facts, subject, 'context');
    return context ? `@media${context}{${rule}}` : rule;
  }).join('');
  const header = `/* Generated exclusively from source/semantic/presentation.rel via the presentation projection grammar. */\n:root{${declarations.join(';')}}\n/* Roles: ${roles.map(role => `${value(facts, role, 'selector')} = ${value(facts, role, 'meaning')}`).join(' | ')} */\n`;
  await writeFile(resolve(out, 'styles.css'), `${imports}${header}${emitted}`);
}
