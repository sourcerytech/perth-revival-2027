import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../source/html-rel/core/rel-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const value = (facts, subject, predicate) => facts.find(f => f.s === subject && f.p === predicate && f.pol !== 'is-not')?.o;
const values = (facts, subject, predicate) => facts.filter(f => f.s === subject && f.p === predicate && f.pol !== 'is-not').map(f => f.o);

export async function hydrateTempleKernel({ file = 'source/semantic/temple-kernel.rel' } = {}) {
  const facts = parse(await readFile(resolve(root, file), 'utf8'), { file });
  const kernel = facts.find(f => f.p === 'isa' && f.o === 'TempleKernel')?.s;
  if (!kernel) throw new Error('Temple kernel declaration is missing.');
  const protocol = value(facts, kernel, 'protocol');
  if (protocol !== 'temple/minimal-kernel/1') throw new Error('Unsupported Temple kernel protocol: ' + (protocol || 'missing') + '.');
  const modules = values(facts, kernel, 'module').map(id => Object.freeze({
    id,
    capabilities: Object.freeze(values(facts, id, 'capability')),
    entrypoint: value(facts, id, 'entrypoint'),
    inputs: Object.freeze(values(facts, id, 'input')),
    grammar: value(facts, id, 'grammar') || null,
  }));
  if (!modules.length || modules.some(module => !module.entrypoint || !module.capabilities.length)) throw new Error('Temple kernel contains an incomplete module declaration.');
  const byCapability = new Map(modules.flatMap(module => module.capabilities.map(capability => [capability, module])));
  return Object.freeze({
    protocol,
    id: kernel,
    modules: Object.freeze(modules),
    module(capability) {
      const module = byCapability.get(capability);
      if (!module) throw new Error('Temple kernel capability is not hydrated: ' + capability + '.');
      return module;
    },
  });
}
