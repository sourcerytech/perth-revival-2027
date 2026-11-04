/* One-time differential qualification against the retained upstream evaluator.
 * This command uses the reference MJS as an oracle; the isolated build does not.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {createKernel}=require('./temple-seed.cjs');
const {parseRel}=require('./ports/rel-codec.cjs');
const {valuePorts}=require('./ports/value.cjs');
const {execFileSync}=require('node:child_process');
const {Module}=require('node:module');
const {lower}=require('./ports/algebra-lower.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
async function main(){
 const root=path.resolve(__dirname,'..');
 const reference=path.resolve(process.argv[2]);
 const legacy=await import(pathToFileURL(reference).href);
 const {FactStore}=await import(pathToFileURL(path.join(path.dirname(reference),'surface-rel-core.mjs')).href);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'bootstrap/site.json')));
 const facts=[];
 for(const file of manifest.sources)facts.push(...parseRel(await fs.readFile(path.join(root,file),'utf8'),file));
 const definitions=JSON.parse(await fs.readFile(path.join(root,manifest.operatorDefinitions),'utf8'));
 const compiler=JSON.parse(await fs.readFile(path.join(root,manifest.operatorCompiler),'utf8'));
 const lowerInput=(input,mode='expression')=>lower({compiler,definitions,primitives:createKernel.operators,input,mode,ports:valuePorts()});
 const state=FactStore.from(facts),kernel=createKernel({},20000000);
 const expressions=[
  ['list',1,'x',null,true],['append',['list',1,2],['list',3]],['eq',{a:1},{a:1}],
  ['map',['range',4],'i',['add','$i',2]],['filter',['list','a','b'],'i',['eq','$i','b']],
  ['some',['list',0,1],'i','$i'],['every',['list',true,true],'i','$i'],
  ['if',true,'yes','$absent'],['and',false,'$absent'],['or',0,'',7],
  ['concat','one',null,3],['count',['list',1,2]],['at',['list',1],9],
  ['distinct',['list','a','b','a']],['one','page.home','route'],['optional','page.home','absent'],
  ['objects','page.home','section'],['subjects','isa','Page'],['has','page.home','isa','Page'],
 ];
 for(const expr of expressions)assert.deepEqual(kernel.evaluate(await lowerInput(expr),{facts}),legacy.evaluate(expr,{state}));
 const css=JSON.parse(await fs.readFile(path.join(root,'algebra/css.process.json')));
 // The pure CSS folds must produce exactly the reference's values; I/O is omitted.
 const programme=css.queries['css.build'].filter(step=>!step.port);
 const current={facts},prior={state};
 await kernel.run(await lowerInput(programme,'programme'),current);legacy.steps(programme,prior);
 assert.equal(current.css,prior.css);
 const dom=JSON.parse(await fs.readFile(path.join(root,'algebra/dom.process.json')));
 const html=JSON.parse(await fs.readFile(path.join(root,'algebra/html.process.json')));
 const compiledHtml=await lowerInput(html,'model');
 const priorCommit='9175f17';
 const historyRoot=path.resolve(process.argv[3] || root);
 const priorSource=execFileSync('git',['show',priorCommit+':bootstrap/temple-seed.cjs'],{cwd:historyRoot,encoding:'utf8'});
 const priorSeed=new Module('qualification-prior-seed');
 priorSeed._compile(priorSource,path.join(root,'bootstrap/qualification-prior-seed.cjs'));
 const derivedCases=[];
 for(let length=0;length<=5;length++){
  const items=['list',...Array.from({length},(_,i)=>i)];
  derivedCases.push(['map',items,'x',['add','$x',2]],['filter',items,'x',['not',['eq','$x',1]]],
    ['some',items,'x',['eq','$x',2]],['every',items,'x',['not',['eq','$x',2]]]);
 }
 for(let mask=0;mask<16;mask++){
  const values=Array.from({length:4},(_,i)=>Boolean(mask&(1<<i)));
  derivedCases.push(['and',...values],['or',...values]);
 }
 derivedCases.push(['some',['list'],'x','$missing'],['every',['list'],'x','$missing'],
  ['and',false,'$missing'],['or',1,'$missing'],['record',{arg:3,bind:'user'}],
  ['map',['list',1,2],'x',['add','$x','$__templeDerived0']],
  ['one','page.home','route'],['one','page.home','absent'],['one','page.home','section'],
  ['optional','page.home','absent'],['optional','page.home','section'],['has','page.home','isa','Page']);
 const oldCore=priorSeed.exports.createKernel({},20000000);
 const outcome=fn=>{try{return {value:fn()};}catch(error){return {error:error.name,message:error.message};}};
 for(const expression of derivedCases){
  const env={facts,__templeDerived0:100},lowered=await lowerInput(expression);
  assert.deepEqual(outcome(()=>kernel.evaluate(lowered,env)),outcome(()=>oldCore.evaluate(expression,env)),JSON.stringify(expression));
 }
 const htmlKernel=createKernel(valuePorts(),20000000);
 const construction=dom.queries['dom.page'][0].value;
 for(const page of state.subjects('isa','Page')){
  const tree=kernel.evaluate(await lowerInput(construction),{facts,page});
  assert.deepEqual(tree,legacy.evaluate(construction,{state,page}),page);
  const serial={model:compiledHtml,input:tree};
  await htmlKernel.run(compiledHtml.queries['html.serialize'],serial);
  assert.equal(serial.result,priorSeed.exports.serializeHtml(tree),page+': HTML bytes');
  const observed={model:compiledHtml,input:tree};
  await htmlKernel.run(compiledHtml.queries['html.inspect'],observed);
  assert.deepEqual(observed.result,priorSeed.exports.inspectTree(tree),page+': tree inspection');
 }
 const currentSeed=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
 const normalized=source=>source.replaceAll('\r\n','\n');
 const previousBoundaryCommit='7fa659c';
 const oldNative=JSON.parse(execFileSync('git',['show',previousBoundaryCommit+':bootstrap/native.json'],{cwd:historyRoot,encoding:'utf8'}));
 const currentNative=JSON.parse(await fs.readFile(path.join(root,manifest.nativeSource),'utf8'));
 const measure=sources=>({files:sources.length,bytes:sources.reduce((sum,s)=>sum+Buffer.byteLength(normalized(s)),0),
  lines:sources.reduce((sum,s)=>sum+normalized(s).trimEnd().split('\n').length,0)});
 const oldSources=oldNative.files.map(file=>execFileSync('git',['show',previousBoundaryCommit+':'+file],{cwd:historyRoot,encoding:'utf8'}));
 const currentSources=await Promise.all(currentNative.files.map(file=>fs.readFile(path.join(root,file),'utf8')));
 const receipt={protocol:'temple/existing-algebra-conformance/1',reference,
  referenceSha256:hash(await fs.readFile(reference)),seedSha256:hash(await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'))),
  expressionCases:expressions.length,pageTrees:8,cssFoldEquivalent:true,
  derivedDifferentialCases:derivedCases.length,operatorDefinitionsSha256:hash(await fs.readFile(path.join(root,manifest.operatorDefinitions))),
  algebraLoweringSha256:hash(await fs.readFile(path.join(root,manifest.operatorCompiler))),
  primitiveOperators:createKernel.operators,derivedOperators:Object.keys(definitions.operators),
  primitiveReduction:{previousCommit:'7fa659c',previous:24,current:createKernel.operators.length,algebraDerived:Object.keys(definitions.operators).length},
  htmlBytesEquivalent:true,treeInspectionEquivalent:true,priorSeedCommit:priorCommit,
  seedReduction:{priorBytes:Buffer.byteLength(normalized(priorSource)),currentBytes:Buffer.byteLength(normalized(currentSeed)),
    priorLines:normalized(priorSource).trimEnd().split('\n').length,currentLines:normalized(currentSeed).trimEnd().split('\n').length},
  nativeClosureComparison:{previousCommit:previousBoundaryCommit,previous:measure(oldSources),current:measure(currentSources),
    interpretation:'Operator laws and the hygienic lowering programme are algebra data. The native bridge only invokes the core-only lowering programme; full native source size is reported separately from kernel size.'},
  passed:true,
  boundary:'Strict seed subset of the existing surface-process algebra; unknown operators and malformed references refuse. The reference is a qualification oracle only.'};
 await fs.writeFile(path.join(root,'generated/bootstrap-conformance.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
