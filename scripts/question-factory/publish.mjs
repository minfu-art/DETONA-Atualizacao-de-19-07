import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nextVersion(current, now = new Date()) {
  const date = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}`;
  const match = String(current || '').match(/^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/);
  return match?.[1] === date ? `${date}.${Number(match[2]) + 1}` : `${date}.1`;
}

async function nextPatchFile(publishedDir, slug) {
  let files = [];
  try { files = await readdir(publishedDir); } catch { /* created below */ }
  const expression = new RegExp(`^${escapeRegex(slug)}-patch-(\\d+)\\.json$`);
  const max = files.reduce((value, file) => {
    const match = file.match(expression);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `${slug}-patch-${String(max + 1).padStart(3, '0')}.json`;
}

function registryEntry(source, contestId) {
  const startToken = `${contestId}: Object.freeze({`;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`registry_entry_missing:${contestId}`);
  const end = source.indexOf('\n  }),', start);
  if (end < 0) throw new Error(`registry_entry_unclosed:${contestId}`);
  return { start, end: end + '\n  }),'.length, body: source.slice(start, end + '\n  }),'.length) };
}

function appendPatchUrl(body, relativeUrl) {
  if (body.includes(relativeUrl)) throw new Error('patch_already_registered');
  const block = body.match(/patchUrls:\s*Object\.freeze\(\[([\s\S]*?)\n\s*\]\),/);
  if (!block) throw new Error('registry_patch_urls_missing');
  const insertion = `${block[1]}\n      \`${relativeUrl}?v=\${DATA_VERSION}\`,`;
  return body.replace(block[0], `patchUrls: Object.freeze([${insertion}\n    ]),`);
}

export async function publishPatch({ repoRoot, bundle, batchPath, now = new Date() }) {
  const slug = bundle.course.slug;
  const contestId = bundle.course.contest_id;
  if (!slug || !contestId) throw new Error('course_identity_missing');
  const publishedDir = path.join(repoRoot, 'app/data/course-factory/published');
  const runtimePath = path.join(repoRoot, 'app/data/course-factory', `${slug}-runtime.json`);
  const registryPath = path.join(repoRoot, 'app/js/services/publishedCoursePackageService.js');
  const [batchText, runtime, registrySource] = await Promise.all([
    readFile(batchPath, 'utf8'),
    readFile(runtimePath, 'utf8').then(JSON.parse),
    readFile(registryPath, 'utf8'),
  ]);
  const batch = JSON.parse(batchText);
  if (!Array.isArray(batch.questions) || !batch.questions.length) throw new Error('publish_batch_empty');

  const entry = registryEntry(registrySource, contestId);
  const expectedMatch = entry.body.match(/expectedQuestionCount:\s*(\d+)/);
  if (!expectedMatch) throw new Error('registry_expected_count_missing');
  const expectedBefore = Number(expectedMatch[1]);
  const existingIds = new Set((runtime.questions || []).map((question) => question.id));
  let existingPatchFiles = [];
  try { existingPatchFiles = (await readdir(publishedDir)).filter((name) => name.startsWith(`${slug}-patch-`) && name.endsWith('.json')).sort(); } catch { /* none */ }
  let composedBefore = (runtime.questions || []).length;
  for (const file of existingPatchFiles) {
    const patch = JSON.parse(await readFile(path.join(publishedDir, file), 'utf8'));
    for (const question of patch.questions || []) {
      if (existingIds.has(question.id)) throw new Error(`existing_patch_duplicate:${question.id}`);
      existingIds.add(question.id);
      composedBefore += 1;
    }
  }
  if (composedBefore !== expectedBefore) throw new Error(`registry_count_mismatch:${expectedBefore}:${composedBefore}`);
  for (const question of batch.questions) if (existingIds.has(question.id)) throw new Error(`publish_duplicate_question:${question.id}`);

  await mkdir(publishedDir, { recursive: true });
  const patchFilename = await nextPatchFile(publishedDir, slug);
  const patchPath = path.join(publishedDir, patchFilename);
  await copyFile(batchPath, patchPath);
  const expectedAfter = expectedBefore + batch.questions.length;

  const currentVersionMatch = registrySource.match(/const DATA_VERSION = '([^']+)'/);
  if (!currentVersionMatch) throw new Error('registry_data_version_missing');
  const version = nextVersion(currentVersionMatch[1], now);
  const relativeUrl = `data/course-factory/published/${patchFilename}`;
  let newBody = appendPatchUrl(entry.body, relativeUrl);
  const contentHash = sha256(JSON.stringify({
    contestId,
    base: runtime.contentHash || sha256(JSON.stringify(runtime)),
    patches: [...existingPatchFiles, patchFilename],
    expectedQuestionCount: expectedAfter,
  }));
  newBody = newBody.replace(/contentHash:\s*'[^']*'/, `contentHash: '${contentHash}'`);
  newBody = newBody.replace(/expectedQuestionCount:\s*\d+/, `expectedQuestionCount: ${expectedAfter}`);

  let nextRegistry = `${registrySource.slice(0, entry.start)}${newBody}${registrySource.slice(entry.end)}`;
  nextRegistry = nextRegistry.replace(/const DATA_VERSION = '[^']+'/, `const DATA_VERSION = '${version}'`);
  await writeFile(registryPath, nextRegistry, 'utf8');
  return { patchPath, patchFilename, relativeUrl, expectedBefore, expectedAfter, version, contentHash, registryPath };
}
