/* global process, console */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { exampleCode, exampleIds, expectedOutputs } from '../src/lessons/examples.ts';
const python=process.env.LESSON_PYTHON??'python';
const directory=join(tmpdir(),'snakelab-lesson-examples');mkdirSync(directory,{recursive:true});
const results=[];
function close(a,b) {
  if(typeof a==='number'&&typeof b==='number')assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
  else if(a!==null&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))close(a[key],b[key]);}
  else assert.equal(a,b);
}
for(const id of exampleIds){
  const outputs={};
  for(const language of ['js','py']){
    const path=join(directory,`${id}.${language}`);writeFileSync(path,exampleCode(id,language));
    outputs[language]=JSON.parse(execFileSync(language==='js'?process.execPath:python,[path],{encoding:'utf8',timeout:10000}));
  }
  close(outputs.js,outputs.py);close(outputs.js,expectedOutputs[id]);results.push({lesson:id,matched:true,output:outputs.js});
}
mkdirSync('docs/qa/lessons',{recursive:true});
writeFileSync('docs/qa/lessons/example-results.json',JSON.stringify({node:process.version,python:execFileSync(python,['--version'],{encoding:'utf8'}).trim(),results},null,2)+'\n');
console.log(`${results.length} bilingual examples matched on Node.js and Python.`);
