const normalizeKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const REFERENCE_TEXTS = Object.freeze([
  Object.freeze({
    referenceId: '1A11-I',
    sourceKey: 'cebraspe / sefaz-rs / 2019',
    text: `Texto 1A11-I

Pixis foi um músico medíocre, mas teve o seu dia de glória no distante ano de 1837. Em um concerto em Paris, Franz Liszt tocou uma peça do (hoje) desconhecido compositor, junto com outra, do admirável, maravilhoso e extraordinário Beethoven (os adjetivos aqui podem ser verdadeiros, mas — como se verá — relativos).

A plateia, formada por um público refinado, culto e um pouco bovino, como são, sempre, os homens em ajuntamentos, esperava com impaciência. Liszt tocou Beethoven e foi calorosamente aplaudido. Depois, quando chegou a vez do obscuro e inferior Pixis, manifestou-se o desprezo coletivo. Alguns, com ouvidos mais sensíveis, depois de lerem o programa que anunciava as peças do músico menor, retiraram-se do teatro, incapazes de suportar música de má qualidade.

Como sabemos, os melômanos são impacientes com as obras de epígonos, tão céleres em reproduzir, em clave rebaixada, as novas técnicas inventadas pelos grandes artistas. Liszt, no entanto, registraria que um erro tipográfico invertera, no programa do concerto, os nomes de Pixis e Beethoven...

A música de Pixis, ouvida como sendo de Beethoven, foi recebida com entusiasmo e paixão, e a de Beethoven, ouvida como sendo de Pixis, foi enxovalhada. Esse episódio, cômico se não fosse doloroso, deveria nos tornar mais atentos e menos arrogantes a respeito do que julgamos ser arte.

Desconsiderar, no fenômeno estético, os mecanismos de recepção é correr o risco de aplaudir Pixis como se fosse Beethoven.

Charles Kiefer. O paradoxo de Pixis. In: Para ser escritor. São Paulo: Leya, 2010 (com adaptações).`,
  }),
]);

function explicitReferenceText(question = {}) {
  return [
    question.referenceText,
    question.textoReferencia,
    question.reference_text,
    question.contextoCompartilhado,
    question.metadata?.referenceText,
    question.metadata?.reference_text,
    question.metadata?.textoReferencia,
    question.metadata?.contextoCompartilhado,
  ].map((value) => String(value || '').trim()).find(Boolean) || '';
}

export function resolveQuestionReferenceImage(question = {}) {
  const candidate = [
    question.referenceImage,
    question.reference_image,
    question.imagemReferencia,
    question.metadata?.referenceImage,
    question.metadata?.reference_image,
    question.metadata?.imagemReferencia,
  ].map((value) => String(value || '').trim()).find(Boolean) || '';
  if (!candidate) return '';
  if (/^https:\/\//i.test(candidate)) return candidate;
  if (/^(?:\.{1,2}\/|\/(?!\/))/i.test(candidate)) return candidate;
  return '';
}

export function questionReferenceId(question = {}) {
  const statement = String(question.statement || question.enunciado || '');
  return statement.match(/\btexto\s+([0-9][A-Z0-9-]{2,})\b/i)?.[1]?.toUpperCase() || '';
}

export function resolveQuestionReferenceText(question = {}) {
  const explicit = explicitReferenceText(question);
  if (explicit) return explicit;

  const referenceId = questionReferenceId(question);
  if (!referenceId) return '';
  const source = normalizeKey(
    question.fonteProva
    || question.sourceExam
    || question.metadata?.fonteProva
    || question.metadata?.sourceExam
    || question.fonte
    || question.source,
  );
  const match = REFERENCE_TEXTS.find((entry) => (
    entry.referenceId === referenceId
    && source.includes(entry.sourceKey)
  ));
  return match?.text || '';
}

export function questionRequiresReferenceText(question = {}) {
  return Boolean(questionReferenceId(question));
}
