'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createKernel}=require('./temple-seed.cjs');
const {lower}=require('./ports/algebra-lower.cjs');
const {invoke}=require('./ports/programme.cjs');
const {valuePorts}=require('./ports/value.cjs');
const {parseRel}=require('./ports/rel-codec.cjs');
const root=path.resolve(__dirname,'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
let prepared;
function setup(){return prepared??=(async()=>{
  const definitions=await read('algebra/operators.expression.json'),compiler=await read('algebra/lowering.process.json');
  const compile=input=>lower({compiler,definitions,primitives:createKernel.operators,input,mode:'model',ports:valuePorts()});
  return {profile:await read('bootstrap/kernel-profile.json'),admission:await compile(await read('algebra/admission.process.json')),language:await compile(await read('algebra/language.process.json')),compile};
})();}
async function admit(programme,entry='admit.model',grants=[]){
  const {profile,admission}=await setup();
  const target=Array.isArray(programme)?{entry:'main',queries:{main:programme}}:programme;
  return invoke({model:admission,entry,input:{profile,target,grants},ports:valuePorts()});
}
async function language(text,file='test.temple'){
  const {language:model}=await setup();
  return (await invoke({model,entry:'language.compile',input:{text,file},ports:valuePorts()})).value;
}

test('kernel profile names exactly the implemented primitives and admits compiler programmes',async()=>{
  const {profile,admission,language:model}=await setup();
  assert.deepEqual(Object.keys(profile.operators),createKernel.operators);
  await admit({...admission,entry:'admit.model'});
  await admit({...model,entry:'language.compile'});
});

test('ordered JSON equality, truthiness and internal absence are explicit v1 behavior',()=>{
  const k=createKernel();
  assert.equal(k.evaluate(['eq',{a:1,b:2},{b:2,a:1}],{}),false);
  assert.equal(k.evaluate(['eq',-0,0],{}),true);
  assert.equal(k.evaluate(['eq',['at',{},'missing'],null],{}),false);
  assert.equal(k.evaluate(['at',{},'missing'],{}),undefined);
  assert.equal(k.evaluate(['if',[],'yes','no'],{}),'yes');
  assert.equal(k.evaluate(['includes',['list',{a:1}],{a:1}],{}),false,'membership retains identity semantics for records');
  assert.equal(k.evaluate(['add','2',3],{}),5,'numeric coercion is preserved, not silently redefined');
  assert.equal(k.evaluate(['if',true,'safe',['raise','unused']],{}),'safe');
  assert.throws(()=>k.evaluate('$missing',{}),/Unknown reference/);
  assert.throws(()=>k.evaluate('$x.constructor',{x:{}}),/Invalid binding/);
  assert.throws(()=>k.evaluate('$x.value',{x:Object.defineProperty({},'value',{get(){throw Error('getter executed');},enumerable:true})}),/Unknown reference/);
});

test('JSON transport refuses absence, nonfinite values, accessors, cycles and lossy records',()=>{
  const ports=valuePorts(),encode=value=>ports['json.stringify']({value});
  const cyclic={};cyclic.self=cyclic;
  let getterRan=false;
  const accessor=Object.defineProperty({},'value',{enumerable:true,get(){getterRan=true;return 1;}});
  for(const value of [undefined,{a:undefined},NaN,Infinity,1n,()=>{},new Date(),[1,,3],cyclic,accessor])assert.throws(()=>encode(value),/TEMPLE-V001/);
  assert.equal(getterRan,false);
  assert.throws(()=>ports['json.parse']({text:'1e999'}),/TEMPLE-V001/);
  const value=JSON.parse('{"__proto__":"data","a":null,"items":[1,"x"]}');
  assert.deepEqual(ports['json.parse']({text:encode(value)}),value);
});

test('whole-model admission rejects malformed dead branches before an effect can run',async()=>{
  const invalid=[
    [{port:'write',args:{},into:'x'},{when:false,then:[{let:'x',value:1,hidden:true}]}],
    [{let:'x',value:['add',1]}],
    [{let:'bad-name',value:1}],
    [{port:'write',args:{},into:'x'},{let:null,value:1}],
    [{port:'write',args:{},into:'x'},{let:'model',value:{queries:{}}}],
    [{port:'write',args:{},into:'x'},{let:'y',value:'$x.constructor'}],
    [{when:false,then:[{call:'missing'}]}],
    [{fold:[],as:'x',accumulator:'x',initial:0,steps:[],yield:0,into:'out'}],
    [{let:'x',value:Infinity}],
    [{let:'x',value:Object.defineProperty({},'hidden',{value:1})}],
    [{let:'x',value:{[Symbol('hidden')]:1}}],
    [{let:'x',value:['list',,1]}],
    [{let:'x',value:['list',...Array(64).fill(0)]}],
    [null],
    [{let:'x',value:1,assert:true,message:'ambiguous'}],
  ];
  let writes=0;
  for(const programme of invalid){
    await assert.rejects(async()=>{await admit(programme);await createKernel({write:()=>++writes}).run(programme,{model:{queries:{}}});},/TEMPLE-S/);
  }
  assert.equal(writes,0);
});

test('admission checks recursive call closure and effects in false branches',async()=>{
  const target={entry:'main',queries:{main:[{call:'helper'}],helper:[{when:false,then:[{port:'write',args:{},into:'x'}]},{when:false,then:[{call:'main'}]}]}};
  await admit(target);
  await assert.rejects(admit(target,'admit.effects',[]),/TEMPLE-S017/);
  await admit(target,'admit.effects',['write']);
});

test('lexical loops isolate bindings while statement calls share their invocation environment',async()=>{
  const model={queries:{helper:[{let:'called',value:true}]}};
  const programme=[{let:'outer',value:1},{each:['list',2],as:'item',steps:[{let:'outer',value:'$item'}]},{call:'helper'},{let:'nested',value:['let','outer',9,'$outer']}];
  await admit({entry:'main',queries:{...model.queries,main:programme}});
  const env={model};await createKernel().run(programme,env);
  assert.equal(env.outer,1);assert.equal(env.nested,9);assert.equal(env.called,true);
});

test('ports are sequential, awaited and never automatically retried',async()=>{
  const trace=[],fault=Object.assign(Error('provider fault'),{code:'PROVIDER'});
  const ports={first:async()=>{trace.push('first');await Promise.resolve();trace.push('settled');return 1;},second:()=>{trace.push('second');throw fault;}};
  const programme=[{port:'first',args:{},into:'one'},{port:'second',args:{},into:'two'}];
  await assert.rejects(createKernel(ports).run(programme,{}),error=>error===fault);
  assert.deepEqual(trace,['first','settled','second']);
  const env={};
  await createKernel(ports).run([{try:[{port:'second',args:{},into:'x'}],error:'caught',catch:[]}],env);
  assert.deepEqual(env.caught,{name:'Error',message:'provider fault'},'explicit legacy catch projection is name/message only');
});

test('budget exhaustion is uncatchable and cannot authorize a recovery effect',async()=>{
  for(const limit of [0,-1,Infinity,1.5])assert.throws(()=>createKernel({},limit),/TEMPLE-K002/);
  let effects=0;
  const env={};
  await assert.rejects(createKernel({recover:()=>++effects},6).run([{try:[{each:['range',6],as:'i',steps:[{let:'x',value:0}]}],error:'caught',catch:[{port:'recover',args:{},into:'x'}]}],env),error=>error.code==='TEMPLE-K001');
  assert.equal(effects,0);
  assert.equal(Object.hasOwn(env,'caught'),false);
});

test('language lowers shared Encounter facts exactly to the retained REL contract',async()=>{
  const file='source/language/encounter.temple',text=await fs.readFile(path.join(root,file),'utf8');
  const result=await language(text,file);
  assert.equal(result.ok,true);
  const expected=parseRel(await fs.readFile(path.join(root,'test/fixtures/encounter-chrome.expected.rel'),'utf8'),'expected');
  assert.deepEqual(result.facts,expected);
  assert.deepEqual(parseRel(result.rel,'lowered'),expected);
  assert.equal(result.origins.length,expected.length);
  for(const origin of result.origins){
    const line=text.split(/\r?\n/)[origin.span.line-1];
    assert.equal(origin.span.file,file);
    assert.equal(line.slice(origin.span.column-1,origin.span.endColumn-1).trim().split(' ')[0],expected[origin.index].p);
  }
});

test('language preserves ordering, retractions, literal dollar values and JSON escapes',async()=>{
  const result=await language('module "test"\r\nentity "s" {\r\n  item "first"\r\n  item "second"\r\n  !item "first"\r\n  text "quote: \\"; line: \\n; dollar: $value"\r\n}');
  assert.equal(result.ok,true,JSON.stringify(result.diagnostic));
  assert.deepEqual(result.facts.map(f=>f.pol),['is','is','is-not','is']);
  assert.equal(result.facts[3].o,'quote: "; line: \n; dollar: $value');
  assert.deepEqual(parseRel(result.rel,'lowered'),result.facts);
  assert.equal(result.origins[0].span.line,3);
  assert.equal(result.origins[0].span.column,3);
});

test('language failures have exact locations and publish no partial IR',async()=>{
  const cases=[
    ['entity "s" {','TEMPLE-M003',1],
    ['module "a"\nmodule "b"','TEMPLE-M002',2],
    ['module "a"\n  label "outside"','TEMPLE-M006',2],
    ['module "a"\nentity "s" {\n  label "x"','TEMPLE-M008',3],
    ['module "a"\nentity "s" {\n  label "x"\n  label "x"\n}','TEMPLE-M007',4],
    ['module "a"\nentity "s" {\n}\nentity "s" {','TEMPLE-M005',4],
    ['module "a"\nentity "s" {\n  label "bad\\q"\n}','TEMPLE-M001',3],
    ['module "a"\n}\n','TEMPLE-M004',2],
    ['module "a"\nentity "s" {\n  file.write "oops";\n}','TEMPLE-M001',3],
  ];
  for(const [text,code,line] of cases){
    const result=await language(text,'broken.temple');
    assert.equal(result.ok,false,text);
    assert.equal(result.diagnostic.code,code,text);
    assert.equal(result.diagnostic.span.file,'broken.temple');
    assert.equal(result.diagnostic.span.line,line,text);
    assert.ok(result.diagnostic.correction);
    assert.deepEqual(result.facts,[]);assert.deepEqual(result.origins,[]);assert.equal(result.rel,'');
  }
});

test('relation cells cannot acquire a second source owner',async()=>{
  const {admission:model}=await setup(),fact={s:'site',p:'navigation',o:'home',pol:'is'};
  await assert.rejects(invoke({model,entry:'admit.ownership',input:{sources:[{file:'a',facts:[fact]},{file:'b',facts:[{...fact,o:'story'}]}]},ports:valuePorts()}),/TEMPLE-S018/);
  await invoke({model,entry:'admit.ownership',input:{sources:[{file:'a',facts:[fact,{...fact,o:'story'}]}]},ports:valuePorts()});
});
