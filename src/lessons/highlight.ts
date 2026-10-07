export type CodeLanguage='js'|'py';
export interface CodeToken {text:string;kind:'plain'|'comment'|'string'|'number'|'keyword'|'function'|'builtin';}
const keywords={js:new Set('const let var function return if else for while of in new class extends import from export default true false null undefined break continue throw try catch finally async await typeof instanceof switch case yield'.split(' ')),py:new Set('def return if elif else for while in not and or is None True False import from as class with lambda break continue pass raise try except finally yield'.split(' '))};
const builtins=new Set('Math JSON Array Set Map Number Object console print len range enumerate zip list dict set tuple min max sum sorted abs int float'.split(' '));
/** A lexical renderer for the bundled snippets. React renders token text safely;
 * no HTML injection or code execution is involved, and concatenation is lossless. */
export function highlight(code:string,language:CodeLanguage):CodeToken[]{
 const pattern=language==='py'?/#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_$][\w$]*\b/g:/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;
 const tokens:CodeToken[]=[];let last=0;
 for(const match of code.matchAll(pattern)){
  const start=match.index!,text=match[0];if(start>last)tokens.push({text:code.slice(last,start),kind:'plain'});
  const kind:CodeToken['kind']=text.startsWith(language==='py'?'#':'/')?'comment':/^['"`]/.test(text)?'string':/^\d/.test(text)?'number':keywords[language].has(text)?'keyword':builtins.has(text)?'builtin':/^\s*\(/.test(code.slice(start+text.length))?'function':'plain';
  tokens.push({text,kind});last=start+text.length;
 }
 if(last<code.length)tokens.push({text:code.slice(last),kind:'plain'});return tokens;
}
