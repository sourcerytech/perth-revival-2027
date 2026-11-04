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
const {createKernel, parseRel, serializeHtml} = require('./temple-seed.cjs');

const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let proof;

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
  const inputFiles = ['bootstrap/temple-seed.cjs','bootstrap/site.json',...manifest.sources,...manifest.modules];
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
  const run = () => spawnSync(process.execPath, [path.join(dir,'bootstrap/temple-seed.cjs'),dir,'dist'], {
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
    assert.ok(html.includes(serializeHtml(val(page,'heading'))));
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
  assert.equal(serializeHtml({tag:'p',children:['<img src=x onerror=evil>']}),'<p>&lt;img src=x onerror=evil&gt;</p>');
  assert.throws(()=>serializeHtml({tag:'a',attrs:{href:'javascript:alert(1)'}}),/Unsafe URL/);
  assert.throws(()=>createKernel().evaluate('$a.constructor',{a:{}}),/Invalid binding/);
  await assert.rejects(createKernel().run([{port:'module.import',args:{},into:'x'}],{}),/Unknown host port/);
  assert.throws(()=>createKernel({},10).evaluate(['range',11],{}),/Invalid bounded range/);
});

test('write the reproducible no-MJS proof receipt', async () => {
  assert.ok(proof,'Isolated build proof must have passed first');
  await fs.mkdir(path.join(root,'generated'),{recursive:true});
  await fs.writeFile(path.join(root,'generated/bootstrap-proof.json'),JSON.stringify(proof,null,2)+'\n');
});
