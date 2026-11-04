'use strict';

async function indexFacts(kernel, programme, input) {
  const env={model:programme,input};
  await kernel.run(programme.queries['facts.index'],env);
  return env.result;
}

module.exports={indexFacts};
