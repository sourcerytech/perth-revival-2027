'use strict';

const {createKernel} = require('../temple-seed.cjs');
const {valuePorts} = require('../ports/value.cjs');
const {browserPorts} = require('../ports/browser.cjs');
const {workerPorts} = require('../ports/worker.cjs');
const {selectPorts} = require('../ports/register.cjs');

function hydrateSnapshot(text) {
  return JSON.parse(text,(_,value)=>value&&typeof value==='object'?Object.freeze(value):value);
}

async function startBrowser(model, factIndex, grants) {
  const host = {document, fetch, reportError:error => console.error(error)};
  const dispatch = async query => {
    const ports = selectPorts(browserPorts(host, dispatch), grants);
    await createKernel(ports).run(model.queries[query], {model, factIndex});
  };
  await dispatch(model.entry);
}

async function startWorker(model, factIndex, grants, request, secrets) {
  const host = {Response, FormData, fetch, btoa};
  const ports = selectPorts(workerPorts(host, valuePorts()), grants);
  const env = {model, factIndex, request, secrets};
  await createKernel(ports).run(model.queries[model.entry], env);
  return env.result;
}

function createRuntimePort(model, facts, profiles, makeIndex, admit) {
  return async ({entry, mode, queries, factSubjects}) => {
    const grants = profiles[mode];
    if (!['browser','worker'].includes(mode) || !Array.isArray(grants)) throw Error('Unknown runtime profile');
    const selected = Object.fromEntries(queries.map(name => {
      if (!Object.hasOwn(model.queries, name)) throw Error('Missing runtime programme: ' + name);
      return [name, model.queries[name]];
    }));
    const runtimeModel = {queries:selected, entry};
    if(admit){
      await admit(runtimeModel,'admit.model');
      await admit(runtimeModel,'admit.effects',grants);
      // Event entrypoints are supplied by the authored bundle, not necessarily called by boot.
      for(const name of queries)await admit({...runtimeModel,entry:name},'admit.effects',grants);
    }
    const runtimeFacts = facts.filter(f => factSubjects.includes(f.s));
    const factIndex=await makeIndex(runtimeFacts);
    // Validate the grant names before generating the bundle; creating factories has no effects.
    const available = mode === 'browser' ? browserPorts({},()=>{}) : workerPorts({},valuePorts());
    selectPorts(available,grants);
    const common = createKernel.toString() + '\n' + selectPorts.toString() + '\n' + hydrateSnapshot.toString() +
      '\nconst model=hydrateSnapshot(' + JSON.stringify(JSON.stringify(runtimeModel)) + ');\nconst factIndex=hydrateSnapshot(' + JSON.stringify(JSON.stringify(factIndex)) + ')' +
      ';\nconst grants=' + JSON.stringify(grants) + ';\n';
    if (mode === 'browser') return common + browserPorts.toString() + '\n' + startBrowser.toString() + '\nstartBrowser(model,factIndex,grants);\n';
    return common + valuePorts.toString() + '\n' + workerPorts.toString() + '\n' + startWorker.toString() +
      '\nexport default {fetch(request,secrets){return startWorker(model,factIndex,grants,request,secrets)}};\n';
  };
}

module.exports = {createRuntimePort};
