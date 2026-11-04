'use strict';

const {createKernel} = require('../temple-seed.cjs');
const {valuePorts} = require('../ports/value.cjs');
const {browserPorts} = require('../ports/browser.cjs');
const {workerPorts} = require('../ports/worker.cjs');
const {selectPorts} = require('../ports/register.cjs');

async function startBrowser(model, facts, grants) {
  const host = {document, fetch, reportError:error => console.error(error)};
  const dispatch = async query => {
    const ports = selectPorts(browserPorts(host, dispatch), grants);
    await createKernel(ports).run(model.queries[query], {model, facts});
  };
  await dispatch(model.entry);
}

async function startWorker(model, facts, grants, request, secrets) {
  const host = {Response, FormData, fetch, btoa};
  const ports = selectPorts(workerPorts(host, valuePorts()), grants);
  const env = {model, facts, request, secrets};
  await createKernel(ports).run(model.queries[model.entry], env);
  return env.result;
}

function createRuntimePort(model, facts, profiles) {
  return ({entry, mode, queries, factSubjects}) => {
    const selected = Object.fromEntries(queries.map(name => {
      if (!Object.hasOwn(model.queries, name)) throw Error('Missing runtime programme: ' + name);
      return [name, model.queries[name]];
    }));
    const runtimeModel = {queries:selected, entry};
    const runtimeFacts = facts.filter(f => factSubjects.includes(f.s));
    const grants = profiles[mode];
    if (!['browser','worker'].includes(mode) || !Array.isArray(grants)) throw Error('Unknown runtime profile');
    // Validate the grant names before generating the bundle; creating factories has no effects.
    const available = mode === 'browser' ? browserPorts({},()=>{}) : workerPorts({},valuePorts());
    selectPorts(available,grants);
    const common = createKernel.toString() + '\n' + selectPorts.toString() +
      '\nconst model=' + JSON.stringify(runtimeModel) + ';\nconst facts=' + JSON.stringify(runtimeFacts) +
      ';\nconst grants=' + JSON.stringify(grants) + ';\n';
    if (mode === 'browser') return common + browserPorts.toString() + '\n' + startBrowser.toString() + '\nstartBrowser(model,facts,grants);\n';
    return common + valuePorts.toString() + '\n' + workerPorts.toString() + '\n' + startWorker.toString() +
      '\nexport default {fetch(request,secrets){return startWorker(model,facts,grants,request,secrets)}};\n';
  };
}

module.exports = {createRuntimePort};
