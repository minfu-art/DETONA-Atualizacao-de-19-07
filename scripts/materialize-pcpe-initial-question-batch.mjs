#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'course-packages/pc-pe-2026-agente');
const sourcePath = path.join(packageRoot, 'factory/source/pcpe-authorial-seed.json');
const contractsPath = path.join(packageRoot, 'factory/contracts/contracts-0001.json');
const batchPath = path.join(packageRoot, 'factory/staging/pcpe-inicial-autoral-001.json');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [source, plan] = await Promise.all([readJson(sourcePath), readJson(contractsPath)]);
const sourceByKnowledge = new Map(source.questions.map((item) => [item.microknowledge_id, item]));
const usedSeedIds = new Set();

const questions = plan.contracts.map((contract) => {
  const seed = sourceByKnowledge.get(contract.microknowledge_id);
  if (!seed) throw new Error(`seed_missing:${contract.microknowledge_id}`);
  if (usedSeedIds.has(seed.seed_id)) throw new Error(`seed_reused:${seed.seed_id}`);
  usedSeedIds.add(seed.seed_id);
  return {
    id: contract.question_id,
    subtopic_id: contract.subtopic_id,
    microknowledge_ids: [contract.microknowledge_id],
    statement: seed.statement,
    options: [],
    correct_answer: seed.correct_answer,
    explanation: seed.explanation,
    difficulty: contract.difficulty,
    format: contract.format,
    source: null,
    is_trick: false,
    traces: [seed.trace],
  };
});

if (questions.length !== 100 || usedSeedIds.size !== 100) throw new Error('materialized_count_invalid');
await mkdir(path.dirname(batchPath), { recursive: true });
await writeFile(batchPath, `${JSON.stringify({ name: 'pcpe-inicial-autoral-001', questions }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ batchPath, questions: questions.length, contracts: plan.contracts.length }, null, 2));
