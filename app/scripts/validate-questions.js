import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedEntities } from '../js/data/editalSeed.js';
import { normalizeQuestionCollection } from '../js/core/questionImport.js';
import { analyzeQuestionCollection, QUESTION_REVIEW_OVERRIDES, isDemoQuestion } from '../js/core/questionSchema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['js/data/questions_pc_al_port.json', 'js/data/questions_pc_al_lote.json'];
const raw = files.flatMap((file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
const { subtopics } = buildSeedEntities();
// Banco real: sem questões DEMO sintéticas
const allRaw = [...raw];
const { questions, errors } = normalizeQuestionCollection(allRaw, subtopics);
const report = analyzeQuestionCollection(questions);
const desiredFields = ['concursoId', 'orgao', 'instituicao', 'cargo', 'banca', 'ano', 'disciplina', 'assunto', 'topicoEditalId', 'topicoEdital', 'dificuldade', 'situacao', 'fonte', 'tags', 'version', 'createdAt', 'updatedAt', 'metadata'];
const filledByNormalization = Object.fromEntries(desiredFields.map((field) => [field,
  allRaw.reduce((count, item, index) => count + ((item[field] == null || item[field] === '') && questions[index]?.[field] != null ? 1 : 0), 0),
]));

const output = {
  total: report.total, validas: report.valid, emRevisao: report.review,
  idsDuplicados: report.duplicateIds, enunciadosDuplicados: report.duplicateStatements,
  gabaritosInvalidos: report.invalidAnswers, alternativasInvalidas: report.invalidOptions,
  semDisciplina: report.missingDiscipline, semAssunto: report.missingSubject, semTopicoEdital: report.missingTopic,
  fontesSanitizadas: report.sanitizedSources, errosEstruturaisDeImportacao: errors,
  demosNoBanco: questions.filter(isDemoQuestion).length,
  revisaoManual: Object.entries(QUESTION_REVIEW_OVERRIDES).map(([id, motivo]) => ({ id, motivo })),
  camposPreenchidosPelaNormalizacao: filledByNormalization,
};
console.log(JSON.stringify(output, null, 2));
const critical = errors.length > 0 || report.duplicateIds.length > 0 || questions.length !== 842 || output.demosNoBanco > 0;
if (critical) process.exitCode = 1;
