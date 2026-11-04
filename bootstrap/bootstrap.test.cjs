'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {createKernel} = require('./temple-seed.cjs');
const {parseRel} = require('./ports/rel-codec.cjs');
const {valuePorts} = require('./ports/value.cjs');
const {selectPorts} = require('./ports/register.cjs');
const {createNodeHost} = require('./ports/node.cjs');
const {lower} = require('./ports/algebra-lower.cjs');
const {indexFacts} = require('./ports/fact-index.cjs');
const {createRuntimePort} = require('./hosts/runtime.cjs');

const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let proof;
let indexedHistories=0;

async function makeIndex(facts,kernel=createKernel(valuePorts(),20000000)) {
  const programme=JSON.parse(await fs.readFile(path.join(root,'algebra/fact-index.process.json'),'utf8'));
  return indexFacts(kernel,programme,facts);
}

async function lowerInput(input,definitions,mode='expression') {
  const compiler=JSON.parse(await fs.readFile(path.join(root,'algebra/lowering.process.json'),'utf8'));
  return lower({compiler,definitions,primitives:createKernel.operators,input,mode,ports:valuePorts()});
}

async function htmlQuery(query, input) {
  const model = JSON.parse(await fs.readFile(path.join(root, 'algebra/html.process.json'), 'utf8'));
  const definitions = JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json'),'utf8'));
  const compiled = await lowerInput(model,definitions,'model');
  const env = {model:compiled, input};
  await createKernel(valuePorts()).run(compiled.queries[query], env);
  return env.result;
}

test('the retired MJS implementation tree is absent from the repository', async () => {
  for (const directory of ['source', 'scripts']) {
    const entries = await files(path.join(root, directory)).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    assert.deepEqual(entries.filter(file => file.endsWith('.mjs')), [], directory);
  }
  await assert.rejects(fs.access(path.join(root, 'source/projection/semantic-page-to-dom-rel.mjs')));
});

async function files(dir, base = dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('Proof fixture must contain no symlinks');
    if (entry.isDirectory()) result.push(...await files(file, base));
    else result.push(path.relative(base, file).replaceAll('\\', '/'));
  }
  return result.sort();
}

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'temple-bootstrap-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const manifest = JSON.parse(await fs.readFile(path.join(root,'bootstrap/site.json')));
  const native = JSON.parse(await fs.readFile(path.join(root,manifest.nativeSource)));
  const inputFiles = ['bootstrap/site.json',manifest.nativeSource,manifest.hostPorts,manifest.operatorDefinitions,manifest.operatorCompiler,manifest.factIndexer,
    ...native.files,...manifest.sources,...manifest.modules];
  const facts = [];
  for (const file of manifest.sources) facts.push(...parseRel(await fs.readFile(path.join(root,file),'utf8'), file));
  inputFiles.push(...facts.filter(f => f.p === 'path' && facts.some(a => a.s === f.s && a.p === 'isa' && a.o === 'AssetRole')).map(f => f.o));
  for (const file of [...new Set(inputFiles)]) {
    await fs.mkdir(path.dirname(path.join(dir,file)), {recursive:true});
    await fs.copyFile(path.join(root,file), path.join(dir,file));
  }
  const inputs = await files(dir);
  assert.equal(inputs.some(f => f.endsWith('.mjs')), false);
  assert.equal(inputs.some(f => f.startsWith('scripts/') || f.includes('node_modules/')), false);
  const run = () => spawnSync(process.execPath, [path.join(dir,'bootstrap/run.cjs'),dir,'dist'], {
    cwd:dir, env:{...process.env,NODE_PATH:'',NODE_OPTIONS:'',PATH:''},encoding:'utf8',timeout:30000,
  });
  return {dir,run,inputs,facts};
}

