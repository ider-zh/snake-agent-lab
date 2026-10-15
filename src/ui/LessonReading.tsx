import type { LessonArticle } from '../lessons/article-types';

export function LessonConcepts({article}:{article:LessonArticle}) {
  return <>
    <section id="lesson-concepts" tabIndex={-1} className="lesson-section lesson-reading"><h2>为什么需要它</h2>
      {article.motivation.map(p=><p key={p}>{p}</p>)}
      <h3>先认识这些概念</h3><dl className="lesson-terms">{article.prerequisites.map(item=><div key={item.term}><dt>{item.term}</dt><dd>{item.explanation}</dd></div>)}</dl>
    </section>
    <section className="lesson-section lesson-reading"><h2>从直觉到过程</h2>
      {article.mechanism.map(section=><div key={section.title}><h3>{section.title}</h3>{section.paragraphs.map(p=><p key={p}>{p}</p>)}{section.sourceIds?.map(id=>{const source=article.sources.find(s=>s.id===id);return source?<a className="lesson-source-link" key={id} href={source.url}>{source.title} ↗</a>:null;})}</div>)}
    </section>
    <section id="lesson-worked-example" tabIndex={-1} className="lesson-section lesson-reading lesson-worked-example"><p className="eyebrow">一步一步算</p><h2>{article.workedExample.title}</h2><p>{article.workedExample.setup}</p>{article.workedExample.diagram&&<pre className="lesson-diagram" tabIndex={0} aria-label="算例棋盘">{article.workedExample.diagram}</pre>}<ol className="lesson-steps">{article.workedExample.steps.map(step=><li key={step}>{step}</li>)}</ol><p>{article.workedExample.conclusion}</p></section>
  </>;
}

export function LessonCodeReading({article}:{article:LessonArticle}) {
  return <section className="lesson-section lesson-reading"><h2>把讲解对照到代码</h2><dl className="lesson-code-notes">{article.codeWalkthrough.map(item=><div key={item.label}><dt><code>{item.label}</code></dt><dd>{item.explanation}</dd></div>)}</dl></section>;
}

export function LessonPractice({article}:{article:LessonArticle}) {
  return <>
    <section className="lesson-section lesson-reading"><h2>什么场景值得用，什么地方会失败</h2><h3>它的长处</h3><ul>{article.strengths.map(p=><li key={p}>{p}</li>)}</ul><h3>需要警惕的情况</h3><ul>{article.pitfalls.map(p=><li key={p}>{p}</li>)}</ul></section>
    <section id="lesson-practice-section" tabIndex={-1} className="lesson-section lesson-reading"><h2>动手练习与迁移</h2>{article.exercises.map((exercise,i)=><div className="lesson-practice" key={exercise.question}><h3>{i+1}. {exercise.question}</h3><details><summary>查看解题思路</summary><p>{exercise.answer}</p></details></div>)}</section>
    <section className="lesson-section lesson-reading"><h2>继续阅读与来源</h2><p className="muted">以下资料解释算法原理；本页 Snake 场景、代码构件与项目实现的边界另有说明。</p><ul className="lesson-sources">{article.sources.map(source=><li key={source.id}><a href={source.url}>{source.title} ↗</a><p>{source.note}</p></li>)}</ul></section>
  </>;
}
