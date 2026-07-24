import { normalizeQuestion } from '../core/questionSchema.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { resolveSubtopicAlias } from '../config/subtopicAliases.js';

const DISCIPLINE_MAP = Object.freeze({
  analise_de_dados: 'dados', estatistica: 'estat', contabilidade: 'contab', contabilidade_geral: 'contab',
  direito_penal: 'penal', direito_constitucional: 'const', direitos_humanos: 'dh',
  lingua_portuguesa: 'port', 'lingua-portuguesa': 'port',
  raciocinio_logico_matematico: 'rlm',
  tecnologia_da_informacao_crimes_ciberneticos: 'ti',
  tecnologia_informacao: 'ti',
  'tecnologia-informacao-seguranca-cibernetica': 'ti',
  seguranca_cibernetica: 'ciber',
  'seguranca-cibernetica': 'ciber',
  estatutos_dos_servidores_de_alagoas: 'leg_al',
});

function legacyDisciplineId(question) {
  const id = String(question.disciplinaId || question.disciplina || question.discipline_id || '');
  return DISCIPLINE_MAP[id] || id;
}

export function resolveLegacySubtopicId(question) {
  if (question.subtopic_id || question.topicoEditalId) {
    return resolveSubtopicAlias(question.subtopic_id || question.topicoEditalId);
  }
  const discipline = legacyDisciplineId(question);
  const subject = `${question.assunto || ''} ${question.subtopico || ''}`.toLocaleLowerCase('pt-BR');
  if (discipline === 'dados') {
    if (/minera|crisp|data mining/.test(subject)) return 'dados_2';
    if (/linguagem natural|pln|nlp/.test(subject)) return 'dados_3';
    if (/machine|aprendizado|overfitting|underfitting/.test(subject)) return 'dados_4';
    if (/python|pandas|numpy/.test(subject)) return 'dados_5';
  }
  return `${discipline}_1`;
}

export function normalizarQuestao(question) {
  const source = structuredClone(question);
  const discipline = legacyDisciplineId(source);
  const topicId = resolveLegacySubtopicId(source);
  const rawTipo = source.tipo || source.format || '';
  const isCE = rawTipo === 'certo_errado' || (!String(rawTipo).includes('multipla') && !Array.isArray(source.alternativas));
  const alternativas = isCE
    ? []
    : (source.alternativas || source.options || []).map((item) => (typeof item === 'string'
      ? item
      : { ...item }));
  const normalized = normalizeQuestion({
    ...source,
    disciplina: discipline,
    subtopic_id: topicId,
    topicoEditalId: topicId,
    format: String(rawTipo).includes('multipla') ? 'multipla_escolha' : 'certo_errado',
    tipo: String(rawTipo).includes('multipla') ? 'multipla_escolha' : 'certo_errado',
    statement: source.enunciado || source.statement,
    enunciado: source.enunciado || source.statement,
    options: alternativas,
    alternativas,
    correct_answer: source.respostaCorreta ?? source.correct_answer,
    respostaCorreta: source.respostaCorreta ?? source.correct_answer,
    explanation: source.explicacao || source.explanation,
    situacao: source.situacao || source.status,
    status: source.status || source.situacao,
    is_user_created: false,
  }, { disciplina: discipline, topicoEditalId: topicId, topicoEdital: source.subtopico || source.assunto || '' });
  // O schema legado higieniza espaços; os bancos editoriais precisam manter quebras de linha de código e comentários integrais.
  const statement = source.enunciado || source.statement || normalized.enunciado;
  const explanation = source.explicacao || source.explanation || normalized.explicacao;
  return {
    ...normalized,
    questionSource: source.questionSource || (source.disciplinaId ? 'json' : 'legacy'),
    enunciado: statement,
    statement,
    explicacao: explanation,
    explanation,
    subtopic_id: normalized.subtopic_id || topicId,
    topicoEditalId: normalized.topicoEditalId || topicId,
    comentariosAlternativas: (normalized.alternativas || []).map((item, index) => (
      typeof item === 'string'
        ? { letra: String.fromCharCode(65 + index), comentario: '' }
        : { letra: item.letra || String.fromCharCode(65 + index), comentario: item.comentario || '' }
    )),
  };
}

export function createQuestionService(repository = questionRepository) {
  async function listar(filtros = {}) {
    const normalized = (await repository.listar({ mode: filtros.mode })).map(normalizarQuestao);
    return normalized.filter((question) => {
      if (filtros.concursoId && question.concursoId !== filtros.concursoId) return false;
      if (filtros.disciplinaId && question.disciplina !== filtros.disciplinaId && question.metadata?.disciplinaId !== filtros.disciplinaId) return false;
      if (filtros.assunto && question.assunto !== filtros.assunto) return false;
      if (filtros.subtopicId) {
        const sid = String(filtros.subtopicId);
        const qSid = String(question.subtopic_id || '');
        const qTid = String(question.topicoEditalId || '');
        if (qSid !== sid && qTid !== sid) return false;
      }
      return true;
    });
  }
  async function buscarPorId(id, filtros = {}) {
    const question = await repository.buscarPorId(id, filtros);
    return question ? normalizarQuestao(question) : null;
  }
  function validarResposta(question, answer) {
    const normalized = normalizarQuestao(question);
    if (normalized.format === 'certo_errado') {
      const value = /^(c|certo|true)$/i.test(String(answer));
      return value === normalized.correct_answer;
    }
    return String(answer).trim().toUpperCase() === String(normalized.correct_answer).trim().toUpperCase();
  }
  function obterExplicacao(question) {
    const normalized = normalizarQuestao(question);
    return { explicacao: normalized.explicacao, alternativas: structuredClone(question.alternativas || []) };
  }
  return { listar, buscarPorId, validarResposta, obterExplicacao, normalizarQuestao };
}

export const questionService = createQuestionService();