test('isolated build needs only the seed, algebra, facts and assets', async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status,0,result.stderr);
  const receipt = JSON.parse(await fs.readFile(path.join(f.dir,'dist/build-receipt.json')));
  assert.deepEqual(receipt.assurance.ok,true);
  assert.equal(receipt.assurance.pages,8);
  assert.equal(receipt.assurance.navigation,5);
  assert.equal(receipt.execution.limit,20000000);
  assert.ok(receipt.execution.indexSteps>0);
  assert.ok(receipt.execution.totalSteps===receipt.execution.indexSteps+receipt.execution.applicationSteps);
  assert.ok(receipt.execution.totalSteps<=receipt.execution.limit);
  const pages = f.facts.filter(a => a.p === 'isa' && a.o === 'Page').map(a => a.s);
  const val = (s,p) => f.facts.find(a => a.s === s && a.p === p)?.o;
  for (const page of pages) {
    const html = await fs.readFile(path.join(f.dir,'dist',val(page,'route')),'utf8');
    assert.equal((html.match(/<main\b/g)||[]).length,1);
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    assert.ok(html.includes(await htmlQuery('html.serialize', val(page,'heading'))));
    for (const a of f.facts.filter(a => a.s === page && a.p === 'contentAnchor')) assert.ok(html.includes(a.o),a.o);
  }
  const css = await fs.readFile(path.join(f.dir,'dist/styles.css'),'utf8');
  assert.ok(css.includes(':focus-visible'));
  for (const fct of f.facts.filter(a => a.p === 'isa' && a.o === 'StyleRule')) {
    const selector=val(fct.s,'selector');
    assert.ok(css.includes(selector+'{'),selector);
  }
  for (const [file,digest] of Object.entries(receipt.artifacts)) assert.equal(hash(await fs.readFile(path.join(f.dir,'dist',file))),digest,file);
  const first = receipt.artifacts;
  assert.equal(f.run().status,0);
  const second = JSON.parse(await fs.readFile(path.join(f.dir,'dist/build-receipt.json')));
  assert.deepEqual(second.artifacts, first, 'Same inputs must yield byte-identical artifacts');
  const modelFile=path.join(f.dir,'algebra/view.rel');
  await fs.appendFile(modelFile,'\n("view.mutation", "isa", "AssetRole")\n("view.mutation", "path", "assets/missing.png")\n');
  assert.notEqual(f.run().status,0,'Missing required asset must stop the build');
  proof={protocol:'temple/no-mjs-build-proof/1',inputs:f.inputs,inputHashes:receipt.sources,
    seedSha256:receipt.seedSha256,artifacts:receipt.artifacts,assurance:receipt.assurance,
    nativeSources:receipt.nativeSources,portProfiles:receipt.portProfiles,execution:receipt.execution,factSnapshot:receipt.factSnapshot,
    isolated:true,mjsFileCount:0,nodePath:'',deterministic:true};
});

