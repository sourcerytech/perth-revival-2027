/* Deterministic public parity audit: HTML tree + CSS rule/declaration comparison. */
'use strict';

const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const routes = ['index.html', 'story.html', 'commons.html', 'guardrails.html', 'sources.html', 'privacy.html', 'contact.html', 'testimony.html'];
const defaults = {
  reference: 'https://perth-encounter-2027.musicalsunbird.chatgpt.site/',
  candidate: 'https://sourcerytech.github.io/perth-revival-2027/'
};

function decode(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function cleanText(value) {
  return decode(value).replace(/\s+/g, ' ').trim();
}

function cleanUrl(value) {
  return value
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/sourcerytech\/perth-revival-2027/, '')
    .replace(/^\/perth-revival-2027/, '')
    .replace(/^perth-revival-2027\//, '')
    .replace(/^index\.html#/, '#')
    .replace(/^\//, '')
    .replace(/\?.*$/, '') || '/';
}

function parseTag(raw) {
  const match = raw.match(/^<\s*(\/?)\s*([a-zA-Z0-9:-]+)([\s\S]*?)\s*\/?\s*>$/);
  if (!match) return null;
  const closing = Boolean(match[1]);
  const name = match[2].toLowerCase();
  const attrs = {};
  if (!closing) {
    const body = match[3];
    const attrRe = /([:@a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let item;
    while ((item = attrRe.exec(body))) {
      let value = item[2] ?? item[3] ?? item[4] ?? '';
      value = decode(value);
      if (item[1] === 'href' || item[1] === 'src' || item[1] === 'action' || (item[1] === 'content' && /^https?:\/\//.test(value))) value = cleanUrl(value);
      attrs[item[1]] = value.replace(/\s+/g, ' ').trim();
    }
  }
  return {closing, name, attrs: Object.fromEntries(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))), selfClosing: /\/\s*>$/.test(raw) || ['meta', 'link', 'input', 'br', 'img', 'hr'].includes(name)};
}

function parseHtml(source) {
  const root = {type: 'root', children: []};
  const stack = [root];
  const tokenRe = /<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g;
  let token;
  while ((token = tokenRe.exec(source))) {
    const raw = token[0];
    if (raw.startsWith('<!--') || raw.startsWith('<!')) continue;
    if (/^<script\b/i.test(raw)) {
      const end = source.slice(tokenRe.lastIndex).search(/<\/script\s*>/i);
      if (end >= 0) tokenRe.lastIndex += end + source.slice(tokenRe.lastIndex + end).match(/<\/script\s*>/i)[0].length;
      continue;
    }
    if (raw.startsWith('<')) {
      const tag = parseTag(raw);
      if (!tag) continue;
      if (tag.closing) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === tag.name) { stack.length = i; break; }
        }
        continue;
      }
      const node = {type: 'element', name: tag.name, attrs: tag.attrs, children: []};
      stack.at(-1).children.push(node);
      if (!tag.selfClosing) stack.push(node);
    } else {
      const text = cleanText(raw);
      if (text) stack.at(-1).children.push({type: 'text', value: text});
    }
  }
  return root;
}

function flattenHtml(root) {
  const rows = [];
  function visit(node, parent = 'root', index = 0) {
    const locator = `${parent}/${node.type === 'text' ? '#text' : node.name}[${index}]`;
    if (node.type === 'text') rows.push({locator, type: 'text', value: node.value});
    else {
      rows.push({locator, type: 'element', name: node.name, attrs: node.attrs});
      node.children.forEach((child, childIndex) => visit(child, locator, childIndex));
    }
  }
  root.children.forEach((node, index) => visit(node, 'root', index));
  return rows;
}

function parseCss(source, prefix = '') {
  source = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '').replace(/\s+/g, ' ').replace(/;\s+:/g, ';:').trim();
  const rules = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor);
    if (open < 0) break;
    let depth = 1, close = open + 1;
    while (close < source.length && depth) {
      if (source[close] === '{') depth++;
      if (source[close] === '}') depth--;
      close++;
    }
    if (depth) break;
    const selector = source.slice(cursor, open).trim();
    const body = source.slice(open + 1, close - 1).trim();
    cursor = close;
    if (!selector) continue;
    const qualifiedSelector = prefix ? `${prefix} ${selector}` : selector;
    if (body.includes('{')) {
      rules.push(...parseCss(body, qualifiedSelector));
      continue;
    }
    const declarations = {};
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const key = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (key) declarations[key] = value;
    }
    rules.push({selector: qualifiedSelector, declarations});
  }
  return rules;
}

