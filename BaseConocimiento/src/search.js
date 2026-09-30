import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const knowledgeRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const articlesDir = path.join(knowledgeRoot, 'articulos');
const videosDir = path.join(knowledgeRoot, 'videos');

const STOPWORDS = new Set([
  'a', 'al', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esa', 'ese', 'esta', 'este',
  'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'que', 'se', 'si', 'su', 'sus', 'un', 'una', 'y',
]);

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function tokens(value) {
  return fold(value)
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function loadManuals() {
  const file = path.join(articlesDir, '..', 'manuales.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadArticles() {
  const manuals = loadManuals();
  return fs.readdirSync(articlesDir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(fs.readFileSync(path.join(articlesDir, name), 'utf8')))
    .map((article) => ({
      ...article,
      manual: manuals[article.id] || article.body,
    }));
}

export function manualVideoFile(id) {
  if (!/^[a-z0-9-]+$/.test(String(id || ''))) return null;
  const file = path.join(videosDir, `${id}.webm`);
  return fs.existsSync(file) ? file : null;
}

export function getManual(id) {
  const article = loadArticles().find((item) => item.id === id);
  if (!article) return null;
  return {
    id: article.id,
    kind: article.kind,
    module: article.module,
    title: article.title,
    summary: article.summary,
    body: article.body,
    manual: article.manual,
    video: Boolean(manualVideoFile(article.id)),
  };
}

function publicArticle(article, score) {
  return {
    id: article.id,
    kind: article.kind,
    module: article.module,
    title: article.title,
    summary: article.summary,
    score,
  };
}

export function listTopics(kind) {
  return loadArticles()
    .filter((article) => !kind || article.kind === kind)
    .map((article) => publicArticle(article))
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

export function searchKnowledge(question, limit = 3) {
  const query = fold(question);
  const words = tokens(question);
  if (!query.trim() || !words.length) return [];

  const wantsProcess = /\b(como|proceso|paso|pasos)\b/.test(query);
  const wantsDictionary = /\b(tabla|tablas|campo|campos|diccionario|columna)\b/.test(query);
  const wantsModule = /\b(modulo|modulos|que es|para que)\b/.test(query);

  const ranked = loadArticles().map((article) => {
    const title = fold(article.title);
    const summary = fold(article.summary);
    const body = fold(`${article.body}\n${article.manual || ''}`);
    const keywords = (article.keywords || []).map(fold);
    let score = 0;

    if (title.includes(query) && query.length > 4) score += 14;
    if (keywords.some((keyword) => query.includes(keyword) && keyword.length > 3)) score += 6;

    for (const word of words) {
      const stem = word.length > 6 ? word.slice(0, 6) : word;
      const inText = (text) => text.includes(word) || (stem !== word && text.includes(stem));
      if (inText(title)) score += 5;
      if (keywords.some((keyword) => inText(keyword))) score += 4;
      if (inText(summary)) score += 2;
      if (inText(body)) score += 1;
      if (inText(fold(article.module))) score += 2;
    }

    if (wantsProcess && article.kind === 'proceso') score += 3;
    if (wantsDictionary && article.kind === 'diccionario') score += 8;
    if (wantsModule && article.kind === 'modulo') score += 3;

    return { article, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, 'es'));

  return ranked.slice(0, limit);
}

export function consultKnowledge(question) {
  const hits = searchKnowledge(question, 3);
  if (!hits.length) {
    return {
      answer: 'No encontré ese tema en la base de conocimiento. Pregunte por un módulo, un proceso o una tabla. Por ejemplo: cotización, entrada por compra, lote del proveedor o cuenta por pagar.',
      articles: [],
    };
  }

  const [best, ...rest] = hits;
  const related = rest.length
    ? `\n\nTambién puede revisar: ${rest.map((item) => item.article.title).join(', ')}.`
    : '';

  return {
    answer: `${best.article.body}${related}`,
    articles: hits.map((item) => publicArticle(item.article, item.score)),
  };
}
