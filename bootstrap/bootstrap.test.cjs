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

const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let proof;

async function htmlQuery(query, input) {
  const model = JSON.parse(await fs.readFile(path.join(root, 'algebra/html.process.json'), 'utf8'));
  const env = {model, input};
  await createKernel(valuePorts()).run(model.queries[query], env);
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
  const inputFiles = ['bootstrap/site.json',manifest.nativeSource,manifest.hostPorts,
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
    nativeSources:receipt.nativeSources,portProfiles:receipt.portProfiles,
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

test('write the reproducible no-MJS proof receipt', async () => {
  assert.ok(proof,'Isolated build proof must have passed first');
  await fs.mkdir(path.join(root,'generated'),{recursive:true});
  await fs.writeFile(path.join(root,'generated/bootstrap-proof.json'),JSON.stringify(proof,null,2)+'\n');
});
