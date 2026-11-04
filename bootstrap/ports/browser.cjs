'use strict';

function browserPorts(host, dispatch) {
  const {document, fetch, reportError} = host;
  const node = selector => { const result = document.querySelector(selector); if (!result) throw Error('Missing DOM target: ' + selector); return result; };
  return {
    'dom.exists': ({selector}) => Boolean(document.querySelector(selector)),
    'dom.on': ({selector, event, query, preventDefault}) => { node(selector).addEventListener(event, e => {
      if (preventDefault) e.preventDefault();
      dispatch(query).catch(reportError);
    }); return true; },
    'dom.value': ({selector}) => node(selector).value,
    'dom.checked': ({selector}) => node(selector).checked,
    'dom.attribute': ({selector, name}) => node(selector).getAttribute(name),
    'dom.setAttribute': ({selector, name, value}) => { node(selector).setAttribute(name, String(value)); return true; },
    'dom.classToggle': ({selector, name, value}) => { node(selector).classList.toggle(name, value); return true; },
    'dom.text': ({selector, text}) => { node(selector).textContent = text; return true; },
    'dom.reset': ({selector}) => { node(selector).reset(); return true; },
    'http.json': async ({url, method, body}) => {
      const response = await fetch(url, {method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      return {ok: response.ok, status: response.status, data};
    },
  };
}

module.exports = {browserPorts};

