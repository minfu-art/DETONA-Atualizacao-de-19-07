/**
 * Edital UI — modelo de apresentação (sem alterar SSOT/domínio/XP).
 * Usa apenas dados já existentes e getMasterySpheres do ssot.
 */
import { getMasterySpheres, MIN_QUESTIONS_BATTLE } from './ssot.js';

export { MIN_QUESTIONS_BATTLE };

export const EDITAL_FILTERS = Object.freeze([
  { id: 'all', label: 'Todos' },
  { id: 'nao', label: 'Não iniciados' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'batalha', label: 'Prontos para combate' },
  { id: 'concluidos', label: 'Concluídos' },
]);

export const EDITAL_SORTS = Object.freeze([
  { id: 'nome', label: 'Nome' },
  { id: 'progresso', label: 'Progresso' },
  { id: 'atraso', label: 'Atraso' },
  { id: 'prioridade', label: 'Prioridade' },
]);

/** Status de atraso: regra legada (>14 dias). */
export function isOverdue(item, now = Date.now()) {
  if (!item?.last_review_date) {
    return (item?.review_count > 0) || item?.theory_status !== 'nao_iniciado';
  }
  const days = (now - new Date(item.last_review_date).getTime()) / 86400000;
  return days > 14;
}

export function sphereProgressPct(spheres) {
  const n = (spheres.theoryOn ? 1 : 0) + (spheres.reviewOn ? 1 : 0) + (spheres.combatOn ? 1 : 0);
  return Math.round((n / 3) * 100);
}

export function itemStatus(item, sub, spheres, questionCount, now = Date.now()) {
  if (spheres.complete) {
    return { key: 'concluido', label: 'Concluído', symbol: '✓', tone: 'ok', action: 'Ver resultado', actionKind: 'result', shortAction: 'Resultado >' };
  }
  if (isOverdue(item, now)) {
    return { key: 'atrasado', label: 'Atrasado', symbol: '!', tone: 'warn', action: 'Revisar', actionKind: 'review', shortAction: 'Revisar >' };
  }
  const notStarted = item.theory_status === 'nao_iniciado'
    && !(sub?.attempts_count > 0)
    && !(item.review_count > 0);
  if (notStarted) {
    return { key: 'nao_iniciado', label: 'Não iniciado', icon: 'circle', tone: 'muted', action: 'Começar', actionKind: 'start', shortAction: 'Começar >' };
  }
  const readyCombat = spheres.theoryOn && !spheres.combatOn && questionCount >= MIN_QUESTIONS_BATTLE;
  if (readyCombat) {
    return { key: 'pronto', label: 'Pronto para questões', icon: 'focus', tone: 'combat', action: 'Resolver questões', actionKind: 'battle', shortAction: 'Questões >' };
  }
  if (!spheres.combatOn && questionCount < MIN_QUESTIONS_BATTLE && spheres.theoryOn) {
    return { key: 'bloqueado', label: 'Questões bloqueadas', icon: 'lock', tone: 'blocked', action: 'Ver requisitos', actionKind: 'blocked', shortAction: 'Requisitos >' };
  }
  return { key: 'andamento', label: 'Em andamento', symbol: '…', tone: 'progress', action: 'Continuar', actionKind: 'continue', shortAction: 'Continuar >' };
}

export function enrichItems(items, subMap, questionCounts, now = Date.now()) {
  return items.map((item) => {
    const sub = subMap[item.subtopic_id];
    const spheres = getMasterySpheres(item, sub);
    const questionCount = questionCounts[item.subtopic_id] || 0;
    const status = itemStatus(item, sub, spheres, questionCount, now);
    const overdue = isOverdue(item, now);
    const progress = sphereProgressPct(spheres);
    const accuracy = Math.max(0, Math.min(100, Math.round(Number(sub?.best_accuracy) || item.accuracy || 0)));
    const answered = Array.isArray(sub?.answered_question_ids)
      ? sub.answered_question_ids.length
      : (sub?.attempts_count ? Math.max(sub.attempts_count, 0) : 0);
    const correct = Array.isArray(sub?.correct_question_ids) ? sub.correct_question_ids.length : 0;
    const wrong = Array.isArray(sub?.incorrect_question_ids) ? sub.incorrect_question_ids.length : 0;
    return {
      item, sub, spheres, questionCount, status, overdue, progress, accuracy, answered, correct, wrong,
      disciplineId: sub?.discipline_id || null,
    };
  });
}

