import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../source/html-rel/core/rel-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const value = (facts, subject, predicate, fallback = '') => facts.find(f => f.s === subject && f.p === predicate && f.pol !== 'is-not')?.o ?? fallback;
const values = (facts, subject, predicate) => facts.filter(f => f.s === subject && f.p === predicate && f.pol !== 'is-not').map(f => f.o);
const subjectsOfType = (facts, type) => [...new Set(facts.filter(f => f.p === 'isa' && f.o === type).map(f => f.s))];

export async function loadSiteContract() {
  const semantic = parse(await readFile(resolve(root, 'source/semantic/perth-encounter.rel'), 'utf8'), {file:'source/semantic/perth-encounter.rel'});
  const contract = parse(await readFile(resolve(root, 'source/semantic/site-contract.rel'), 'utf8'), {file:'source/semantic/site-contract.rel'});
  const site = subjectsOfType(semantic, 'Site')[0];
  const navigation = values(semantic, site, 'navigation').map(item => ({label:value(semantic,item,'label'), href:value(semantic,item,'href'), cta:value(semantic,item,'cta') === 'true'}));
  const pages = subjectsOfType(semantic, 'Page').map(page => ({
    path:value(semantic,page,'route'), role:value(semantic,page,'role'), title:value(semantic,page,'title'), description:value(semantic,page,'description'), contentAnchors:values(contract,page,'contentAnchor')
  }));
  const contractSubject = subjectsOfType(contract, 'SiteContract')[0];
  const requirements = values(contract, contractSubject, 'requirement').map(subject => value(contract, subject, 'rule'));
  const assets = values(contract, contractSubject, 'assetRole').map(subject => ({role:subject, path:value(contract,subject,'path'), required:value(contract,subject,'required') === 'true'}));
  const signup = values(contract, contractSubject, 'protocol').map(subject => ({protocol:subject, states:values(contract,subject,'request').concat(values(contract,subject,'success'), values(contract,subject,'failure'), values(contract,subject,'refusal'))}))[0];
  if (pages.some(page => !page.path || !page.title || !page.description || !page.contentAnchors.length)) throw new Error('Site contract has an incomplete public page.');
  if (!navigation.length || !requirements.length || assets.some(asset => asset.required && !asset.path) || !signup) throw new Error('Site contract is incomplete.');
  return {navigation, pages, requirements, assets, signup};
}
