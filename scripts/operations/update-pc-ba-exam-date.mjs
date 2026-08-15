import { createHash } from 'node:crypto';

const projectRef = 'folnsdtmaiksjqqsohjx';
const contestId = 'pc_ba_2026';
const version = 'pcba-investigador-beta-2026.08.15.2';
const examDate = '2026-12-06';
const serviceKey = process.env.DETONA_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) throw new Error('DETONA_SUPABASE_SERVICE_ROLE_KEY ausente.');

const baseUrl = `https://${projectRef}.supabase.co/rest/v1`;
const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
  prefer: 'return=representation',
};

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${result?.message || result?.error || response.status}`);
  }
  return result;
}

const one = (value, label) => {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record) throw new Error(`${label}_not_found`);
  return record;
};

const published = one(await request(
  `/contest_content_packages?contest_id=eq.${contestId}&status=eq.published&select=*&limit=1`,
), 'published_package');
const actorId = published.created_by;
const profile = one(await request(`/profiles?id=eq.${actorId}&select=id,role&limit=1`), 'operator_profile');
const priorRole = profile.role;
let publishedPackage;

try {
  await request(`/profiles?id=eq.${actorId}`, { method: 'PATCH', body: { role: 'developer' } });
  const contest = one(await request(`/admin_contests?id=eq.${contestId}`, {
    method: 'PATCH',
    body: { exam_date: examDate },
  }), 'contest');
  if (contest.exam_date !== examDate) throw new Error('contest_exam_date_update_failed');

  const questionVersion = one(await request(
    `/question_publication_versions?id=eq.${published.questions_version_id}&select=id,content_hash&limit=1`,
  ), 'question_version');
  const metadata = { ...published.metadata, exam_date: examDate };
  const contentHash = createHash('sha256').update(JSON.stringify({
    metadata,
    curriculum_snapshot: published.curriculum_snapshot,
    questions_version_id: published.questions_version_id,
    questions_hash: questionVersion.content_hash,
    visual_config: published.visual_config,
  })).digest('hex');

  const existing = (await request(
    `/contest_content_packages?contest_id=eq.${contestId}&version=eq.${version}&select=*&limit=1`,
  ))[0];
  const generated = existing || one(await request('/contest_content_packages', {
    method: 'POST',
    body: {
      contest_id: contestId,
      version,
      metadata,
      curriculum_snapshot: published.curriculum_snapshot,
      questions_version_id: published.questions_version_id,
      visual_config: published.visual_config,
      content_hash: contentHash,
      status: 'generated',
      created_by: actorId,
    },
  }), 'generated_package');

  if (generated.status === 'generated') {
    publishedPackage = await request('/rpc/admin_publish_content_package', {
      method: 'POST',
      body: {
        target_contest_id: contestId,
        target_package_id: generated.id,
        confirmation: 'PCBA-INV',
        actor_id: actorId,
      },
    });
  } else if (generated.status === 'published') {
    publishedPackage = generated;
  } else {
    throw new Error(`content_package_invalid_status:${generated.status}`);
  }

  await request('/admin_audit_log', {
    method: 'POST',
    body: {
      actor_user_id: actorId,
      contest_id: contestId,
      module: 'contests',
      action: 'update_exam_date_from_official_notice',
      target_type: 'contest',
      target_id: contestId,
      metadata: { exam_date: examDate, source: 'edital_saeb_02_2026' },
    },
  });
} finally {
  await request(`/profiles?id=eq.${actorId}`, { method: 'PATCH', body: { role: priorRole } });
}

const finalContest = one(await request(
  `/admin_contests?id=eq.${contestId}&select=id,code,exam_date,content_status,sales_status&limit=1`,
), 'final_contest');
const finalPackage = one(await request(
  `/contest_content_packages?contest_id=eq.${contestId}&status=eq.published&select=version,status,metadata&limit=1`,
), 'final_package');

process.stdout.write(`${JSON.stringify({
  contest_id: finalContest.id,
  code: finalContest.code,
  exam_date: finalContest.exam_date,
  content_status: finalContest.content_status,
  sales_status: finalContest.sales_status,
  package_version: finalPackage.version,
  package_status: finalPackage.status,
  package_exam_date: finalPackage.metadata.exam_date,
  operator_role_restored: priorRole,
})}\n`);
