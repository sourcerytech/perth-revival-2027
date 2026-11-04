/* Node host bootstrap. Native effects are supplied by explicit leaf adapters. */
'use strict';

const {createKernel} = require('./temple-seed.cjs');
const {parseRel} = require('./ports/rel-codec.cjs');
const {createNodeHost} = require('./ports/node.cjs');
const {valuePorts} = require('./ports/value.cjs');
const {selectPorts} = require('./ports/register.cjs');
const {createRuntimePort} = require('./hosts/runtime.cjs');
const {lower} = require('./ports/algebra-lower.cjs');
const {indexFacts} = require('./ports/fact-index.cjs');
const {invoke} = require('./ports/programme.cjs');

async function build({root = __dirname + '/..', output = 'dist'} = {}) {
  const host = await createNodeHost({root,output});
  const manifest = JSON.parse(await host.read('bootstrap/site.json'));
  if (manifest.protocol !== 'temple/bootstrap-site/1') throw Error('Unknown bootstrap protocol');
  const native = JSON.parse(await host.read(manifest.nativeSource));
  if (native.protocol !== 'temple/native-port-closure/1') throw Error('Unknown native port closure');
  host.verifyNativeClosure(native.files,native.entry);
  for (const file of native.files) await host.read(file);
  const policy = JSON.parse(await host.read(manifest.hostPorts));
  if (policy.protocol !== 'temple/native-port-grants/1') throw Error('Unknown native port policy');
  const model = {queries:Object.create(null),entry:manifest.entry};
  for (const file of manifest.modules) {
    const module = JSON.parse(await host.read(file));
    if (module.protocol !== 'temple/surface-process-module/1') throw Error('Unknown module protocol');
    for (const [name,programme] of Object.entries(module.queries)) {
      if (Object.hasOwn(model.queries,name)) throw Error('Duplicate programme: ' + name);
      model.queries[name] = programme;
    }
  }
  const definitions=JSON.parse(await host.read(manifest.operatorDefinitions));
  const compiler=JSON.parse(await host.read(manifest.operatorCompiler));
  if(compiler.protocol!=='temple/surface-process-module/1')throw Error('Unknown lowering programme protocol');
  const compile=input=>lower({compiler,definitions,primitives:createKernel.operators,input,mode:'model',ports:valuePorts(),limit:manifest.executionBudget});
  const compiled=await compile(model);
  const profile=JSON.parse(await host.read(manifest.kernelProfile));
  if(profile.protocol!=='temple/kernel-profile/1')throw Error('Unknown kernel profile');
  if(JSON.stringify(Object.keys(profile.operators))!==JSON.stringify(createKernel.operators))throw Error('Kernel/profile vocabulary drift');
  const admission=await compile(JSON.parse(await host.read(manifest.admission)));
  const admissionUsage=[];
  const admit=async (target,entry,grants)=>{
    const result=await invoke({model:admission,entry,input:{profile,target,grants},ports:valuePorts(),limit:manifest.executionBudget});
    admissionUsage.push(result.usage.steps);
  };
  await admit(compiled,'admit.model');
  await admit(compiled,'admit.effects',policy.profiles.build);
  const language=await compile(JSON.parse(await host.read(manifest.languageCompiler)));
  await admit({...language,entry:'language.compile'},'admit.model');
  await admit({...language,entry:'language.compile'},'admit.effects',policy.profiles.compilation);
  const languageResults=[];
  const ownedSources=[];
  const facts = [];
  const compilationPorts=selectPorts(valuePorts(),policy.profiles.compilation);
  for(const file of manifest.languageSources){
    const result=await invoke({model:language,entry:'language.compile',input:{file,text:await host.read(file)},ports:compilationPorts,limit:manifest.executionBudget});
    if(!result.value.ok){
      const diagnostic=result.value.diagnostic;
      throw Object.assign(Error(diagnostic.summary),{code:diagnostic.code,diagnostic});
    }
    languageResults.push({file,...result.value,steps:result.usage.steps});
    const emitted=parseRel(result.value.rel,file+' (lowered REL)');
    ownedSources.push({file,facts:emitted});
    facts.push(...emitted);
  }
  for (const file of manifest.sources){
    const parsed=parseRel(await host.read(file),file);
    ownedSources.push({file,facts:parsed});facts.push(...parsed);
  }
  const ownership=await invoke({model:admission,entry:'admit.ownership',input:{sources:ownedSources},ports:valuePorts(),limit:manifest.executionBudget});
  admissionUsage.push(ownership.usage.steps);
  const indexer=JSON.parse(await host.read(manifest.factIndexer));
  if(indexer.protocol!=='temple/surface-process-module/1')throw Error('Unknown fact index programme protocol');
  let kernel;
  const makeIndex=input=>indexFacts(kernel,indexer,input);
  const ports = selectPorts({...valuePorts(),...host.ports,
    'runtime.bundle':createRuntimePort(compiled,facts,policy.profiles,makeIndex,admit)},policy.profiles.build);
  kernel=createKernel(ports,manifest.executionBudget);
  const factIndex=await makeIndex(facts),indexSteps=kernel.usage.steps;
  const env = {model:compiled,factIndex};
  await kernel.run(compiled.queries[model.entry],env);
  for(const [index,result] of languageResults.entries()){
    await host.write('language/'+index+'.rel',result.rel);
    await host.write('language/'+index+'.map.json',JSON.stringify({protocol:'temple/language-source-map/1',file:result.file,sourceSha256:host.sources[result.file],compiler:{file:manifest.languageCompiler,sha256:host.sources[manifest.languageCompiler]},relSha256:host.digest(result.rel),module:result.module,origins:result.origins},null,2)+'\n');
  }
  const receipt = {protocol:'temple/bootstrap-build/1',
    seedSha256:host.sources['bootstrap/temple-seed.cjs'],
    nativeSources:Object.fromEntries(native.files.map(file=>[file,host.sources[file]])),
    portProfiles:policy.profiles,sources:{...host.sources},artifacts:{...host.artifacts},
    execution:{indexSteps,applicationSteps:kernel.usage.steps-indexSteps,totalSteps:kernel.usage.steps,limit:kernel.usage.limit},
    factSnapshot:{protocol:factIndex.protocol,factCount:factIndex.factCount},
    kernelProfile:profile.protocol,admission:{passes:admissionUsage.length,steps:admissionUsage},
    language:languageResults.map(result=>({file:result.file,module:result.module,facts:result.facts.length,steps:result.steps,origins:result.origins})),
    mjsImports:[],assurance:env.assurance};
  await host.write('build-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  return {output:host.outputName,artifacts:Object.keys(receipt.artifacts).length,assurance:env.assurance};
}

module.exports = {build};
if (require.main === module) build({root:process.argv[2],output:process.argv[3]}).then(result=>{
  console.log(JSON.stringify(result));
}).catch(error=>{console.error(error.diagnostic?JSON.stringify(error.diagnostic,null,2):error.stack);process.exitCode=1;});
