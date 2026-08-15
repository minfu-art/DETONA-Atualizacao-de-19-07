import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_ENTRIES = 2545;
const ADMIN_DISCIPLINE_ID = 'pc_ba_2026_investigador_policia_civil_discipline_nocoes_de_direito_administrativo';

const TOPIC_SOURCES = Object.freeze({
  pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_1_nocoes_de_organizacao_administrativa: [
    'pc_ba_2026_inv_dadm_aula_01',
    'pc_ba_2026_inv_dadm_aula_02',
  ],
  pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_2_ato_administrativo: [
    'pc_ba_2026_inv_dadm_aula_04',
  ],
  pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_4_poderes_administrativos: [
    'pc_ba_2026_inv_dadm_aula_03',
  ],
  pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_5_licitacao_e_contratos_administrativos: [
    'pc_ba_2026_inv_dadm_aula_05',
    'pc_ba_2026_inv_dadm_aula_06',
    'br_lei_14133_2021_compilada',
  ],
  pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_8_regime_juridico_administrativo: [
    'pc_ba_2026_inv_dadm_aula_00',
    'br_constituicao_1988_compilada',
  ],
  pc_ba_2026_investigador_policia_civil_topic_direito_administrativo_12_atos_administrativos_requisitos_elementos: [
    'pc_ba_2026_inv_dadm_aula_04',
  ],
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildSourceReadiness({ matrix, catalog, catalogBytes }) {
  invariant(Array.isArray(matrix.entries), 'Matriz de cobertura inválida.');
  invariant(matrix.entries.length === EXPECTED_ENTRIES, 'Quantidade de microconhecimentos divergente.');
  invariant(catalog.contest_id === 'pc_ba_2026', 'Catálogo pertence a outro concurso.');
  const knownSources = new Set((catalog.sources || []).map(({ source_id }) => source_id));
  for (const sourceIds of Object.values(TOPIC_SOURCES)) {
    for (const sourceId of sourceIds) invariant(knownSources.has(sourceId), `Fonte ausente no catálogo: ${sourceId}.`);
  }

  const entries = matrix.entries.map((entry) => {
    const sourceIds = TOPIC_SOURCES[entry.topic_id] || [];
    const sourceSufficient = entry.discipline_id === ADMIN_DISCIPLINE_ID && sourceIds.length > 0;
    return {
      microknowledge_id: entry.microknowledge_id,
      discipline_id: entry.discipline_id,
      topic_id: entry.topic_id,
      subtopic_id: entry.subtopic_id,
      fragment_id: entry.fragment_id,
      canonical_scope: entry.canonical_scope,
      source_ids: sourceIds,
      source_readiness: sourceSufficient ? 'sufficient_for_draft_authoring' : 'blocked_missing_validated_source',
      authoring_allowed: sourceSufficient,
      editorial_approval: false,
      production_delivery_allowed: false,
      blocker: sourceSufficient ? null : 'validated_source_not_mapped',
    };
  });

  const ready = entries.filter(({ authoring_allowed }) => authoring_allowed).length;
  const byTopic = Object.entries(TOPIC_SOURCES).map(([topic_id, source_ids]) => ({
    topic_id,
    source_ids,
    microknowledge_count: entries.filter((entry) => entry.topic_id === topic_id).length,
  }));
  invariant(ready === 180, `Cobertura inicial esperada de 180 microconhecimentos, obtida ${ready}.`);

  return {
    schema_version: 'detona_source_readiness_v1',
    status: 'draft_authoring_gate',
    contest_id: 'pc_ba_2026',
    position_id: 'pc_ba_2026_investigador_policia_civil',
    source_catalog_version: catalog.version,
    source_catalog_sha256: sha256(catalogBytes),
    counts: {
      microknowledges: entries.length,
      sufficient_for_draft_authoring: ready,
      blocked_missing_validated_source: entries.length - ready,
      editorially_approved: 0,
      production_delivery_allowed: 0,
    },
    covered_topics: byTopic,
    entries,
    authorization: {
      draft_question_authoring: true,
      staging_import: false,
      production_publication: false,
    },
  };
}

export async function generateSourceReadiness({ matrixPath, catalogPath, outputPath }) {
  const matrixBytes = await readFile(path.resolve(matrixPath));
  const catalogBytes = await readFile(path.resolve(catalogPath));
  const result = buildSourceReadiness({
    matrix: JSON.parse(matrixBytes.toString('utf8')),
    catalog: JSON.parse(catalogBytes.toString('utf8')),
    catalogBytes,
  });
  const destination = path.resolve(outputPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [matrixPath, catalogPath, outputPath] = process.argv.slice(2);
  invariant(matrixPath && catalogPath && outputPath,
    'Use: node generate-pc-ba-investigador-source-readiness.mjs <matrix> <catalog> <output>.');
  const result = await generateSourceReadiness({ matrixPath, catalogPath, outputPath });
  process.stdout.write(`${JSON.stringify(result.counts)}\n`);
}
