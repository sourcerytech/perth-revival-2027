/* Temple seed: bounded surface-process evaluator and explicit host ports.
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
  const tuple = new RegExp('^\\(\\s*(' + atom + ')\\s*,\\s*(' + atom + ')\\s*,\\s*(' + atom + ')(?:\\s*,\\s*(' + atom + '))?\\s*\\)\\s*$');
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const match = tuple.exec(line);
    if (!match) throw Error(file + ':' + (i + 1) + ': invalid REL');
    const [s, p, o] = match.slice(1, 4).map(JSON.parse);
    const pol = match[4] ? JSON.parse(match[4]) : 'is';
    if (!['is', 'is-not'].includes(pol)) throw Error('Unknown fact polarity');
    facts.push({s, p, o, pol});
  }
  return facts;
}

function serializeHtml(tree) {
  const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
  if (tree == null || tree === false) return '';
  if (Array.isArray(tree)) return tree.map(serializeHtml).join('');
  if (typeof tree !== 'object') return escape(tree);
  const {tag, attrs = {}, children = []} = tree;
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) throw Error('Invalid HTML tag');
  const attributes = Object.entries(attrs).filter(([, v]) => v != null && v !== false).map(([k, v]) => {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(k) || /^on/i.test(k)) throw Error('Invalid HTML attribute');
    if (['href', 'src', 'action'].includes(k) && /^\s*(javascript|data):/i.test(String(v))) throw Error('Unsafe URL');
    return ' ' + k + '="' + escape(v === true ? '' : v) + '"';
  }).join('');
  return '<' + tag + attributes + '>' + (voids.has(tag) ? '' : serializeHtml(children) + '</' + tag + '>');
}

function inspectTree(tree) {
  const nodes = [], links = [], ids = [], controls = [];
  const flatten = x => Array.isArray(x) ? x.flatMap(flatten) : x == null ? [] : [x];
  const content = x => flatten(x).map(n => typeof n === 'object' ? content(n.children) : String(n)).join('');
  function visit(n, wrapped = false) {
    if (Array.isArray(n)) return n.forEach(child => visit(child, wrapped));
    if (!n || typeof n !== 'object') return;
    nodes.push(n);
    if (n.attrs?.id) ids.push(n.attrs.id);
    if (n.tag === 'a' && n.attrs?.href) links.push(n.attrs.href);
    if (['button', 'input', 'select', 'textarea'].includes(n.tag)) controls.push({node:n, wrapped});
    visit(n.children, wrapped || (n.tag === 'label' && Boolean(content(n.children).trim())));
  }
  visit(tree);
  const unnamed = controls.filter(({node:n, wrapped}) => {
    if (n.attrs?.type === 'hidden' || n.attrs?.['aria-label']?.trim() || wrapped) return false;
    if (n.attrs?.['aria-labelledby'] && n.attrs['aria-labelledby'].split(/\s+/).every(id =>
      nodes.some(label => label.attrs?.id === id && content(label.children).trim()))) return false;
    if (n.tag === 'button' && content(n.children).trim()) return false;
    return !nodes.some(label => label.tag === 'label' && label.attrs?.for === n.attrs?.id && content(label.children).trim());
  }).map(({node}) => node.tag);
  const navs = nodes.filter(n => n.tag === 'nav' && n.attrs?.id === 'site-nav');
  return {main: nodes.filter(n => n.tag === 'main').length, h1: nodes.filter(n => n.tag === 'h1').length,
    ids, duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i), links, unnamed,
    navigation: navs.map(n => flatten(n.children).map(link => ({href:link.attrs.href, label:content(link.children)})))};
}

function browserPorts(dispatch) {
  const node = selector => { const result = document.querySelector(selector); if (!result) throw Error('Missing DOM target: ' + selector); return result; };
  return {
    'dom.exists': ({selector}) => Boolean(document.querySelector(selector)),
    'dom.on': ({selector, event, query, preventDefault}) => { node(selector).addEventListener(event, e => {
      if (preventDefault) e.preventDefault();
      dispatch(query).catch(error => console.error(error));
    }); return true; },
    'dom.value': ({selector}) => node(selector).value,
    'dom.checked': ({selector}) => node(selector).checked,
    'dom.attribute': ({selector, name}) => node(selector).getAttribute(name),
    'dom.setAttribute': ({selector, name, value}) => { node(selector).setAttribute(name, String(value)); return true; },
    'dom.classToggle': ({selector, name, value}) => { node(selector).classList.toggle(name, value); return true; },
    'dom.text': ({selector, text}) => { node(selector).textContent = text; return true; },
    'dom.reset': ({selector}) => { node(selector).reset(); return true; },
    'http.json': async ({url, method, body}) => {
      const response = await fetch(url, {method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      return {ok: response.ok, status: response.status, data};
    },
  };
}

async function startBrowser(model, facts) {
  const dispatch = async query => {
    const kernel = createKernel(browserPorts(dispatch));
    await kernel.run(model.queries[query], {model, facts});
  };
  await dispatch(model.entry);
}

function workerPorts() {
  return {
    'http.method': ({request}) => request.method,
    'http.decode': async ({request}) => { try { return {ok: true, value: await request.json()}; } catch { return {ok:false, value:{}}; } },
    'http.header': ({request, name}) => request.headers.get(name) || '',
    'http.respond': ({body, status, headers}) => new Response(body == null ? null : JSON.stringify(body), {status, headers}),
    'value.type': ({value}) => typeof value,
    'text.trim': ({value}) => value.trim(),
    'text.lowerCase': ({value}) => value.toLowerCase(),
    'text.matches': ({value, pattern}) => new RegExp(pattern).test(value),
    'record.get': ({record, key}) => record != null && Object.hasOwn(record, key) ? record[key] : null,
    'mail.send': async ({url, from, to, subject, text, replyTo, key}) => {
      const body = new FormData();
      for (const [name, value] of Object.entries({from, to, subject, text, 'h:Reply-To': replyTo})) body.append(name, value);
      const response = await fetch(url, {method: 'POST', headers: {Authorization: 'Basic ' + btoa('api:' + key)}, body});
      return {ok: response.ok, status: response.status};
    },
  };
}

async function startWorker(model, facts, request, secrets) {
  const kernel = createKernel(workerPorts());
  const env = {model, facts, request, secrets};
  await kernel.run(model.queries[model.entry], env);
  return env.result;
}

if (typeof module !== 'undefined') module.exports = {createKernel, parseRel, serializeHtml, inspectTree, browserPorts, startWorker, workerPorts};

async function main() {
  const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const out = path.resolve(root, process.argv[3] || 'dist');
  const contained = (base, file) => {
    const full = path.resolve(base, file), rel = path.relative(base, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Path escapes root: ' + file);
    return full;
  };
  if (out === root || !out.startsWith(root + path.sep)) throw Error('Output must be inside build root');
  const sources = {};
  async function read(file) {
    const data = await fs.readFile(contained(root, file));
    sources[file] = crypto.createHash('sha256').update(data).digest('hex');
    return data.toString('utf8');
  }
  const manifest = JSON.parse(await read('bootstrap/site.json'));
  if (manifest.protocol !== 'temple/bootstrap-site/1') throw Error('Unknown bootstrap protocol');
  const model = {queries: Object.create(null), entry: manifest.entry};
  for (const file of manifest.modules) {
    const module = JSON.parse(await read(file));
    if (module.protocol !== 'temple/surface-process-module/1') throw Error('Unknown module protocol');
    for (const [name, programme] of Object.entries(module.queries)) {
      if (Object.hasOwn(model.queries, name)) throw Error('Duplicate programme: ' + name);
      model.queries[name] = programme;
    }
  }
  const facts = [];
  for (const file of manifest.sources) facts.push(...parseRel(await read(file), file));
  await fs.mkdir(out, {recursive: true});
  const artifacts = {};
  async function write(file, text) {
    const dest = contained(out, file);
    await fs.mkdir(path.dirname(dest), {recursive:true});
    await fs.writeFile(dest, text);
    artifacts[file] = crypto.createHash('sha256').update(text).digest('hex');
    return true;
  }
  const ports = {
    'file.write': ({path: file, text}) => write(file, text),
    'file.read': ({path: file}) => fs.readFile(contained(out, file), 'utf8'),
    'file.copy': async ({path: file}) => {
      const bytes = await fs.readFile(contained(root, file));
      sources[file] = crypto.createHash('sha256').update(bytes).digest('hex');
      return write(file, bytes);
    },
    'html.serialize': ({tree}) => serializeHtml(tree),
    'html.inspect': ({tree}) => inspectTree(tree),
    'url.resolve': ({href, route}) => {
      const base = new URL(route, 'https://temple.invalid/');
      const target = new URL(href, base);
      return {external:target.origin !== base.origin, route:decodeURIComponent(target.pathname.slice(1)), fragment:decodeURIComponent(target.hash.slice(1))};
    },
    'runtime.bundle': ({entry, mode, queries, factSubjects}) => {
      const selected = Object.fromEntries(queries.map(name => {
        if (!Object.hasOwn(model.queries, name)) throw Error('Missing runtime programme: ' + name);
        return [name, model.queries[name]];
      }));
      const runtimeModel = {queries: selected, entry};
      const runtimeFacts = facts.filter(f => factSubjects.includes(f.s));
      const common = createKernel.toString() + '\nconst model=' + JSON.stringify(runtimeModel) + ';\nconst facts=' + JSON.stringify(runtimeFacts) + ';\n';
      if (mode === 'browser') return common + browserPorts.toString() + '\n' + startBrowser.toString() + '\nstartBrowser(model,facts);\n';
      if (mode === 'worker') return common + workerPorts.toString() + '\n' + startWorker.toString() +
        '\nexport default {fetch(request,secrets){return startWorker(model,facts,request,secrets)}};\n';
      throw Error('Unknown runtime mode');
    },
  };
  const kernel = createKernel(ports);
  const env = {model, facts};
  await kernel.run(model.queries[model.entry], env);
  const seed = await fs.readFile(__filename);
  const receipt = {protocol:'temple/bootstrap-build/1', seedSha256:crypto.createHash('sha256').update(seed).digest('hex'),
    sources, artifacts, mjsImports: [], assurance:env.assurance};
  await fs.writeFile(path.join(out, 'build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({output:path.relative(root,out), artifacts:Object.keys(artifacts).length, assurance:env.assurance}));
}

if (typeof require !== 'undefined' && require.main === module) main().catch(error => {console.error(error.stack); process.exitCode = 1;});
