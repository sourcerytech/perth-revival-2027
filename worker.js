const ALLOWED_ORIGIN = 'https://sourcerytech.github.io';
const EVENT_NAME = 'The Emptying Flame — Perth Revival 7/7/27';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function response(body, status, origin) {
  return new Response(JSON.stringify(body), {status, headers: corsHeaders(origin)});
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});
    if (request.method !== 'POST') return response({error: 'POST only'}, 405, origin);
    if (origin && origin !== ALLOWED_ORIGIN) return response({error: 'Origin not allowed'}, 403, origin);

    let payload;
    try { payload = await request.json(); } catch { return response({error: 'Invalid JSON'}, 400, origin); }
    const email = String(payload.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({error: 'A valid email is required'}, 422, origin);
    if (payload.consent !== true) return response({error: 'Consent is required'}, 422, origin);
    if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.NOTIFY_TO) return response({error: 'Signup service is not configured'}, 503, origin);

    const form = new FormData();
    form.append('from', `${EVENT_NAME} <hello@${env.MAILGUN_DOMAIN}>`);
    form.append('to', env.NOTIFY_TO);
    form.append('subject', `New Perth Revival interest: ${email}`);
    form.append('text', `A visitor registered interest in ${EVENT_NAME}.\n\nEmail: ${email}\nConsent: yes\nSource: ${payload.source || 'website'}`);
    form.append('h:Reply-To', email);

    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`},
      body: form
    });
    if (!mailgunResponse.ok) return response({error: 'Mail delivery failed'}, 502, origin);
    return response({ok: true}, 200, origin);
  }
};