test('changing executable algebra changes output without changing the seed', async t => {
  const f=await fixture(t);
  assert.equal(f.run().status,0);
  const file=path.join(f.dir,'algebra/dom.process.json');
  const data=await fs.readFile(file,'utf8');
  const changed=data.replace('"hero-copy"','"hero-copy algebra-proof"');
  assert.notEqual(changed,data);
  await fs.writeFile(file,changed);
  assert.equal(f.run().status,0);
  assert.ok((await fs.readFile(path.join(f.dir,'dist/index.html'),'utf8')).includes('hero-copy algebra-proof'));
  assert.equal(hash(await fs.readFile(path.join(f.dir,'bootstrap/temple-seed.cjs'))),hash(await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'))));
});

test('unknown operations, missing programmes and navigation drift refuse a build', async t => {
  const f=await fixture(t), file=path.join(f.dir,'algebra/dom.process.json');
  const original=await fs.readFile(file,'utf8');
  let model=JSON.parse(original);
  model.queries['dom.page'].unshift({let:'bad',value:['unregistered-operation',1]});
  await fs.writeFile(file,JSON.stringify(model));
  assert.notEqual(f.run().status,0);
  await fs.writeFile(file,original);
  const manifestFile=path.join(f.dir,'bootstrap/site.json');
  const manifest=JSON.parse(await fs.readFile(manifestFile));
  manifest.modules=manifest.modules.filter(p => p!=='algebra/dom.process.json');
  await fs.writeFile(manifestFile,JSON.stringify(manifest));
  assert.notEqual(f.run().status,0);
  manifest.modules.push('algebra/dom.process.json');
  await fs.writeFile(manifestFile,JSON.stringify(manifest));
  await fs.writeFile(file,original.replaceAll('"site-nav"','"broken-nav"'));
  assert.notEqual(f.run().status,0);
});

async function runtimeFixture(t) {
  const f=await fixture(t); const result=f.run(); assert.equal(result.status,0,result.stderr);
  return {f,source:await fs.readFile(path.join(f.dir,'dist/script.js'),'utf8')};
}

test('generated browser programme executes menu, signup success, failure and no-form pages', async t => {
  const {source}=await runtimeFixture(t);
  assert.ok(source.includes('const factIndex='));
  assert.ok(!source.includes('const facts='));
  const settle=async()=>{for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};
  const nodes=Object.create(null), errors=[];
  function node(value='') {
    return {value,checked:true,textContent:'',events:{},attrs:{'aria-expanded':'false'},resetCount:0,classes:new Set(),
      addEventListener(event,fn){this.events[event]=fn;},
      getAttribute(key){return this.attrs[key];},setAttribute(key,value){this.attrs[key]=value;},
      reset(){this.resetCount++;},classList:{toggle(name,value){nodes['#site-nav'].classes[value?'add':'delete'](name);}}};
  }
  for(const selector of ['.menu-toggle','#site-nav','#interest-form','#form-note','#email','#consent'])nodes[selector]=node(selector==='#email'?'test@example.com':'');
  let success=true,networkFailure=false,requests=[];
  const context={document:{querySelector:s=>nodes[s]||null},console:{error:e=>errors.push(e)},fetch:async(url,request)=>{
    requests.push({url,...request});if(networkFailure)throw Error('offline');
    return {ok:success,status:success?200:502,json:async()=>success?{ok:true}:{error:'failed'}};
  }};
  vm.runInNewContext(source,context);
  await settle();
  nodes['.menu-toggle'].events.click(); await settle();
  assert.equal(nodes['.menu-toggle'].attrs['aria-expanded'],'true');
  assert.ok(nodes['#site-nav'].classes.has('is-open'));
  nodes['.menu-toggle'].events.click(); await settle();
  assert.equal(nodes['.menu-toggle'].attrs['aria-expanded'],'false');
  nodes['#interest-form'].events.submit({preventDefault(){}}); await settle();
  assert.equal(nodes['#interest-form'].resetCount,1);
  assert.equal(JSON.parse(requests[0].body).consent,true);
  assert.ok(nodes['#form-note'].textContent.includes('Thank you'));
  success=false;nodes['#interest-form'].events.submit({preventDefault(){}});await settle();
  assert.equal(nodes['#interest-form'].resetCount,1);
  assert.ok(nodes['#form-note'].textContent.includes('could not'));
  networkFailure=true;nodes['#interest-form'].events.submit({preventDefault(){}});await settle();
  assert.ok(nodes['#form-note'].textContent.includes('could not'));
  delete nodes['#interest-form'];
  vm.runInNewContext(source,{...context});await settle();
  assert.equal(errors.length,0);
});

test('generated worker handles method, origin, decoding, consent, secrets and delivery', async t => {
  const {f}=await runtimeFixture(t);
  const source=await fs.readFile(path.join(f.dir,'dist/worker.js'),'utf8');
  assert.ok(source.includes('const factIndex='));
  assert.ok(!source.includes('const facts='));
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
  const origin='https://sourcerytech.github.io';
  const request=(method='POST',body=JSON.stringify({email:'TEST@EXAMPLE.COM',consent:true}),o=origin)=>new Request('https://test.invalid',{method,headers:{Origin:o,'Content-Type':'application/json'},...(method==='POST'?{body}:{})});
  const secrets={MAILGUN_API_KEY:'TEST_ONLY_KEY',MAILGUN_DOMAIN:'mg.sourcerytech.com.au',NOTIFY_TO:'hello@sourcerytech.com.au'};
  assert.equal((await worker.fetch(request('OPTIONS'),{})).status,204);
  assert.equal((await worker.fetch(request('GET'),{})).status,405);
  assert.equal((await worker.fetch(request('POST',undefined,'https://bad.invalid'),secrets)).status,403);
  assert.equal((await worker.fetch(request('POST','{'),secrets)).status,400);
  assert.equal((await worker.fetch(request('POST','null'),secrets)).status,422);
  assert.equal((await worker.fetch(request('POST','{"email":"test@example.com","consent":false}'),secrets)).status,422);
  assert.equal((await worker.fetch(request(),{})).status,503);
  const original=globalThis.fetch;let sent;
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,opts)=>{sent={url,opts};return {ok:true,status:200};};
  const response=await worker.fetch(request(),secrets);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(sent.url,'https://api.mailgun.net/v3/mg.sourcerytech.com.au/messages');
  assert.equal(sent.opts.body.get('to'),secrets.NOTIFY_TO);
  assert.equal(sent.opts.body.get('h:Reply-To'),'test@example.com');
  globalThis.fetch=async()=>({ok:false,status:502});
  assert.equal((await worker.fetch(request(),secrets)).status,502);
  globalThis.fetch=async()=>{throw Error('offline');};
  assert.equal((await worker.fetch(request(),secrets)).status,502);
});

test('serializer escapes hostile content and evaluator enforces the host boundary', async () => {
  assert.equal(await htmlQuery('html.serialize', {tag:'p',children:['<img src=x onerror=evil>']}),'<p>&lt;img src=x onerror=evil&gt;</p>');
  await assert.rejects(htmlQuery('html.serialize', {tag:'a',attrs:{href:'javascript:alert(1)'}}),/Unsafe URL/);
  assert.throws(()=>createKernel().evaluate('$a.constructor',{a:{}}),/Invalid binding/);
  await assert.rejects(createKernel().run([{port:'module.import',args:{},into:'x'}],{}),/Unknown host port/);
  assert.throws(()=>createKernel({},10).evaluate(['range',11],{}),/Invalid bounded range/);
});

test('HTML rules hydrate from algebra and retain escaping and control naming', async () => {
  const element=(tag,attrs={},children=[])=>({tag,attrs,children});
  assert.equal(await htmlQuery('html.serialize', [null,false,'<&"',
    element('input',{disabled:true,value:'<&"'}),element('p',{},[['text'],0])]),
    '&lt;&amp;&quot;<input disabled="" value="&lt;&amp;&quot;"><p>text0</p>');
  for(const tree of [element('BAD'),element('p',{onclick:'bad'}),element('a',{href:' DATA:text/plain,bad'})])
    await assert.rejects(htmlQuery('html.serialize',tree));
  const observed=await htmlQuery('html.inspect',[
    element('span',{id:'first'},['First']),element('span',{id:'last'},['Last']),
    element('input',{'aria-labelledby':'first last'}),
    element('input',{'aria-labelledby':'first absent'}),
    element('input',{'aria-label':'  '}),
    element('label',{},[element('input'), 'Wrapped name']),
    element('label',{for:'named'},['Explicit name']),element('input',{id:'named'}),
    element('p',{id:'duplicate'}),element('p',{id:'duplicate'}),element('p',{id:'duplicate'}),
  ]);
  assert.deepEqual(observed.unnamed,['input','input']);
  assert.deepEqual(observed.duplicateIds,['duplicate','duplicate']);
  const source=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
  assert.ok(!source.includes('function serializeHtml'));
  assert.ok(!source.includes('function inspectTree'));
});

test('REL transport accepts multiline tuples and rejects unparsed input', () => {
  assert.deepEqual(parseRel('// comment\n(\n "s", "p", "o"\n)\n','fixture'),[{s:'s',p:'p',o:'o',pol:'is'}]);
  assert.throws(()=>parseRel('("s","p","o") trailing','fixture'),/invalid REL/);
});

test('the seed executes without Node, browser or worker globals', async () => {
  const source=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
  const sandbox={module:{exports:{}}};
  vm.runInNewContext(source,sandbox);
  assert.equal(typeof sandbox.require,'undefined');
  assert.equal(typeof sandbox.process,'undefined');
  assert.equal(typeof sandbox.document,'undefined');
  assert.equal(typeof sandbox.fetch,'undefined');
  assert.deepEqual(Object.keys(sandbox.module.exports),['createKernel']);
  const kernel=sandbox.module.exports.createKernel();
  const env={};
  await kernel.run([{let:'total',value:['add',2,3]}],env);
  assert.equal(env.total,5);
  for(const forbidden of ['node:fs','node:path','node:crypto','function parseRel','function valuePorts','function browserPorts','function workerPorts','runtime.bundle'])
    assert.ok(!source.includes(forbidden),forbidden);
});

test('native grants refuse missing, duplicate and ungranted ports', async () => {
  let called=false;
  const available={'file.write':()=>{called=true;}};
  const kernel=createKernel(selectPorts(available,[]));
  await assert.rejects(kernel.run([{port:'file.write',args:{},into:'x'}],{}),/Unknown host port/);
  assert.equal(called,false);
  assert.throws(()=>selectPorts(available,['file.delete']),/Unavailable native port/);
  assert.throws(()=>selectPorts(available,['file.write','file.write']),/Invalid native port grants/);
  const policy=JSON.parse(await fs.readFile(path.join(root,'bootstrap/ports.json')));
  assert.ok(policy.profiles.build.includes('file.write'));
  for(const mode of ['browser','worker'])assert.ok(!policy.profiles[mode].some(name=>name.startsWith('file.')));
});

test('the Node adapter contains file capabilities inside declared roots', async t => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'temple-native-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const host=await createNodeHost({root:directory,output:'output'});
  await host.write('example.txt','retained');
  assert.equal(await host.ports['file.read']({path:'example.txt'}),'retained');
  await assert.rejects(host.write('../escape.txt','denied'),/Path escapes root/);
  await assert.rejects(host.read('../escape.txt'),/Path escapes root/);
  await assert.rejects(createNodeHost({root:directory,output:'..'}),/Path escapes root/);
  await fs.mkdir(path.join(directory,'inputs'));
  await fs.writeFile(path.join(directory,'inputs','private.txt'),'private');
  try { await fs.symlink(path.join(directory,'inputs'),path.join(directory,'output','alias'),'junction'); }
  catch(error) { if(['EPERM','EACCES'].includes(error.code)){t.diagnostic('Symlink creation unavailable on this host');return;} throw error; }
  await assert.rejects(host.ports['file.read']({path:'alias/private.txt'}),/refuses symlinks/);
});