export function filterEnriched(enriched, filter) {
  if (filter === 'nao') return enriched.filter((e) => e.status.key === 'nao_iniciado');
  if (filter === 'andamento') {
    return enriched.filter((e) => ['andamento', 'pronto', 'bloqueado'].includes(e.status.key));
  }
  if (filter === 'atrasados') return enriched.filter((e) => e.overdue && !e.spheres.complete);
  if (filter === 'batalha') {
    // regra legada: teoria concluída e < 3 estrelas
    return enriched.filter((e) => e.sub && (e.sub.stars || 0) < 3 && e.item.theory_status === 'concluido');
  }
  if (filter === 'concluidos') return enriched.filter((e) => e.spheres.complete);
  return enriched;
}

export function matchesSearch(e, disc, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const hay = [
    e.item.edital_numbering,
    e.item.title,
    e.item.id,
    e.sub?.name,
    e.sub?.id,
    disc?.name,
    disc?.id,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function sortEnriched(list, sortId = 'nome') {
  const arr = [...list];
  if (sortId === 'progresso') {
    return arr.sort((a, b) => b.progress - a.progress || String(a.item.title).localeCompare(String(b.item.title)));
  }
  if (sortId === 'atraso') {
    return arr.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.progress - b.progress);
  }
  if (sortId === 'prioridade') {
    const prio = { atrasado: 0, pronto: 1, andamento: 2, bloqueado: 3, nao_iniciado: 4, concluido: 5 };
    return arr.sort((a, b) => (prio[a.status.key] ?? 9) - (prio[b.status.key] ?? 9) || a.progress - b.progress);
  }
  // nome / código
  return arr.sort((a, b) => String(a.item.edital_numbering || '').localeCompare(String(b.item.edital_numbering || ''), 'pt', { numeric: true })
    || String(a.item.title || '').localeCompare(String(b.item.title || ''), 'pt'));
}

export function buildDisciplineCards(disciplines, enrichedAll, discMap) {
  return disciplines
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((d) => {
      const list = enrichedAll.filter((e) => e.disciplineId === d.id);
      if (!list.length) return null;
      const complete = list.filter((e) => e.spheres.complete).length;
      const overdue = list.filter((e) => e.overdue && !e.spheres.complete).length;
      const answered = list.reduce((s, e) => s + (e.answered || 0), 0);
      const correct = list.reduce((s, e) => s + (e.correct || 0), 0);
      const wrong = list.reduce((s, e) => s + (e.wrong || 0), 0);
      // Domínio dá o mesmo peso a todos os subtópicos, inclusive aos ainda
      // não estudados (que valem zero). Precisão considera somente respostas.
      const masteryPct = list.length
        ? Math.round((list.reduce((s, e) => s + (e.accuracy || 0), 0) / list.length) * 10) / 10
        : 0;
      const accuracyPct = answered ? Math.round((correct / answered) * 1000) / 10 : 0;
      const completionPct = Math.round((complete / list.length) * 1000) / 10;
      return {
        discipline: d,
        total: list.length,
        complete,
        overdue,
        answered,
        correct,
        wrong,
        masteryPct,
        accuracyPct,
        completionPct,
        // Compatibilidade dos componentes existentes: pct é domínio e
        // avgAccuracy é a precisão ponderada pelas respostas.
        pct: masteryPct,
        avgAccuracy: accuracyPct,
        items: list,
      };
    })
    .filter(Boolean);
}

export function buildEditalInsights(enriched = []) {
  const attempted = enriched.filter((entry) => entry.answered > 0);
  const strong = attempted
    .filter((entry) => entry.accuracy >= 70 && (entry.spheres.stars || 0) >= 3)
    .sort((a, b) => b.accuracy - a.accuracy || b.progress - a.progress);
  const weak = attempted
    .filter((entry) => entry.accuracy < 60 || entry.overdue || ['frio', 'congelado'].includes(entry.sub?.memory_temperature))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.accuracy - b.accuracy);
  const pending = enriched
    .filter((entry) => !entry.spheres.complete)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.progress - b.progress);
  return {
    strong,
    weak,
    pending,
    strongCount: strong.length,
    weakCount: weak.length,
    pendingCount: pending.length,
    overdueCount: pending.filter((entry) => entry.overdue).length,
    nextAction: weak[0] || pending[0] || null,
  };
}

