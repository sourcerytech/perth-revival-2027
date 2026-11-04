/* Node host bootstrap. Native effects are supplied by explicit leaf adapters. */
'use strict';

const {createKernel, parseRel} = require('./temple-seed.cjs');
const {createNodeHost} = require('./ports/node.cjs');
const {valuePorts} = require('./ports/value.cjs');
const {selectPorts} = require('./ports/register.cjs');
const {createRuntimePort} = require('./hosts/runtime.cjs');

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
  const facts = [];
  for (const file of manifest.sources) facts.push(...parseRel(await host.read(file),file));
  const ports = selectPorts({...valuePorts(),...host.ports,
    'runtime.bundle':createRuntimePort(model,facts,policy.profiles)},policy.profiles.build);
  const env = {model,facts};
  await createKernel(ports,manifest.executionBudget || 2000000).run(model.queries[model.entry],env);
  const receipt = {protocol:'temple/bootstrap-build/1',
    seedSha256:host.sources['bootstrap/temple-seed.cjs'],
    nativeSources:Object.fromEntries(native.files.map(file=>[file,host.sources[file]])),
    portProfiles:policy.profiles,sources:{...host.sources},artifacts:{...host.artifacts},
    mjsImports:[],assurance:env.assurance};
  await host.write('build-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  return {output:host.outputName,artifacts:Object.keys(receipt.artifacts).length,assurance:env.assurance};
}

module.exports = {build};
if (require.main === module) build({root:process.argv[2],output:process.argv[3]}).then(result=>{
  console.log(JSON.stringify(result));
}).catch(error=>{console.error(error.stack);process.exitCode=1;});
