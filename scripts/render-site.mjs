import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const publicOrigin = 'https://perth-encounter-2027.musicalsunbird.chatgpt.site';

function escape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderNode(node) {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  const attrs = Object.entries(node.attrs ?? {}).map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escape(value)}"`).join('');
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  if (voidTags.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${(node.children ?? []).map(renderNode).join('')}</${node.tag}>`;
}

function pageDocument(page, ast) {
  const bodyClass = page.role === 'home' ? '' : page.role === 'testimony' ? ' class="source-page testimony-page"' : ' class="source-page"';
  const imageMeta = page.role === 'home' ? `
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Perth Encounter">
  <meta property="og:title" content="${escape(page.title)}">
  <meta property="og:description" content="One night, given to God: worship, prayer, beauty and practical love in Perth.">
  <meta property="og:image" content="${publicOrigin}/assets/social-card.png">
  <meta property="og:image:width" content="1536">
  <meta property="og:image:height" content="864">
  <meta property="og:url" content="${publicOrigin}/">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(page.title)}">
  <meta name="twitter:description" content="One night, given to God: worship, prayer, beauty and practical love in Perth.">
  <meta name="twitter:image" content="${publicOrigin}/assets/social-card.png">` : '';
  return `<!doctype html>
<html lang="en-AU"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#141e2d">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/favicon.svg">
  ${imageMeta}
  <meta name="description" content="${escape(page.description)}">
  <title>${escape(page.title)}</title>
  <link rel="stylesheet" href="styles.css">
</head><body${bodyClass}>${ast.body.map(renderNode).join('')}</body></html>
`;
}

export async function renderSite(root, out, spec) {
  const pages = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.pages.json'), 'utf8'));
  const navigation = spec.navigation.map(item => {
    const className = item.cta ? ' class="nav-cta"' : '';
    return `<a${className} href="${item.href}">${item.label}</a>`;
  }).join('');
  await mkdir(out, {recursive: true});
  for (const page of spec.pages) {
    const ast = pages.pages[page.path];
    if (!ast) throw new Error(`Missing declarative page source: ${page.path}`);
    const html = pageDocument(page, ast).replace(/(<nav\b[^>]*id="site-nav"[^>]*>)[\s\S]*?(<\/nav>)/i, `$1${navigation}$2`);
    await writeFile(resolve(out, page.path), html);
  }
  await cp(resolve(root, 'source/runtime/styles.css'), resolve(out, 'styles.css'), {force: true});
  await cp(resolve(root, 'source/runtime/script.js'), resolve(out, 'script.js'), {force: true});
  await cp(resolve(root, 'source/runtime/worker.js'), resolve(out, 'worker.js'), {force: true});
}