test('undeclared native adapter inputs fail before build execution', async t => {
  const f=await fixture(t);
  const file=path.join(f.dir,'bootstrap/native.json');
  const native=JSON.parse(await fs.readFile(file));
  native.files=native.files.filter(name=>name!=='bootstrap/ports/node.cjs');
  await fs.writeFile(file,JSON.stringify(native));
  const result=f.run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/closure differs/);
});

test('derived operator laws preserve collection, Boolean and fact behaviour', async () => {
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const evaluate=async(source,env={facts:[]})=>{
    const kernel=createKernel(valuePorts(),20000000),factIndex=await makeIndex(env.facts||[],kernel);
    return kernel.evaluate(await lowerInput(source,definitions),{...env,factIndex});
  };
  assert.deepEqual(await evaluate(['map',['list',1,2],'x',['add','$x',3]]),[4,5]);
  assert.deepEqual(await evaluate(['filter',['list',0,1,2],'x','$x']),[1,2]);
  assert.equal(await evaluate(['some',['list'],'x','$missing']),false);
  assert.equal(await evaluate(['every',['list'],'x','$missing']),true);
  assert.equal(await evaluate(['some',['list',0,1],'x',['if',['eq','$x',0],true,'$missing']]),true);
  assert.equal(await evaluate(['every',['list',0,1],'x',['if',['eq','$x',0],false,'$missing']]),false);
  assert.equal(await evaluate(['and']),true);
  assert.equal(await evaluate(['or']),null);
  assert.equal(await evaluate(['and',false,'$missing']),false);
  await assert.rejects(()=>evaluate(['or',1,'$missing']),/Unknown reference/);
  assert.equal(await evaluate(['or',0,'',7]),7);
  assert.equal(await evaluate(['not',0]),true);
  assert.deepEqual(await evaluate(['record',{value:3}]),{value:3});
  assert.deepEqual(await evaluate(['map',['list',1,2],'x',['add','$x','$__templeDerived0']],{facts:[],__templeDerived0:100}),[101,102]);
  const facts=[
    {s:'s',p:'p',o:'first'},{s:'s',p:'p',o:'second'},
    {s:'s',p:'p',o:'first',pol:'is-not'},{s:'s',p:'p',o:'first'},
  ];
  assert.deepEqual(await evaluate(['objects','s','p'],{facts}),['first','second']);
  assert.equal(await evaluate(['optional','s','absent'],{facts}),null);
  assert.equal(await evaluate(['has','s','p','second'],{facts}),true);
  await assert.rejects(()=>evaluate(['one','s','p'],{facts}),/Fact cardinality: s.p/);
  await assert.rejects(()=>evaluate(['one','s','absent'],{facts}),/Fact cardinality: s.absent/);
  for(const name of ['map','filter','some','every'])
    await assert.rejects(()=>evaluate([name,42,'x','$x']),/requires an array/);
  for(const name of Object.keys(definitions.operators))assert.ok(!createKernel.operators.includes(name),name);
  const source=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
  for(const name of Object.keys(definitions.operators))assert.ok(!source.includes("case '"+name+"'"),name);
  const expressionDispatch=source.slice(source.indexOf('switch (op)'),source.indexOf('async function run'));
  const implemented=[...expressionDispatch.matchAll(/case '([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual([...createKernel.operators].sort(),implemented.sort(),'Declared primitives match the actual dispatch');
});

test('definition admission refuses cycles, shadowing and missing laws', async t => {
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const cyclic=JSON.parse(JSON.stringify(definitions));
  cyclic.operators.record.body=['record',{arg:0}];
  await assert.rejects(lowerInput(['record',1],cyclic),/Cyclic operator/);
  const shadow=JSON.parse(JSON.stringify(definitions));
  shadow.operators.add={arity:2,body:{arg:0}};
  await assert.rejects(lowerInput([],shadow),/shadowing/);
  await assert.rejects(lowerInput(['one','s'],definitions),/arity/);
  const invalid=JSON.parse(JSON.stringify(definitions));
  invalid.operators.record.body={arg:'0'};
  await assert.rejects(lowerInput(['record',1],invalid),/placeholder/);
  const compiler=JSON.parse(await fs.readFile(path.join(root,'algebra/lowering.process.json')));
  const onlyCore=[...createKernel.operators];
  const inspect=value=>{
    if(Array.isArray(value)){if(value.length&&typeof value[0]==='string')assert.ok(onlyCore.includes(value[0]),value[0]);value.slice(1).forEach(inspect);}
    else if(value&&typeof value==='object')Object.values(value).forEach(inspect);
  };
  const visit=programme=>programme.forEach(statement=>Object.entries(statement).forEach(([key,value])=>{
    if(definitions.statementFields.programmes.includes(key))visit(value);
    else if(definitions.statementFields.expressions.includes(key))inspect(value);
  }));
  Object.values(compiler.queries).forEach(visit);
  const indexer=JSON.parse(await fs.readFile(path.join(root,'algebra/fact-index.process.json')));
  Object.values(indexer.queries).forEach(visit);
  assert.throws(()=>createKernel().evaluate(['one','s','p'],{facts:[]}),/Unknown algebra operation/);
  const f=await fixture(t),file=path.join(f.dir,'algebra/operators.expression.json');
  delete definitions.operators.one;
  await fs.writeFile(file,JSON.stringify(definitions));
  assert.notEqual(f.run().status,0,'Missing law must stop the build with no native fallback');
});

test('changing an algebra law changes semantics with the same kernel', async () => {
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const kernel=createKernel(),source=['not',false];
  const original=await lowerInput(source,definitions);
  definitions.operators.not.body=true;
  const altered=await lowerInput(source,definitions);
  assert.equal(kernel.evaluate(original,{}),true);
  assert.equal(kernel.evaluate(altered,{}),true);
  definitions.operators.not.body=false;
  const changed=await lowerInput(source,definitions);
  assert.equal(kernel.evaluate(changed,{}),false);
});

test('indexed algebra queries match ordered fact history including refutations', async () => {
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const objects=await lowerInput(['objects','$subject','$predicate'],definitions);
  const subjects=await lowerInput(['subjects','$predicate','$object'],definitions);
  const events=[
    {s:'s',p:'p',o:'a'}, {s:'s',p:'p',o:'b'},
    {s:'s',p:'p',o:'a',pol:'is-not'}, {s:'s',p:'p',o:'b',pol:'is-not'},
    {s:'other',p:'p',o:'a'}, {s:'s',p:'q',o:'c'},
  ];
  const histories=[
    [],[events[0],events[0]],[events[2],events[1],events[0]],
    [events[0],events[1],events[2],events[0]],
    [{s:'constructor',p:'__proto__',o:'10'},{s:'constructor',p:'__proto__',o:'2'},
      {s:'constructor',p:'__proto__',o:'10',pol:'is-not'},{s:'constructor',p:'__proto__',o:'10'}],
    [{s:'',p:'',o:''},{s:'a|b',p:'c',o:'d'},{s:'a',p:'b|c',o:'d'}],
  ];
  for(let length=0;length<=7;length++)for(let variant=0;variant<32;variant++){
    let state=variant+1;
    histories.push(Array.from({length},()=>{state=(state*1664525+1013904223)>>>0;return events[state%events.length];}));
  }
  for(const facts of histories){
    const kernel=createKernel(valuePorts(),20000000),factIndex=await makeIndex(facts,kernel);
    const pairs=[['missing','p'],...facts.map(f=>[f.s,f.p])];
    for(const [subject,predicate] of pairs){
      const active=new Map();
      for(const f of facts)if(f.s===subject&&f.p===predicate)active.set(f.o,f.pol!=='is-not');
      const expected=[...active].filter(([,present])=>present).map(([value])=>value);
      assert.deepEqual(kernel.evaluate(objects,{factIndex,subject,predicate}),expected);
    }
    for(const {p:predicate,o:object} of [...events,...facts]){
      const expected=facts.filter(f=>f.p===predicate&&f.o===object).map(f=>f.s);
      assert.deepEqual(kernel.evaluate(subjects,{factIndex,predicate,object}),expected);
    }
    assert.equal(factIndex.factCount,facts.length);
    indexedHistories++;
  }
});

test('fact indexes are immutable snapshots and query results are isolated copies', async () => {
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const source=[{s:'s',p:'p',o:'first'}];
  const first=await makeIndex(source);
  source.push({s:'s',p:'p',o:'first',pol:'is-not'},{s:'s',p:'p',o:'second'});
  const second=await makeIndex(source);
  const query=await lowerInput(['objects','s','p'],definitions),kernel=createKernel();
  assert.deepEqual(kernel.evaluate(query,{factIndex:first}),['first']);
  assert.deepEqual(kernel.evaluate(query,{factIndex:second}),['second']);
  assert.ok(Object.isFrozen(first.objects.s.p));
  const result=kernel.evaluate(query,{factIndex:first});result.push('changed');
  assert.deepEqual(kernel.evaluate(query,{factIndex:first}),['first']);
  assert.throws(()=>kernel.evaluate(query,{facts:source}),/Unknown reference.*factIndex/);
  for(const operator of ['objects','subjects'])assert.ok(!createKernel.operators.includes(operator));
  const code=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
  assert.ok(!code.includes('function active'));
  assert.equal(kernel.evaluate(['at',{},'constructor'],{}),undefined);
});

test('fact indexing and queries share the unchanged application budget', async () => {
  const kernel=createKernel(valuePorts(),20000000),facts=[{s:'s',p:'p',o:'first'}];
  const factIndex=await makeIndex(facts,kernel),afterIndex=kernel.usage.steps;
  assert.ok(afterIndex>0);
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  kernel.evaluate(await lowerInput(['one','s','p'],definitions),{factIndex});
  assert.ok(kernel.usage.steps>afterIndex);
  assert.equal(kernel.usage.limit,20000000);
  await assert.rejects(makeIndex(facts,createKernel(valuePorts(),10)),/Execution budget exceeded/);
});

test('runtime snapshot transport preserves prototype-like keys and freezing', async () => {
  const facts=[{s:'__proto__',p:'constructor',o:'safe'}];
  const definitions=JSON.parse(await fs.readFile(path.join(root,'algebra/operators.expression.json')));
  const expression=await lowerInput(['at',['objects','__proto__','constructor'],0],definitions);
  const model={queries:{boot:[{port:'dom.text',args:{selector:'#out',text:expression},into:'result'}]}};
  const bundle=createRuntimePort(model,facts,{browser:['dom.text']},input=>makeIndex(input));
  const source=await bundle({entry:'boot',mode:'browser',queries:['boot'],factSubjects:['__proto__']});
  const output={textContent:''},errors=[];
  const context=vm.createContext({document:{querySelector:()=>output},fetch:()=>{},console:{error:error=>errors.push(error)}});
  vm.runInContext(source,context);
  for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(output.textContent,'safe');
  assert.equal(errors.length,0);
  assert.equal(vm.runInContext('Object.isFrozen(factIndex.objects.__proto__.constructor)',context),true);
  assert.equal(vm.runInContext('Object.hasOwn(factIndex.objects,"__proto__")',context),true);
});

test('write the reproducible no-MJS proof receipt', async () => {
  assert.ok(proof,'Isolated build proof must have passed first');
  await fs.mkdir(path.join(root,'generated'),{recursive:true});
  await fs.writeFile(path.join(root,'generated/bootstrap-proof.json'),JSON.stringify({...proof,indexedHistories},null,2)+'\n');
});
