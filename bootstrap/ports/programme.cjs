'use strict';
const {createKernel}=require('../temple-seed.cjs');

// Generic invocation bridge. Admission and language semantics live in algebra.
async function invoke({model,entry,input={},ports,limit=20000000}) {
  const kernel=createKernel(ports,limit);
  const env={...input,model};
  await kernel.run(model.queries[entry],env);
  return {value:env.result,usage:kernel.usage};
}

module.exports={invoke};
