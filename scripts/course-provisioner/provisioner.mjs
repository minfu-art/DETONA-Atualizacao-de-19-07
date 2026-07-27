import { execFileSync } from 'node:child_process';
import { publicBundleSummary, sha256, stableJson } from './bundle.mjs';

const PROTECTED_PATHS = Object.freeze([
  'app/js/core',
  'app/js/ui',
  'app/js/contest',
  'app/js/services',
  'app/js/repositories',
  'app/js/supabase',
  'app/sw.js',
]);

const CONTEST_FIELDS = Object.freeze([
  'id', 'code', 'slug', 'name', 'role', 'description', 'price_cents', 'currency',
  'color', 'accent', 'icon', 'cover_asset', 'exam_date',
]);

function cleanQuestion(question) {
  const { _answer_kind, status, ...clean } = question;
  return clean;
}

function normalizedQuestion(value = {}) {
  const payload = value.payload && typeof value.payload === 'object' ? value.payload : value;
  return {
    id: String(payload.id || payload.question_id || value.source_question_id || value.id || ''),
    contest_id: String(payload.contest_id || value.contest_id || ''),
    subtopic_id: String(payload.subtopic_id || payload.topicoEditalId || ''),
    statement: String(payload.statement || payload.enunciado || value.statement || ''),
    options: payload.options || payload.alternativas || value.options || [],
    correct_answer: payload.correct_answer ?? payload.respostaCorreta ?? value.correct_answer,
    explanation: String(payload.explanation || payload.explicacao || value.explanation || ''),
    difficulty: payload.difficulty ?? payload.dificuldade ?? value.difficulty ?? null,
    source: payload.source ?? value.source ?? null,
    is_trick: Boolean(payload.is_trick ?? value.is_trick),
  };
}

function questionEqual(local, remote) {
  return stableJson(normalizedQuestion(cleanQuestion(local))) === stableJson(normalizedQuestion(remote));
}

function contestComparable(contest = {}) {
  return Object.fromEntries(CONTEST_FIELDS.map((field) => [field, contest[field] ?? null]));
}

export function curriculumComparable(nodes = []) {
  const sourceById = new Map(nodes.filter((node) => node.id).map((node) => [node.id, node.source_id]));
  return nodes.map((node) => ({
    source_id: node.source_id,
    parent_source_id: node.parent_source_id || (node.parent_id ? sourceById.get(node.parent_id) : null) || null,
    type: node.type,
    name: node.name,
    description: node.description || null,
    order_index: Number(node.order_index),
  })).sort((a, b) => a.source_id.localeCompare(b.source_id));
}

