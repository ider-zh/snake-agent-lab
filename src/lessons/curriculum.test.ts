import {describe,it,expect} from 'vitest';
import {chapters,objectives,lessonHref,lessonIdFromHash,lessonNeighbors} from './curriculum';
import {lessons} from './content';
import {exampleCode} from './examples';
import {highlight} from './highlight';
import {articles} from './articles';
describe('documentation curriculum',()=>{
 it('provides a complete article for every route with valid source references',()=>{
  expect(Object.keys(articles).sort()).toEqual(lessons.map(l=>l.id).sort());
  for(const [id,article] of Object.entries(articles)){
   expect(article.motivation.length,id).toBeGreaterThanOrEqual(2);
   expect(article.prerequisites.length,id).toBeGreaterThanOrEqual(3);
   expect(article.mechanism.length,id).toBeGreaterThanOrEqual(2);
   expect(article.workedExample.steps.length,id).toBeGreaterThanOrEqual(3);
   expect(article.codeWalkthrough.length,id).toBeGreaterThanOrEqual(3);
   expect(article.exercises.length,id).toBeGreaterThanOrEqual(2);
   const sourceIds=article.sources.map(s=>s.id);
   expect(new Set(sourceIds).size,id).toBe(sourceIds.length);
   expect(sourceIds.length,id).toBeGreaterThan(0);
   for(const section of article.mechanism)for(const sourceId of section.sourceIds??[])expect(sourceIds,id).toContain(sourceId);
   for(const source of article.sources){expect(new URL(source.url).protocol,id).toBe('https:');expect(source.note.trim(),id).not.toBe('');}
  }
 });
 it('connects every lesson exactly once with bounded previous and next links',()=>{
  expect(chapters.flatMap(c=>lessons.filter(l=>l.group===c.group))).toEqual(lessons);
  for(const [i,lesson] of lessons.entries()){
   expect(objectives[lesson.id].length).toBeGreaterThanOrEqual(2);
   expect(lessonIdFromHash(lessonHref(lesson.id))).toBe(lesson.id);
   expect(lessonNeighbors(lesson.id)).toEqual({previous:lessons[i-1]??null,next:lessons[i+1]??null});
  }
  for(const url of ['#/lessons','#/lessons/unknown','#/lessons/%3Cscript%3E','#/play'])expect(lessonIdFromHash(url)).toBeNull();
  expect(lessonNeighbors('unknown')).toEqual({previous:null,next:null});
 });
 it('preserves all 42 executable examples byte-for-byte while adding lexical categories',()=>{
  for(const lesson of lessons)for(const language of ['js','py'] as const){
   const code=exampleCode(lesson.id,language),tokens=highlight(code,language);
   expect(tokens.map(t=>t.text).join('')).toBe(code);
   expect(tokens.some(t=>t.kind==='keyword')).toBe(true);
   expect(tokens.some(t=>t.kind==='number')).toBe(true);
  }
 });
 it('keeps comment-like text inside strings and HTML characters as literal text',()=>{
  const js='const html = "<script>// text</script>"; // comment\nreturn 1.5;';
  expect(highlight(js,'js').filter(t=>t.kind==='string').map(t=>t.text)).toEqual(['"<script>// text</script>"']);
  const py='s = "# literal"\n# comment\ndef f(): return 2';
  expect(highlight(py,'py').filter(t=>t.kind==='comment').map(t=>t.text)).toEqual(['# comment']);
 });
});