export function storageKey(contestId, name) {
  return `detona.edital.${name}.${contestId || 'default'}`;
}

export function loadNavState(contestId, storage = globalThis.localStorage) {
  try {
    return {
      lastDisciplineId: storage?.getItem?.(storageKey(contestId, 'lastDisc')) || null,
      lastSubtopicId: storage?.getItem?.(storageKey(contestId, 'lastSub')) || null,
      sort: storage?.getItem?.(storageKey(contestId, 'sort')) || 'nome',
    };
  } catch {
    return { lastDisciplineId: null, lastSubtopicId: null, sort: 'nome' };
  }
}

export function saveNavState(contestId, { lastDisciplineId, lastSubtopicId, sort }, storage = globalThis.localStorage) {
  try {
    if (lastDisciplineId != null) storage?.setItem?.(storageKey(contestId, 'lastDisc'), lastDisciplineId);
    if (lastSubtopicId != null) storage?.setItem?.(storageKey(contestId, 'lastSub'), lastSubtopicId);
    if (sort != null) storage?.setItem?.(storageKey(contestId, 'sort'), sort);
  } catch { /* ignore */ }
}

/** Agrupa subtópicos por prefixo de numeração (ex.: 1.4 -> grupo) — opcional. */
export function groupByNumberingPrefix(enrichedList) {
  const groups = new Map();
  for (const e of enrichedList) {
    const num = String(e.item.edital_numbering || '');
    const parts = num.split('.');
    let key = 'Outros';
    if (parts.length >= 2) key = parts.slice(0, 2).join('.');
    else if (parts.length === 1 && parts[0]) key = parts[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.entries()].map(([prefix, rawItems]) => {
    const items = sortEnriched(rawItems, 'nome');
    const stems = items.map((entry) => String(entry.item.title || '').split(/[:–—]/)[0].trim()).filter(Boolean);
    const sharedStem = stems.length > 1 && stems.every((stem) => stem === stems[0]) ? stems[0] : '';
    const title = prefix === 'Outros'
      ? 'Outros conteúdos'
      : items.length === 1
        ? items[0].item.title
        : sharedStem || `Tópico ${prefix.split('.').at(-1)}`;
    const complete = items.filter((entry) => entry.spheres.complete).length;
    const progress = items.length ? Math.round(items.reduce((sum, entry) => sum + entry.progress, 0) / items.length) : 0;
    const mastery = items.length
      ? Math.round((items.reduce((sum, entry) => sum + (entry.accuracy || 0), 0) / items.length) * 10) / 10
      : 0;
    const answered = items.reduce((sum, entry) => sum + (entry.answered || 0), 0);
    const correct = items.reduce((sum, entry) => sum + (entry.correct || 0), 0);
    const wrong = items.reduce((sum, entry) => sum + (entry.wrong || 0), 0);
    const accuracy = answered ? Math.round((correct / answered) * 1000) / 10 : 0;
    const stars = items.length
      ? Math.round((items.reduce((sum, entry) => sum + (entry.spheres.stars || 0), 0) / items.length) * 2) / 2
      : 0;
    return {
      prefix, title, items, complete, total: items.length, progress, mastery, accuracy, stars,
      answered, correct, wrong,
      pending: items.length - complete,
      overdue: items.filter((entry) => entry.overdue && !entry.spheres.complete).length,
    };
  });
}
