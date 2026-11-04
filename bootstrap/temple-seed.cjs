/* Pure Temple seed: bounded surface-process evaluator and REL reader.
 * Native functionality is supplied only through injected ports.
 * No application, DOM construction, CSS, signup or assurance programme lives here.
 * Control/value semantics derive from Claimipedia's surface-process interpreter.
 */
'use strict';

function createKernel(ports = {}, limit = 2000000) {
  let ticks = 0;
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const name = key => {
    if (typeof key !== 'string' || forbidden.has(key)) throw Error('Invalid binding');
    return key;
  };
  const tick = () => { if (++ticks > limit) throw Error('Execution budget exceeded'); };
  function reference(path, env) {
    if (!/^\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_-]+)*$/.test(path)) throw Error('Invalid process reference');
    let result = env;
    for (const key of path.slice(1).split('.')) {
      name(key);
      if (!result || typeof result !== 'object') throw Error('Unknown reference: ' + path);
      const descriptor = Object.getOwnPropertyDescriptor(result, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw Error('Unknown reference: ' + path);
      result = descriptor.value;
    }
    return result;
  }
  function active(env, s, p) {
    const result = new Map();
    for (const f of env.facts || []) {
      if (f.s !== s || f.p !== p) continue;
      result.set(f.o, f.pol !== 'is-not');
    }
    return [...result].filter(([, active]) => active).map(([o]) => o);
  }
  function evaluate(x, env) {
    tick();
    if (typeof x === 'string' && x.startsWith('$')) return reference(x, env);
    if (x && typeof x === 'object' && !Array.isArray(x))
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [name(k), evaluate(v, env)]));
    if (!Array.isArray(x)) return x;
    if (!x.length) return [];
    const [op, ...args] = x, v = i => evaluate(args[i], env);
    switch (op) {
      case 'one': case 'optional': {
        const found = active(env, v(0), v(1));
        if (found.length > 1 || (op === 'one' && found.length !== 1)) throw Error('Fact cardinality: ' + v(0) + '.' + v(1));
        return found[0] ?? null;
      }
      case 'objects': return active(env, v(0), v(1));
      case 'subjects': return (env.facts || []).filter(f => f.p === v(0) && f.o === v(1)).map(f => f.s);
      case 'has': return active(env, v(0), v(1)).includes(v(2));
      case 'map': case 'filter': case 'some': case 'every': {
        const items = v(0), binding = name(args[1]);
        if (!Array.isArray(items)) throw Error(op + ' requires an array');
        return items[op](item => evaluate(args[2], {...env, [binding]: item}));
      }
      case 'list': return args.map(a => evaluate(a, env));
      case 'record': return v(0);
      case 'append': {
        const a = v(0), b = v(1);
        if (!Array.isArray(a) || !Array.isArray(b)) throw Error('append requires arrays');
        return a.concat(b);
      }
      case 'eq': return JSON.stringify(v(0)) === JSON.stringify(v(1));
      case 'includes': return v(0).includes(v(1));
      case 'not': return !v(0);
      case 'and': return args.every(a => Boolean(evaluate(a, env)));
      case 'or': return args.map(a => evaluate(a, env)).find(Boolean) ?? null;
      case 'if': return evaluate(args[v(0) ? 1 : 2], env);
      case 'count': return v(0).length;
      case 'at': return v(0)?.[v(1)];
      case 'concat': return args.map(a => evaluate(a, env)).join('');
      case 'add': return Number(v(0)) + Number(v(1));
      case 'range': {
        const length = v(0);
        if (!Number.isSafeInteger(length) || length < 0 || length > limit) throw Error('Invalid bounded range');
        return Array.from({length}, (_, i) => i + 1);
      }
      case 'distinct': return [...new Set(v(0))];
      default: throw Error('Unknown algebra operation: ' + String(op));
    }
  }
  async function run(program, env) {
    if (!Array.isArray(program)) throw Error('Process must be an array');
    for (const step of program) {
      tick();
      const kinds = ['let', 'assert', 'when', 'each', 'fold', 'call', 'port', 'try'].filter(k => Object.hasOwn(step, k));
      if (kinds.length !== 1) throw Error('Unknown or ambiguous process statement');
      switch (kinds[0]) {
        case 'let': env[name(step.let)] = evaluate(step.value, env); break;
        case 'assert': if (!evaluate(step.assert, env)) throw Error(step.message); break;
        case 'when': if (evaluate(step.when, env)) await run(step.then, env); break;
        case 'each':
          for (const item of evaluate(step.each, env)) await run(step.steps, {...env, [name(step.as)]: item});
          break;
        case 'fold': {
          let accumulator = evaluate(step.initial, env);
          for (const item of evaluate(step.fold, env)) {
            const local = {...env, [name(step.as)]: item, [name(step.accumulator)]: accumulator};
            await run(step.steps, local);
            accumulator = evaluate(step.yield, local);
          }
          env[name(step.into)] = accumulator;
          break;
        }
        case 'call':
          if (!Object.hasOwn(env.model.queries, step.call)) throw Error('Unknown process: ' + step.call);
          await run(env.model.queries[step.call], env); break;
        case 'port':
          if (!Object.hasOwn(ports, step.port)) throw Error('Unknown host port: ' + step.port);
          env[name(step.into)] = await ports[step.port](evaluate(step.args, env), env); break;
        case 'try':
          try { await run(step.try, env); }
          catch (error) {
            env[name(step.error)] = {name: error.name, message: error.message};
            await run(step.catch, env);
          }
          break;
      }
    }
    return env;
  }
  return {evaluate, run};
}

function parseRel(text, file) {
  const facts = [];
  const atom = '"(?:\\\\.|[^"\\\\])*"';
  const tuple = new RegExp('\\s*\\(\\s*(' + atom + ')\\s*,\\s*(' + atom + ')\\s*,\\s*(' + atom + ')(?:\\s*,\\s*(' + atom + '))?\\s*\\)', 'y');
  const source = text.split(/\r?\n/).map(line => line.trim().startsWith('//') ? '' : line).join('\n');
  let offset = 0;
  while (source.slice(offset).trim()) {
    tuple.lastIndex = offset;
    const match = tuple.exec(source);
    if (!match) throw Error(file + ':' + source.slice(0, offset).split('\n').length + ': invalid REL');
    offset = tuple.lastIndex;
    const [s, p, o] = match.slice(1, 4).map(JSON.parse);
    const pol = match[4] ? JSON.parse(match[4]) : 'is';
    if (!['is', 'is-not'].includes(pol)) throw Error('Unknown fact polarity');
    facts.push({s, p, o, pol});
  }
  return facts;
}

module.exports = {createKernel, parseRel};
