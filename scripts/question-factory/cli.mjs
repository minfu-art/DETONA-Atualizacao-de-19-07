#!/usr/bin/env node
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_POLICY, buildCoverage, coverageSummary, loadBundle, planContracts,
  promoteBatch, readJson, validateQuestionBatch, writeJson,
} from './core.mjs';
import { publishPatch } from './publish.mjs';

function parse(argv) {
  const [command = 'status', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) throw new Error(`argument_invalid:${arg}`);
    const [key, inline] = arg.slice(2).split('=', 2);
    if (inline != null) options[key] = inline;
    else if (rest[index + 1] && !rest[index + 1].startsWith('--')) options[key] = rest[++index];
    else options[key] = true;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (!value || value === true) throw new Error(`missing_${name}`);
  return String(value);
}

async function nextNamedFile(directory, prefix) {
  await mkdir(directory, { recursive: true });
  const files = await readdir(directory);
  const expression = new RegExp(`^${prefix}-(\\d+)\\.json$`);
  const max = files.reduce((value, file) => {
    const match = file.match(expression);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return path.join(directory, `${prefix}-${String(max + 1).padStart(4, '0')}.json`);
}

async function policyFrom(options, repoRoot) {
  if (!options.policy) return DEFAULT_POLICY;
  return readJson(path.resolve(repoRoot, String(options.policy)));
}

function output(value) { console.log(JSON.stringify(value, null, 2)); }

const { command, options } = parse(process.argv.slice(2));
const repoRoot = path.resolve(options.root || process.cwd());
const courseSlug = requireOption(options, 'course');
const bundlePath = path.join(repoRoot, 'course-packages', courseSlug);
const bundle = await loadBundle(bundlePath);
const policy = await policyFrom(options, repoRoot);

if (command === 'status') {
  const rows = buildCoverage(bundle, policy);
  const summary = coverageSummary(rows);
  const priorities = rows.filter(({ deficit }) => deficit > 0)
    .sort((a, b) => a.coverage_pct - b.coverage_pct || b.deficit - a.deficit)
    .slice(0, Number(options.top || 20));
  output({ course: courseSlug, ...summary, priorities });
} else if (command === 'plan') {
  const plan = planContracts(bundle, { limit: Number(options.limit || 100), policy });
  const directory = path.join(bundlePath, 'factory/contracts');
  const target = options.output ? path.resolve(repoRoot, String(options.output)) : await nextNamedFile(directory, 'contracts');
  await writeJson(target, { ...plan, generated_at: new Date().toISOString(), policy });
  output({ course: courseSlug, output: path.relative(repoRoot, target), planned: plan.planned, remaining_deficit_before_plan: plan.remaining_deficit_before_plan });
} else if (command === 'validate') {
  const batchPath = path.resolve(repoRoot, requireOption(options, 'batch'));
  const batch = await readJson(batchPath);
  const report = validateQuestionBatch(bundle, batch);
  if (options.output) await writeJson(path.resolve(repoRoot, String(options.output)), { ...report, batch_name: batch.name, generated_at: new Date().toISOString() });
  output(report);
  if (!report.valid) process.exitCode = 2;
} else if (command === 'qa-template') {
  const batchPath = path.resolve(repoRoot, requireOption(options, 'batch'));
  const batch = await readJson(batchPath);
  const target = options.output
    ? path.resolve(repoRoot, String(options.output))
    : path.join(bundlePath, 'factory/qa', `${path.basename(batchPath, '.json')}.audit.json`);
  await writeJson(target, {
    schema_version: 1,
    batch_name: batch.name,
    status: 'PENDING',
    auditor: 'Codex semantic QA',
    generated_at: new Date().toISOString(),
    questions: (batch.questions || []).map(({ id }) => ({
      id,
      verdict: 'PENDING',
      checks: {
        single_correct_answer: false,
        explanation_consistent: false,
        within_scope: false,
        distractors_plausible: false,
        not_semantic_duplicate: false,
      },
      notes: '',
    })),
  });
  output({ output: path.relative(repoRoot, target), questions: batch.questions?.length || 0 });
} else if (command === 'promote') {
  const batchPath = path.resolve(repoRoot, requireOption(options, 'batch'));
  const auditPath = path.resolve(repoRoot, requireOption(options, 'audit'));
  const result = await promoteBatch({ bundle, batchPath, auditPath });
  output({ promoted: path.relative(repoRoot, result.target), questions: result.batch.questions.length });
} else if (command === 'publish') {
  const batchPath = path.resolve(repoRoot, requireOption(options, 'batch'));
  const auditPath = path.resolve(repoRoot, requireOption(options, 'audit'));
  const promoted = await promoteBatch({ bundle, batchPath, auditPath });
  const refreshedBundle = await loadBundle(bundlePath);
  const published = await publishPatch({ repoRoot, bundle: refreshedBundle, batchPath: promoted.target });
  output({
    promoted: path.relative(repoRoot, promoted.target),
    patch: path.relative(repoRoot, published.patchPath),
    registry: path.relative(repoRoot, published.registryPath),
    expected_questions: published.expectedAfter,
    version: published.version,
    content_hash: published.contentHash,
  });
} else {
  throw new Error(`command_unknown:${command}`);
}
