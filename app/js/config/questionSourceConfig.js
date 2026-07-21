export const QUESTION_SOURCE_MODES = Object.freeze({
  LEGACY: 'legacy',
  JSON: 'json',
  HYBRID: 'hybrid',
});

// Produção começa em modo híbrido: preserva o acervo atual e adiciona os bancos validados.
export const QUESTION_SOURCE_MODE = QUESTION_SOURCE_MODES.HYBRID;
export const QUESTION_INDEX_URL = './data/questions/index.json';

export function isQuestionSourceMode(value) {
  return Object.values(QUESTION_SOURCE_MODES).includes(value);
}

export function getQuestionSourceMode() {
  const override = globalThis?.localStorage?.getItem?.('detona.questionSourceMode');
  return isQuestionSourceMode(override) ? override : QUESTION_SOURCE_MODE;
}

export function setQuestionSourceMode(mode) {
  if (!isQuestionSourceMode(mode)) throw new TypeError(`Modo de questões inválido: ${mode}`);
  globalThis?.localStorage?.setItem?.('detona.questionSourceMode', mode);
  return mode;
}

