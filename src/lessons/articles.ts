import { classicArticles } from './articles-classic';
import { searchArticles } from './articles-search';
import { planningArticles } from './articles-planning';
import { valueArticles } from './articles-value';
import { policyArticles } from './articles-policy';
import type { LessonArticle } from './article-types';

export const articles:Record<string,LessonArticle>={...classicArticles,...searchArticles,...planningArticles,...valueArticles,...policyArticles};
