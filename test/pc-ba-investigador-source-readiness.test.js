import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildSourceReadiness } from '../scripts/generate-pc-ba-investigador-source-readiness.mjs';

const root = new URL('../course-drafts/pc-ba-2026-investigador/', import.meta.url);

test('gate de fontes libera somente microconhecimentos com material validado mapeado', async () => {
  const matrix = JSON.parse(await readFile(new URL('knowledge-coverage-matrix.reviewed.v1.1.json', root), 'utf8'));
  const catalogBytes = await readFile(new URL('sources/source-catalog.v2.json', root));
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const result = buildSourceReadiness({ matrix, catalog, catalogBytes });
  assert.equal(result.counts.microknowledges, 2545);
  assert.equal(result.counts.sufficient_for_draft_authoring, 180);
  assert.equal(result.counts.blocked_missing_validated_source, 2365);
  assert.equal(result.counts.editorially_approved, 0);
  assert.equal(result.counts.production_delivery_allowed, 0);
  assert.ok(result.entries.filter(({ authoring_allowed }) => authoring_allowed)
    .every(({ discipline_id, source_ids }) => discipline_id.endsWith('nocoes_de_direito_administrativo') && source_ids.length));
});

test('catálogo não expõe caminhos locais nem dados de marca dágua', async () => {
  const source = await readFile(new URL('sources/source-catalog.v2.json', root), 'utf8');
  assert.doesNotMatch(source, /C:\\\\Users|OneDrive|cpf|watermark_text/i);
  const catalog = JSON.parse(source);
  assert.equal(catalog.privacy.private_materials_must_not_be_published, true);
  assert.ok(catalog.sources.filter(({ source_type }) => source_type === 'authorized_didactic_material')
    .every(({ publish_source_file }) => publish_source_file === false));
});