function compareLists(reference, candidate, key) {
  const differences = [];
  const length = Math.max(reference.length, candidate.length);
  for (let i = 0; i < length; i++) {
    const left = reference[i], right = candidate[i];
    if (JSON.stringify(left) !== JSON.stringify(right)) differences.push({index: i, reference: left, candidate: right, key});
  }
  return differences;
}

function expressionKey(row) {
  if (row.type === 'text') return `text:${row.value}`;
  return `element:${row.name}:${JSON.stringify(row.attrs)}`;
}

function multisetDifference(reference, candidate) {
  const left = new Map(), right = new Map();
  for (const row of reference) left.set(expressionKey(row), (left.get(expressionKey(row)) || 0) + 1);
  for (const row of candidate) right.set(expressionKey(row), (right.get(expressionKey(row)) || 0) + 1);
  const missing = [], extra = [];
  for (const [key, count] of left) for (let i = 0; i < count - (right.get(key) || 0); i++) missing.push(key);
  for (const [key, count] of right) for (let i = 0; i < count - (left.get(key) || 0); i++) extra.push(key);
  return {missing, extra};
}

function cssKey(rule) {
  return JSON.stringify(rule);
}

function cssMultisetDifference(reference, candidate) {
  const left = new Map(), right = new Map();
  for (const row of reference) left.set(cssKey(row), (left.get(cssKey(row)) || 0) + 1);
  for (const row of candidate) right.set(cssKey(row), (right.get(cssKey(row)) || 0) + 1);
  const missing = [], extra = [];
  for (const [key, count] of left) for (let i = 0; i < count - (right.get(key) || 0); i++) missing.push(JSON.parse(key));
  for (const [key, count] of right) for (let i = 0; i < count - (left.get(key) || 0); i++) extra.push(JSON.parse(key));
  return {missing, extra};
}

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function readSite(base, route) {
  const url = new URL(route, base).toString();
  const html = await getText(url);
  const css = await getText(new URL('styles.css', base).toString());
  return {html, css};
}

async function readLocal(route) {
  return {
    html: await fs.readFile(path.join(ROOT, 'dist', route), 'utf8'),
    css: await fs.readFile(path.join(ROOT, 'dist', 'styles.css'), 'utf8')
  };
}

async function audit({reference = defaults.reference, candidate = defaults.candidate, local = false} = {}) {
  const reports = [];
  for (const route of routes) {
    const [left, right] = local ? [await readSite(reference, route), await readLocal(route)] : await Promise.all([readSite(reference, route), readSite(candidate, route)]);
    const referenceHtml = flattenHtml(parseHtml(left.html));
    const candidateHtml = flattenHtml(parseHtml(right.html));
    const html = compareLists(referenceHtml, candidateHtml, 'html');
    const htmlExpressions = multisetDifference(referenceHtml, candidateHtml);
    const referenceCss = parseCss(left.css);
    const candidateCss = parseCss(right.css);
    const css = route === 'index.html' ? compareLists(referenceCss, candidateCss, 'css') : [];
    const cssExpressions = route === 'index.html' ? cssMultisetDifference(referenceCss, candidateCss) : {missing: [], extra: []};
    reports.push({route, referenceBytes: left.html.length, candidateBytes: right.html.length, htmlDifferences: html, htmlExpressions, cssDifferences: css, cssExpressions});
  }
  return {reference, candidate: local ? 'local dist/' : candidate, routes: reports};
}

if (require.main === module) {
  const args = new Map(process.argv.slice(2).map(arg => { const [key, value] = arg.split('=', 2); return [key, value ?? true]; }));
  audit({reference: args.get('--reference') || defaults.reference, candidate: args.get('--candidate') || defaults.candidate, local: args.has('--local')})
    .then(report => {
      const summary = report.routes.map(route => ({route: route.route, htmlDifferences: route.htmlDifferences.length, cssDifferences: route.cssDifferences.length}));
      console.log(JSON.stringify({summary, report}, null, 2));
      process.exitCode = summary.some(item => item.htmlDifferences || item.cssDifferences) ? 1 : 0;
    })
    .catch(error => { console.error(error.stack); process.exitCode = 1; });
}

module.exports = {audit, parseHtml, parseCss};
