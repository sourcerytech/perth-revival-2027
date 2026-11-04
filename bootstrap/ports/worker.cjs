'use strict';

function workerPorts(host, primitives) {
  const {Response, FormData, fetch, btoa} = host;
  return {
    ...primitives,
    'http.method': ({request}) => request.method,
    'http.decode': async ({request}) => { try { return {ok: true, value: await request.json()}; } catch { return {ok:false, value:{}}; } },
    'http.header': ({request, name}) => request.headers.get(name) || '',
    'http.respond': ({body, status, headers}) => new Response(body == null ? null : JSON.stringify(body), {status, headers}),
    'mail.send': async ({url, from, to, subject, text, replyTo, key}) => {
      const body = new FormData();
      for (const [name, value] of Object.entries({from, to, subject, text, 'h:Reply-To': replyTo})) body.append(name, value);
      const response = await fetch(url, {method: 'POST', headers: {Authorization: 'Basic ' + btoa('api:' + key)}, body});
      return {ok: response.ok, status: response.status};
    },
  };
}

module.exports = {workerPorts};
