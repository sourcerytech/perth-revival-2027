/* One-time differential qualification against the retained upstream evaluator.
 * This command uses the reference MJS as an oracle; the isolated build does not.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {createKernel,parseRel,valuePorts}=require('./temple-seed.cjs');
const {execFileSync}=require('node:child_process');
const {Module}=require('node:module');
const hash=x=>createHash('sha256').update(x).digest('hex');
async function main(){
 const root=path.resolve(__dirname,'..');
 const reference=path.resolve(process.argv[2]);
 const legacy=await import(pathToFileURL(reference).href);
 const {FactStore}=await import(pathToFileURL(path.join(path.dirname(reference),'surface-rel-core.mjs')).href);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'bootstrap/site.json')));
 const facts=[];
 for(const file of manifest.sources)facts.push(...parseRel(await fs.readFile(path.join(root,file),'utf8'),file));
 const state=FactStore.from(facts),kernel=createKernel();
 const expressions=[
  ['list',1,'x',null,true],['append',['list',1,2],['list',3]],['eq',{a:1},{a:1}],
  ['map',['range',4],'i',['add','$i',2]],['filter',['list','a','b'],'i',['eq','$i','b']],
  ['some',['list',0,1],'i','$i'],['every',['list',true,true],'i','$i'],
  ['if',true,'yes','$absent'],['and',false,'$absent'],['or',0,'',7],
  ['concat','one',null,3],['count',['list',1,2]],['at',['list',1],9],
  ['distinct',['list','a','b','a']],['one','page.home','route'],['optional','page.home','absent'],
  ['objects','page.home','section'],['subjects','isa','Page'],['has','page.home','isa','Page'],
 ];
 for(const expr of expressions)assert.deepEqual(kernel.evaluate(expr,{facts}),legacy.evaluate(expr,{state}));
 const css=JSON.parse(await fs.readFile(path.join(root,'algebra/css.process.json')));
 // The pure CSS folds must produce exactly the reference's values; I/O is omitted.
 const programme=css.queries['css.build'].filter(step=>!step.port);
 const current={facts},prior={state};
 await kernel.run(programme,current);legacy.steps(programme,prior);
 assert.equal(current.css,prior.css);
 const dom=JSON.parse(await fs.readFile(path.join(root,'algebra/dom.process.json')));
 const html=JSON.parse(await fs.readFile(path.join(root,'algebra/html.process.json')));
 const priorCommit='9175f17';
 const priorSource=execFileSync('git',['show',priorCommit+':bootstrap/temple-seed.cjs'],{cwd:root,encoding:'utf8'});
 const priorSeed=new Module('qualification-prior-seed');
 priorSeed._compile(priorSource,path.join(root,'bootstrap/qualification-prior-seed.cjs'));
 const htmlKernel=createKernel(valuePorts(),20000000);
 const construction=dom.queries['dom.page'][0].value;
 for(const page of state.subjects('isa','Page')){
  const tree=kernel.evaluate(construction,{facts,page});
  assert.deepEqual(tree,legacy.evaluate(construction,{state,page}),page);
  const serial={model:html,input:tree};
  await htmlKernel.run(html.queries['html.serialize'],serial);
  assert.equal(serial.result,priorSeed.exports.serializeHtml(tree),page+': HTML bytes');
  const observed={model:html,input:tree};
  await htmlKernel.run(html.queries['html.inspect'],observed);
  assert.deepEqual(observed.result,priorSeed.exports.inspectTree(tree),page+': tree inspection');
 }
 const currentSeed=await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'),'utf8');
 const normalized=source=>source.replaceAll('\r\n','\n');
 const receipt={protocol:'temple/existing-algebra-conformance/1',reference,
  referenceSha256:hash(await fs.readFile(reference)),seedSha256:hash(await fs.readFile(path.join(root,'bootstrap/temple-seed.cjs'))),
  expressionCases:expressions.length,pageTrees:8,cssFoldEquivalent:true,
  htmlBytesEquivalent:true,treeInspectionEquivalent:true,priorSeedCommit:priorCommit,
  seedReduction:{priorBytes:Buffer.byteLength(normalized(priorSource)),currentBytes:Buffer.byteLength(normalized(currentSeed)),
    priorLines:normalized(priorSource).trimEnd().split('\n').length,currentLines:normalized(currentSeed).trimEnd().split('\n').length},
  passed:true,
  boundary:'Strict seed subset of the existing surface-process algebra; unknown operators and malformed references refuse. The reference is a qualification oracle only.'};
 await fs.writeFile(path.join(root,'generated/bootstrap-conformance.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
