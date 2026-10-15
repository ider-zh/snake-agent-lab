/** Editorial content accompanies, but never replaces, the executable demos. */
export interface LessonSource {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface ReadingSection {
  title: string;
  paragraphs: string[];
  sourceIds?: string[];
}

export interface LessonArticle {
  motivation: string[];
  prerequisites: { term: string; explanation: string }[];
  mechanism: ReadingSection[];
  workedExample: {
    title: string;
    setup: string;
    diagram?: string;
    steps: string[];
    conclusion: string;
  };
  codeWalkthrough: { label: string; explanation: string }[];
  strengths: string[];
  pitfalls: string[];
  exercises: { question: string; answer: string }[];
  sources: LessonSource[];
}
