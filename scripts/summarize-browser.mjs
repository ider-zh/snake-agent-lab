import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import process from 'node:process';
const input=process.argv[2]??'qa-artifacts/final-browser.json',output=process.argv[3]??'docs/qa/final/browser-summary.json';
const report=JSON.parse(readFileSync(input,'utf8')),tests=[],performance=[];
function walk(suite){
  for(const spec of suite.specs??[])for(const test of spec.tests??[]){
    const last=test.results.at(-1);tests.push({file:spec.file,title:spec.title,project:test.projectName,status:test.status,result:last?.status,durationMs:last?.duration,retries:test.results.length-1,errors:last?.errors?.map(e=>e.message)??[]});
    for(const result of test.results)for(const out of result.stdout??[]){const text=out.text??'';for(const line of text.split('\n'))if(line.startsWith('HP_PERFORMANCE '))performance.push({project:test.projectName,...JSON.parse(line.slice('HP_PERFORMANCE '.length))});}
  }
  for(const child of suite.suites??[])walk(child);
}
for(const suite of report.suites)walk(suite);
mkdirSync('docs/qa/final',{recursive:true});writeFileSync(output,JSON.stringify({stats:report.stats,tests,performance,limitations:['Chromium on HP Windows; phone viewport emulation, not a physical phone or Safari','SwiftShader software rendering; no hardware-GPU performance claim']},null,2)+'\n');
