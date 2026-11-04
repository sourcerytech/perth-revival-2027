import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPage } from './site-assurance.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const spec = JSON.parse(await readFile(resolve(root, 'source/perth-encounter.process.json'), 'utf8'));
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const drifted = html.replace('href="commons.html"', 'href="old-commons.html"');
const result = inspectPage(drifted, spec);
if (result.navigationMatches) throw new Error('The drift fixture was not detected');
console.log('PASS: intentional navigation drift was rejected');
