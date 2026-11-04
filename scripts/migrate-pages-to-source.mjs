import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function parseAttributes(raw) {
  const attrs = {};
  for (const match of raw.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? true;
  }
  return attrs;
}

function parseBody(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const root = {type: 'root', children: []};
  const stack = [root];
  const tokens = body.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const match = token.match(/^<([:\w-]+)([\s\S]*?)\/?>(?:\s*)$/);
      if (!match) continue;
      const node = {type: 'element', tag: match[1].toLowerCase(), attrs: parseAttributes(match[2]), children: []};
      stack.at(-1).children.push(node);
      if (!voidTags.has(node.tag) && !token.endsWith('/>')) stack.push(node);
      continue;
    }
    const text = token.replace(/\s+/g, ' ');
    if (text.trim()) stack.at(-1).children.push({type: 'text', value: text});
  }
  return root.children;
}

const pages = {};
for (const entry of await readdir(root, {withFileTypes: true})) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const html = await readFile(resolve(root, entry.name), 'utf8');
  pages[entry.name] = {body: parseBody(html)};
}
await writeFile(resolve(root, 'source/perth-encounter.pages.json'), `${JSON.stringify({protocol: 'sourcery/perth-encounter-presentation-ast/v1', pages}, null, 2)}\n`);
console.log(JSON.stringify({pages: Object.keys(pages), output: 'source/perth-encounter.pages.json'}, null, 2));