function gitStatus(cwd, paths = []) {
  try {
    return execFileSync('git', ['status', '--porcelain=v1', ...(paths.length ? ['--', ...paths] : [])], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'GIT_STATUS_UNAVAILABLE';
  }
}

async function paginatedQuestions(client, contestId) {
  const rows = [];
  let page = 1;
  while (page <= 10_000) {
    const result = await client.editorial('list_questions', {
      contestId, search: '', status: null, page, pageSize: 50,
    });
    rows.push(...(result.questions || []));
    if (rows.length >= Number(result.total || 0) || (result.questions || []).length < 50) break;
    page += 1;
  }
  return rows;
}

async function maybeContest(client, contestId) {
  const result = await client.contests('list_contests', { search: contestId });
  const found = (result.contests || []).find(({ id }) => id === contestId);
  if (!found) return null;
  return (await client.contests('get_contest', { contestId })).contest;
}

export async function readRemoteState(client, bundle) {
  const contest = await maybeContest(client, bundle.contest.id);
  if (!contest) {
    return {
      exists: false,
      contest: null,
      curriculum: [],
      questions: [],
      batches: [],
      versions: [],
      assets: [],
      visual: null,
      packages: [],
      audit: [],
      publication: null,
    };
  }
  const [curriculum, questions, batches, versions, media, packages, audit, publication] = await Promise.all([
    client.contests('get_curriculum_tree', { contestId: bundle.contest.id }),
    paginatedQuestions(client, bundle.contest.id),
    client.editorial('list_batches', { contestId: bundle.contest.id }),
    client.editorial('list_versions', { contestId: bundle.contest.id }),
    client.media('list_contest_assets', { contestId: bundle.contest.id }),
    client.contests('list_content_packages', { contestId: bundle.contest.id }),
    client.contests('list_audit', { contestId: bundle.contest.id, page: 1, pageSize: 50 }),
    client.contests('validate_publication', { contestId: bundle.contest.id }),
  ]);
  return {
    exists: true,
    contest,
    curriculum: curriculum.nodes || [],
    questions,
    batches: batches.batches || [],
    versions: versions.versions || [],
    assets: media.assets || [],
    visual: media.visual || {},
    packages: packages.packages || [],
    audit: audit.rows || [],
    publication,
  };
}

export function compareRemoteState(bundle, remote) {
  const conflicts = [];
  const warnings = [];
  const contestDifferences = [];
  if (remote.exists) {
    for (const field of CONTEST_FIELDS) {
      if (stableJson(bundle.contest[field] ?? null) !== stableJson(remote.contest?.[field] ?? null)) {
        contestDifferences.push({
          field,
          bundle: bundle.contest[field] ?? null,
          remote: remote.contest?.[field] ?? null,
        });
      }
    }
  }
  const contestMatches = remote.exists
    && stableJson(contestComparable(bundle.contest)) === stableJson(contestComparable(remote.contest));
  if (remote.exists && !contestMatches) conflicts.push('contest_metadata_differs');

  const localCurriculum = curriculumComparable(bundle.curriculum.nodes);
  const remoteCurriculum = curriculumComparable(remote.curriculum);
  const curriculumMatches = remote.exists && stableJson(localCurriculum) === stableJson(remoteCurriculum);
  if (remoteCurriculum.length && !curriculumMatches) conflicts.push('curriculum_differs');

  const remoteQuestions = new Map(remote.questions.map((question) => [
    String(question.source_question_id || question.id),
    question,
  ]));
  const questionState = {
    matching: 0,
    missing: 0,
    differing: 0,
    missing_ids: [],
    differing_ids: [],
    extra_ids: [],
  };
  const localQuestionIds = new Set();
  for (const batch of bundle.questionBatches) {
    for (const question of batch.questions) {
      localQuestionIds.add(question.id);
      const existing = remoteQuestions.get(question.id);
      if (!existing) {
        questionState.missing += 1;
        if (questionState.missing_ids.length < 50) questionState.missing_ids.push(question.id);
      } else if (questionEqual(question, existing)) questionState.matching += 1;
      else {
        questionState.differing += 1;
        if (questionState.differing_ids.length < 50) questionState.differing_ids.push(question.id);
      }
    }
  }
  const extraIds = [...remoteQuestions.keys()].filter((id) => !localQuestionIds.has(id));
  questionState.extra = extraIds.length;
  questionState.extra_ids = extraIds.slice(0, 50);
  if (questionState.differing) conflicts.push('questions_differ');
  if (questionState.extra) conflicts.push('questions_extra_remote');

  const remoteAssetsByHash = new Map(remote.assets.map((asset) => [asset.content_hash, asset]));
  const visualColumns = {
    battle_avatar: 'battle_avatar_asset_id',
    success: 'success_asset_id',
    error: 'error_asset_id',
    attention: 'attention_asset_id',
    cover: 'cover_media_asset_id',
  };
  const assetState = {};
  for (const slot of Object.keys(visualColumns)) {
    const asset = bundle.assets[slot] || null;
    const remoteAsset = asset ? remoteAssetsByHash.get(asset.hash) || null : null;
    assetState[slot] = {
      provided: Boolean(asset),
      exists: asset ? Boolean(remoteAsset) : true,
      selected: asset
        ? Boolean(remoteAsset && remote.visual?.[visualColumns[slot]] === remoteAsset.id)
        : true,
      asset_id: remoteAsset?.id || null,
    };
  }
  const allAssetsExist = Object.values(assetState).every(({ exists }) => exists);
  const visualMatches = Object.values(assetState).every(({ selected }) => selected);
  const packagePublished = remote.packages.some(({ status }) => status === 'published');
  if (packagePublished) warnings.push('existing_published_package_preserved');
  if (remote.exists && bundle.contest.content_status !== remote.contest?.content_status) {
    warnings.push('remote_content_status_evolved');
  }
  if (remote.exists && bundle.contest.sales_status !== remote.contest?.sales_status) {
    warnings.push('remote_sales_status_evolved');
  }
  if (remote.visual?.visual_status === 'published') warnings.push('remote_appearance_published');

  return {
    conflicts,
    warnings,
    contest: { exists: remote.exists, matches: contestMatches, differences: contestDifferences },
    curriculum: {
      local: localCurriculum.length,
      remote: remoteCurriculum.length,
      matches: curriculumMatches,
      local_hash: sha256(stableJson(localCurriculum)),
      remote_hash: sha256(stableJson(remoteCurriculum)),
    },
    questions: {
      bundle: bundle.questionCount,
      remote: remote.questions.length,
      ...questionState,
      matches: questionState.missing === 0 && questionState.differing === 0 && questionState.extra === 0,
    },
    assets: {
      slots: assetState,
      all_exist: allAssetsExist,
      visual_matches: visualMatches,
      visual_status: remote.visual?.visual_status || null,
    },
    packages: {
      total: remote.packages.length,
      published: remote.packages.filter(({ status }) => status === 'published').length,
    },
    snapshots: {
      total: remote.versions.length,
      published: remote.versions.filter(({ status }) => status === 'published').length,
    },
    audits: remote.audit.length,
    exact: contestMatches && curriculumMatches && questionState.missing === 0
      && questionState.differing === 0 && questionState.extra === 0 && allAssetsExist && visualMatches,
  };
}

function plannedOperations(bundle, comparison, options) {
  const operations = [];
  if (!comparison.contest.exists) operations.push('create_contest');
  if (!comparison.curriculum.matches) {
    operations.push(comparison.curriculum.remote ? 'replace_curriculum_draft' : 'import_curriculum_draft');
  }
  for (const [slot, state] of Object.entries(comparison.assets.slots)) {
    if (state.provided && !state.exists) operations.push(`upload_asset:${slot}`);
  }
  if (!comparison.assets.visual_matches
    || (options.publishAppearance && comparison.assets.visual_status !== 'published')) {
    operations.push(options.publishAppearance ? 'publish_contest_visual' : 'save_contest_visual');
  }
  if (comparison.questions.missing) operations.push(`import_draft:${comparison.questions.missing}`);
  operations.push('verify_persistence');
  return operations;
}

export class CourseProvisioner {
  constructor({ client, journalStore, cwd = process.cwd() }) {
    this.client = client;
    this.journalStore = journalStore;
    this.cwd = cwd;
  }

  async inspect(bundle, options = {}) {
    const curriculumValidation = await this.client.contests('validate_curriculum_import', {
      contestId: bundle.contest.id,
      schemaVersion: 1,
      nodes: bundle.curriculum.nodes,
    });
    const remote = await readRemoteState(this.client, bundle);
    const comparison = compareRemoteState(bundle, remote);
    if (comparison.curriculum.remote && !comparison.curriculum.matches && options.allowReplaceDraft) {
      if (comparison.packages.published) comparison.conflicts.push('published_package_blocks_curriculum_replace');
      else comparison.conflicts = comparison.conflicts.filter((item) => item !== 'curriculum_differs');
    }
    return {
      bundle: publicBundleSummary(bundle),
      remote: comparison,
      conflicts: comparison.conflicts,
      warnings: comparison.warnings,
      operations: plannedOperations(bundle, comparison, options),
      authoritative_validation: {
        curriculum: {
          valid: curriculumValidation.valid === true,
          count: curriculumValidation.count,
          counts: curriculumValidation.counts,
        },
      },
    };
  }

  async validate(bundle, options = {}) {
    const protectedBefore = gitStatus(this.cwd, PROTECTED_PATHS);
    const journal = await this.journalStore.open(bundle);
    const report = await this.inspect(bundle, options);
    const protectedAfter = gitStatus(this.cwd, PROTECTED_PATHS);
    if (protectedBefore !== protectedAfter) {
      const error = new Error('Diretórios protegidos foram alterados durante a validação.');
      error.code = 'COURSE_PROVISION_BLOCKED';
      throw error;
    }
    if (report.conflicts.length) {
      await this.journalStore.mark(journal, 'failed', {
        last_error: { code: 'COURSE_PROVISION_CONFLICT', at: new Date().toISOString() },
      });
      return { ...report, result: 'COURSE_PROVISION_INVALID', git_protected: true };
    }
    await this.journalStore.mark(journal, 'validated');
    return { ...report, result: 'COURSE_PROVISION_VALID', git_protected: true };
  }

  async apply(bundle, options = {}) {
    const protectedBefore = gitStatus(this.cwd, PROTECTED_PATHS);
    const journal = await this.journalStore.open(bundle);
    if (!journal.steps.validated) {
      const error = new Error('Execute --mode validate com o mesmo bundle antes do apply.');
      error.code = 'COURSE_PROVISION_BLOCKED';
      throw error;
    }
    let report = await this.inspect(bundle, options);
    const appearancePublishRequired = options.publishAppearance
      && report.remote.assets.visual_status !== 'published';
    if (report.remote.exact && !appearancePublishRequired) {
      await this.journalStore.mark(journal, 'completed');
      return { ...report, result: 'COURSE_PROVISION_ALREADY_APPLIED', git_clean: gitStatus(this.cwd) === '' };
    }
    if (report.conflicts.length) {
      const error = new Error(`Conflito remoto: ${report.conflicts.join(', ')}.`);
      error.code = 'COURSE_PROVISION_CONFLICT';
      throw error;
    }
    try {
      if (!report.remote.contest.exists) {
        await this.client.contests('create_contest', { contest: bundle.contest });
        journal.effects.contest_created = true;
        await this.journalStore.mark(journal, 'contest_created');
      } else {
        journal.steps.contest_created = true;
      }

      const freshRemote = await readRemoteState(this.client, bundle);
      const freshComparison = compareRemoteState(bundle, freshRemote);
      if (!freshComparison.curriculum.matches) {
        if (freshComparison.curriculum.remote) {
          if (!options.allowReplaceDraft || freshComparison.packages.published) {
            const error = new Error('Currículo remoto divergente; substituição automática bloqueada.');
            error.code = 'COURSE_PROVISION_CONFLICT';
            throw error;
          }
          await this.client.contests('replace_curriculum_draft', {
            contestId: bundle.contest.id,
            schemaVersion: 1,
            nodes: bundle.curriculum.nodes,
          });
        } else {
          await this.client.contests('validate_curriculum_import', {
            contestId: bundle.contest.id,
            schemaVersion: 1,
            nodes: bundle.curriculum.nodes,
          });
          await this.client.contests('import_curriculum_draft', {
            contestId: bundle.contest.id,
            schemaVersion: 1,
            nodes: bundle.curriculum.nodes,
          });
        }
      }
      journal.effects.curriculum_nodes = bundle.curriculum.nodes.length;
      await this.journalStore.mark(journal, 'curriculum_imported');

      const mediaState = await this.client.media('list_contest_assets', { contestId: bundle.contest.id });
      const byHash = new Map((mediaState.assets || []).map((asset) => [asset.content_hash, asset]));
      const visual = {};
      for (const [slot, asset] of Object.entries(bundle.assets)) {
        let remoteAsset = byHash.get(asset.hash);
        if (!remoteAsset) {
          const signed = await this.client.media('create_signed_upload', {
            contestId: bundle.contest.id,
            file: { name: asset.name, mimeType: asset.mimeType, size: asset.size },
          });
          try {
            await this.client.uploadSigned(signed, asset);
            const registered = await this.client.media('register_asset', {
              contestId: bundle.contest.id,
              asset: {
                storagePath: signed.path,
                assetType: slot,
                requireTransparency: slot !== 'cover',
              },
            });
            remoteAsset = registered.asset;
          } catch (error) {
            await this.client.media('cancel_pending_upload', {
              contestId: bundle.contest.id,
              storagePath: signed.path,
            }).catch(() => {});
            throw error;
          }
        }
        visual[slot] = remoteAsset.id;
        journal.effects.asset_ids[slot] = remoteAsset.id;
      }
      const visualColumns = {
        battle_avatar: 'battle_avatar_asset_id',
        success: 'success_asset_id',
        error: 'error_asset_id',
        attention: 'attention_asset_id',
        cover: 'cover_media_asset_id',
      };
      for (const [slot, column] of Object.entries(visualColumns)) {
        if (!Object.hasOwn(visual, slot)) visual[slot] = mediaState.visual?.[column] || null;
      }
      const selectionChanged = Object.entries(visualColumns)
        .some(([slot, column]) => (visual[slot] || null) !== (mediaState.visual?.[column] || null));
      const publishRequired = options.publishAppearance && mediaState.visual?.visual_status !== 'published';
      if (selectionChanged || publishRequired) {
        await this.client.media(options.publishAppearance ? 'publish_contest_visual' : 'save_contest_visual', {
          contestId: bundle.contest.id,
          visual,
        });
      }
      await this.journalStore.mark(journal, 'assets_registered');

      const existingQuestions = new Map((await paginatedQuestions(this.client, bundle.contest.id))
        .map((question) => [String(question.source_question_id || question.id), question]));
      for (const batch of bundle.questionBatches) {
        const missing = [];
        for (const question of batch.questions) {
          const existing = existingQuestions.get(question.id);
          if (!existing) missing.push(cleanQuestion(question));
          else if (!questionEqual(question, existing)) {
            const error = new Error(`Questão remota divergente: ${question.id}.`);
            error.code = 'COURSE_PROVISION_CONFLICT';
            throw error;
          }
        }
        if (!missing.length) continue;
        const validation = await this.client.editorial('validate_batch', {
          contestId: bundle.contest.id,
          batchName: batch.batchName,
          questions: missing,
        });
        if (!validation.valid) {
          const error = new Error(`Lote remoto rejeitado: ${batch.filename}.`);
          error.code = 'COURSE_PROVISION_CONFLICT';
          throw error;
        }
        const imported = await this.client.editorial('import_draft', {
          contestId: bundle.contest.id,
          batchName: batch.batchName,
          questions: missing,
        });
        journal.effects.question_batches[batch.filename] = {
          batch_id: imported.batchId,
          imported: missing.length,
        };
        await this.journalStore.save(journal);
      }
      await this.journalStore.mark(journal, 'questions_imported');

      report = await this.inspect(bundle, options);
      if (!report.remote.exact || report.conflicts.length) {
        const error = new Error('Verificação de persistência encontrou divergências.');
        error.code = 'COURSE_PROVISION_PARTIAL';
        throw error;
      }
      await this.journalStore.mark(journal, 'verified');
      await this.journalStore.mark(journal, 'completed');
      const protectedAfter = gitStatus(this.cwd, PROTECTED_PATHS);
      if (protectedBefore !== protectedAfter) {
        const error = new Error('Diretórios protegidos foram alterados durante o apply.');
        error.code = 'COURSE_PROVISION_BLOCKED';
        throw error;
      }
      return {
        ...report,
        result: 'COURSE_PROVISION_READY',
        operation_id: bundle.operationId,
        effects: journal.effects,
        git_clean: gitStatus(this.cwd) === '',
        git_protected: true,
        published_packages_created: 0,
        entitlements_created: 0,
      };
    } catch (error) {
      await this.journalStore.fail(journal, error);
      throw error;
    }
  }

  async verify(bundle, options = {}) {
    const protectedBefore = gitStatus(this.cwd, PROTECTED_PATHS);
    const report = await this.inspect(bundle, options);
    const protectedAfter = gitStatus(this.cwd, PROTECTED_PATHS);
    if (protectedBefore !== protectedAfter) {
      const error = new Error('Diretórios protegidos foram alterados durante o verify.');
      error.code = 'COURSE_PROVISION_BLOCKED';
      throw error;
    }
    return {
      ...report,
      result: report.remote.exact ? 'COURSE_PROVISION_READY'
        : report.conflicts.length ? 'COURSE_PROVISION_CONFLICT' : 'COURSE_PROVISION_PARTIAL',
      git_clean: gitStatus(this.cwd) === '',
      git_protected: true,
      published_packages_created: 0,
      entitlements_created: 0,
    };
  }
}
