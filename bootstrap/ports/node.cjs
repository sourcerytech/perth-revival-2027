'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function createNodeHost({root: inputRoot, output = 'dist'}) {
  const root = await fs.realpath(path.resolve(inputRoot));
  const out = path.resolve(root, output);
  const contained = (base, file) => {
    const full = path.resolve(base, file), relative = path.relative(base, full);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Path escapes root: ' + file);
    return full;
  };
  contained(root, out);
  async function checked(base, file) {
    const full = contained(base, file);
    // Reject symlinks/junctions before I/O, including output parents.
    let cursor = root;
    for (const part of path.relative(root, full).split(path.sep)) {
      cursor = path.join(cursor, part);
      const stat = await fs.lstat(cursor).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (stat?.isSymbolicLink()) throw Error('Native file boundary refuses symlinks: ' + file);
    }
    return full;
  }
  await checked(root, out);
  await fs.mkdir(out, {recursive:true});
  const sources = Object.create(null), artifacts = Object.create(null);
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  async function read(file) {
    const bytes = await fs.readFile(await checked(root, file));
    sources[file] = digest(bytes);
    return bytes.toString('utf8');
  }
  async function write(file, bytes) {
    const target = await checked(out, file);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.writeFile(target, bytes);
    artifacts[file] = digest(bytes);
    return true;
  }
  const ports = {
    'file.write': ({path: file, text}) => write(file, text),
    'file.read': async ({path: file}) => fs.readFile(await checked(out, file), 'utf8'),
    'file.copy': async ({path: file}) => {
      const bytes = await fs.readFile(await checked(root, file));
      sources[file] = digest(bytes);
      return write(file, bytes);
    },
    'url.resolve': ({href, route}) => {
      const base = new URL(route, 'https://temple.invalid/');
      const target = new URL(href, base);
      return {external:target.origin !== base.origin, route:decodeURIComponent(target.pathname.slice(1)), fragment:decodeURIComponent(target.hash.slice(1))};
    },
  };
  function verifyNativeClosure(declared, entry) {
    const loaded = new Set();
    function visit(module) {
      if (!module) throw Error('Native bootstrap entry is not loaded');
      if (loaded.has(module.filename)) return;
      loaded.add(module.filename);
      module.children.forEach(visit);
    }
    visit(require.cache[contained(root,entry)]);
    const actual = [...loaded].map(file => path.relative(root,file).replaceAll('\\','/')).sort();
    if (JSON.stringify([...declared].sort()) !== JSON.stringify(actual)) throw Error('Native bootstrap closure differs from its declaration');
  }
  return {root, out, read, write, ports, sources, artifacts, verifyNativeClosure,
    outputName:path.relative(root,out), digest};
}

module.exports = {createNodeHost};
