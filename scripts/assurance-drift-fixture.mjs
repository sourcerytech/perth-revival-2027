import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPage } from './site-assurance.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const spec = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.process.json'), 'utf8'));
const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const drifted = html.replace('href="commons.html"', 'href="old-commons.html"');
const result = inspectPage(drifted, {...spec, _pageUnderTest: 'index.html'});
if (result.navigationMatches) throw new Error('The drift fixture was not detected');
const contentDrifted = html.split('One night, given to God').join('One night, given away');
const contentResult = inspectPage(contentDrifted, {...spec, _pageUnderTest: 'index.html'});
if (contentResult.contentMatches) throw new Error('The content drift fixture was not detected');
console.log('PASS: intentional navigation and content drift were rejected');
