import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../source/html-rel/core/rel-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const factsFor = (facts, file) => parse(facts, { file });
const value = (facts, subject, predicate) => facts.find(f => f.s === subject && f.p === predicate && f.pol !== 'is-not')?.o;
const values = (facts, subject, predicate) => facts.filter(f => f.s === subject && f.p === predicate && f.pol !== 'is-not').map(f => f.o);
const subjectsOfType = (facts, type) => [...new Set(facts.filter(f => f.p === 'isa' && f.o === type).map(f => f.s))];
const js = value => JSON.stringify(String(value));

function assertProcess(facts, process, configuration) {
  if (!subjectsOfType(facts, 'Process').includes(process)) throw new Error(`${process} is not a Process.`);
  if (!configuration || !subjectsOfType(facts, 'ProcessConfiguration').includes(configuration)) throw new Error(`${process} has no configuration.`);
  const transitions = subjectsOfType(facts, 'ProcessTransition').filter(subject => values(facts, subject, 'process').includes(process) || value(facts, process, 'entry') === value(facts, subject, 'from'));
  if (!transitions.length) throw new Error(`${process} has no transitions.`);
  for (const transition of transitions) for (const predicate of ['from', 'event', 'to', 'effect']) if (!value(facts, transition, predicate)) throw new Error(`${transition} is missing ${predicate}.`);
}

function browserSource(facts) {
  const process = 'process.browser';
  const config = value(facts, process, 'configuration');
  assertProcess(facts, process, config);
  const get = predicate => value(facts, config, predicate);
  return `/* Generated from source/semantic/browser-process.rel. Do not edit. */
const form = document.querySelector(${js(get('formSelector'))});
const note = document.querySelector(${js(get('noteSelector'))});
const menuToggle = document.querySelector(${js(get('menuSelector'))});
const siteNav = document.querySelector(${js(get('navSelector'))});
const signupEndpoint = ${js(get('endpoint'))};

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    siteNav.classList.toggle('is-open', !open);
  });
}

if (form) form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector(${js(get('emailSelector'))});
  const consent = document.querySelector(${js(get('consentSelector'))});
  note.textContent = ${js(get('sendingMessage'))};
  fetch(signupEndpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: email.value, consent: consent.checked, source: ${js(get('source'))}})
  }).then(async (response) => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || ${js(get('defaultError'))});
    note.textContent = ${js(get('successMessage'))};
    note.style.color = ${js(get('successColor'))};
    form.reset();
  }).catch((error) => {
    note.textContent = error.message || ${js(get('defaultError'))};
    note.style.color = ${js(get('errorColor'))};
  });
});
`;
}

function workerSource(facts) {
  const process = 'process.worker';
  const config = value(facts, process, 'configuration');
  assertProcess(facts, process, config);
  const get = predicate => value(facts, config, predicate);
  return `/* Generated from source/semantic/worker-process.rel. Do not edit. */
const PUBLIC_ORIGIN = ${js(get('publicOrigin'))};
const LEGACY_ORIGIN = ${js(get('legacyOrigin'))};
const ALLOWED_ORIGINS = new Set([PUBLIC_ORIGIN, LEGACY_ORIGIN]);
const EVENT_NAME = ${js(get('eventName'))};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PUBLIC_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function response(body, status, origin) { return new Response(JSON.stringify(body), {status, headers: corsHeaders(origin)}); }
function normaliseEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function isValidEmail(email) {
  const at = email.indexOf('@');
  const dot = email.lastIndexOf('.');
  return email.length > 5 && at > 0 && dot > at + 1 && dot < email.length - 1 && !/[\\s<>]/.test(email);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});
    if (request.method !== ${js(get('method'))}) return response({error: 'POST only'}, 405, origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return response({error: 'Origin not allowed'}, 403, origin);
    let payload;
    try { payload = await request.json(); } catch { return response({error: 'Invalid JSON'}, 400, origin); }
    const email = normaliseEmail(payload.email);
    if (!isValidEmail(email)) return response({error: 'A valid email is required'}, 422, origin);
    if (payload.consent !== true) return response({error: 'Consent is required'}, 422, origin);
    if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.NOTIFY_TO) return response({error: 'Signup service is not configured'}, 503, origin);
    const form = new FormData();
    form.append('from', \`\${EVENT_NAME} <hello@\${env.MAILGUN_DOMAIN}>\`);
    form.append('to', env.NOTIFY_TO);
    form.append('subject', \`New Perth Encounter interest: \${email}\`);
    form.append('text', \`A visitor registered interest in \${EVENT_NAME}.\\n\\nEmail: \${email}\\nConsent: yes\\nSource: \${payload.source || 'website'}\`);
    form.append('h:Reply-To', email);
    const mailgunResponse = await fetch(\`https://api.mailgun.net/v3/\${env.MAILGUN_DOMAIN}/messages\`, {
      method: 'POST', headers: {Authorization: \`Basic \${btoa(\`api:\${env.MAILGUN_API_KEY}\`)}\`}, body: form
    });
    if (!mailgunResponse.ok) return response({error: 'Mail delivery failed'}, 502, origin);
    return response({ok: true}, 200, origin);
  }
};
`;
}

export async function renderRuntimeProcesses(out) {
  const browserText = await readFile(resolve(root, 'source/semantic/browser-process.rel'), 'utf8');
  const workerText = await readFile(resolve(root, 'source/semantic/worker-process.rel'), 'utf8');
  const browserFacts = factsFor(browserText, 'source/semantic/browser-process.rel');
  const workerFacts = factsFor(workerText, 'source/semantic/worker-process.rel');
  await writeFile(resolve(out, 'script.js'), browserSource(browserFacts));
  await writeFile(resolve(out, 'worker.js'), workerSource(workerFacts));
}
