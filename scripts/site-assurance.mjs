import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const linkPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const navPattern = /<nav\b[^>]*id="site-nav"[^>]*>([\s\S]*?)<\/nav>/i;

function localTarget(href) {
  return href.split('#')[0].split('?')[0];
}

export function declaredNavigation(spec) {
  return spec.navigation.map(item => ({label: item.label, href: item.href, cta: Boolean(item.cta)}));
}

export function inspectPage(html, spec) {
  const nav = html.match(navPattern)?.[1] || '';
  const actual = [...nav.matchAll(linkPattern)].map(match => ({
    label: match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    href: match[1],
    cta: /\bnav-cta\b/.test(match[0])
  }));
  const expected = declaredNavigation(spec);
  const title = /<title>\s*([^<]+?)\s*<\/title>/i.exec(html)?.[1] || '';
  const description = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] || '';
  const contentFailures = (spec.pages.find(page => page.path === spec._pageUnderTest)?.contentAnchors || [])
    .filter(anchor => !html.includes(anchor));
  return {
    navigationMatches: JSON.stringify(actual) === JSON.stringify(expected),
    titlePresent: Boolean(title),
    descriptionPresent: Boolean(description),
    contentMatches: contentFailures.length === 0,
    contentFailures,
    actual,
    expected
  };
}

export async function verifySite(root, spec) {
  const failures = [];
  const declaredPages = new Set(spec.pages.map(page => page.path));
  for (const page of spec.pages) {
    const file = resolve(root, page.path);
    let html;
    try { html = await readFile(file, 'utf8'); }
    catch { failures.push(`${page.path}: declared page is missing`); continue; }
    const result = inspectPage(html, {...spec, _pageUnderTest: page.path});
    if (!result.navigationMatches) failures.push(`${page.path}: navigation drift detected`);
    if (!result.titlePresent) failures.push(`${page.path}: title is missing`);
    if (!result.descriptionPresent) failures.push(`${page.path}: description is missing`);
    for (const anchor of result.contentFailures) failures.push(`${page.path}: content drift detected for ${JSON.stringify(anchor)}`);
    for (const item of spec.navigation) {
      const target = localTarget(item.href);
      if (target && target !== 'index.html' && !declaredPages.has(target)) failures.push(`${page.path}: navigation target ${target} is undeclared`);
    }
  }
  return {ok: failures.length === 0, failures};
}
