import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createQuestionRepository } from '../js/repositories/questionRepository.js';
import { QUESTION_SOURCE_MODES } from '../js/config/questionSourceConfig.js';

const statement = 'Determinada lei, publicada seis meses antes da realização das eleições, criou hipótese de inelegibilidade. Assinale a opção correta.';

test('repositório prefere a duplicata com alternativas completas', async () => {
  const broken = {
    id: 'q_quebrada', contest_id: 'pc_al_2026', subtopic_id: 'const_1',
    format: 'multipla_escolha', statement: `39. (CEBRASPE/TRE-BA/2017) ${statement}`,
    options: ['A)', 'B) Texto da alternativa correta.', 'C)', 'D)', 'E) Outro texto.'], correct_answer: 'B',
  };
  const complete = {
    id: 'q_completa', contest_id: 'pc_al_2026', subtopic_id: 'const_1',
    format: 'multipla_escolha', statement,
    options: ['A) Primeira.', 'B) Segunda.', 'C) Terceira.', 'D) Quarta.', 'E) Quinta.'], correct_answer: 'B',
  };
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () => (url === 'index.json'
      ? { disciplinas: [{ id: 'const', arquivo: 'const.json' }] }
      : [broken, complete]),
  });
  const repository = createQuestionRepository({
    fetchImpl,
    legacyLoader: async () => [],
    modeLoader: () => QUESTION_SOURCE_MODES.JSON,
    indexUrl: 'index.json',
  });

  const result = await repository.listar();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'q_completa');
});

test('regressão PC AL: questão TRE-BA usa a versão editorial completa', async () => {
  const bank = JSON.parse(await readFile(new URL('../data/questions/direito_constitucional.json', import.meta.url), 'utf8'));
  const repository = createQuestionRepository({
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => (url === 'index.json'
        ? { disciplinas: [{ id: 'const', arquivo: 'const.json' }] }
        : bank),
    }),
    legacyLoader: async () => [],
    modeLoader: () => QUESTION_SOURCE_MODES.JSON,
    indexUrl: 'index.json',
  });

  const result = await repository.listar();
  assert.ok(result.some(({ id }) => id === 'PCAL-DC-05-P-039'));
  assert.equal(result.some(({ id }) => id === 'q_lote_q_import_0413'), false);
});
