import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectActiveJourney } from '../js/services/careerLibraryService.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('menu academico abre a jornada preferida quando ainda nao existe concurso ativo', async () => {
  const app = await source('../js/app.js');
  assert.match(app, /if \(!getActiveContestId\(\)\) \{\s*await openPreferredJourney\(screen\)/);
  assert.match(app, /openContest\(preferred\.contest\.id, \{ initialScreen: screen, contestHint: preferred\.contest \}\)/);
});

test('destino solicitado pelo menu e preservado depois de preparar o concurso', async () => {
  const app = await source('../js/app.js');
  assert.match(app, /initialScreen && ROUTES\[initialScreen\] && initialScreen !== 'library'/);
  assert.match(app, /await navigate\(destination\)/);
});

test('jornada recente e valida e escolhida sem conceder acesso', () => {
  const items = [
    { contest: { id: 'a', contentStatus: 'ready' }, owned: true, summary: { lastAccessAt: '2026-08-01T10:00:00Z' } },
    { contest: { id: 'b', contentStatus: 'ready' }, owned: true, summary: { lastAccessAt: '2026-08-10T10:00:00Z' } },
    { contest: { id: 'c', contentStatus: 'ready' }, owned: false, summary: { lastAccessAt: '2026-08-11T10:00:00Z' } },
  ];
  assert.equal(selectActiveJourney(items)?.contest.id, 'b');
  assert.equal(items[2].owned, false);
});

test('botao do curso informa imediatamente que a jornada esta sendo preparada', async () => {
  const library = await source('../js/ui/library.js');
  assert.match(library, /Preparando jornada\.\.\./);
  assert.match(library, /sincronizando seu progresso/);
  assert.match(library, /candidate\.textContent = originalLabels\.get\(candidate\)/);
  assert.match(library, /if \(openingContests\.has\(contestId\)\) return/);
});

test('cache do PWA muda para distribuir o reparo', async () => {
  const sw = await source('../sw.js');
  assert.match(sw, /detona-v138-library-journey-first/);
});
