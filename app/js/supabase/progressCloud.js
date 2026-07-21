/**
 * Camada de leitura/escrita do progresso no Supabase (tabela progress_records + espelhos tipados).
 */
import { getSupabaseClient } from './client.js';
import { COLLECTION_KEYS, recordKeyFor, SYNC_COLLECTIONS } from './collectionKeys.js';

function requireClient(client) {
  if (!client) throw new Error('SUPABASE_UNAVAILABLE');
  return client;
}

function mirrorRows(userId, contestId, collection, recordKey, payload, updatedAt) {
  const now = updatedAt || new Date().toISOString();
  if (collection === 'player') {
    return {
      table: 'players',
      row: {
        user_id: userId,
        contest_id: contestId,
        player_id: String(payload?.id || recordKey),
        name: String(payload?.name || ''),
        level: Number(payload?.level) || 0,
        mastery_pct: Number(payload?.mastery_pct) || 0,
        xp: Number(payload?.xp) || 0,
        streak_days: Number(payload?.streak_days) || 0,
        edital_completion_pct: Number(payload?.edital_completion_pct) || 0,
        onboarded: Boolean(payload?.onboarded),
        payload,
        updated_at: now,
      },
    };
  }
  if (collection === 'subtopics') {
    return {
      table: 'subtopic_progress',
      row: {
        user_id: userId,
        contest_id: contestId,
        subtopic_id: String(payload?.id || recordKey),
        discipline_id: String(payload?.discipline_id || ''),
        stars: Number(payload?.stars) || 0,
        best_accuracy: Number(payload?.best_accuracy) || 0,
        attempts_count: Number(payload?.attempts_count) || 0,
        last_studied_at: payload?.last_studied_at || null,
        memory_temperature: payload?.memory_temperature || null,
        payload,
        updated_at: now,
      },
    };
  }
  if (collection === 'dailyLogs') {
    return {
      table: 'daily_logs',
      row: {
        user_id: userId,
        contest_id: contestId,
        log_date: String(payload?.date || recordKey),
        planned_amount: Number(payload?.planned_amount) || 0,
        completed_amount: Number(payload?.completed_amount) || 0,
        status: String(payload?.status || 'pendente'),
        xp_earned: Number(payload?.xp_earned) || 0,
        payload,
        updated_at: now,
      },
    };
  }
  if (collection === 'reviewQueue') {
    return {
      table: 'review_queue',
      row: {
        user_id: userId,
        contest_id: contestId,
        question_id: String(payload?.questionId || recordKey),
        subtopic_id: String(payload?.subtopicId || ''),
        discipline_id: String(payload?.disciplineId || ''),
        next_review_at: payload?.nextReviewAt || null,
        status: String(payload?.status || 'pending'),
        priority_score: Number(payload?.priorityScore) || 0,
        payload,
        updated_at: now,
      },
    };
  }
  if (collection === 'wellbeingLogs') {
    return {
      table: 'wellbeing_logs',
      row: {
        user_id: userId,
        contest_id: contestId,
        log_id: String(payload?.id || recordKey),
        habit_id: String(payload?.habit_id || ''),
        log_date: payload?.date || null,
        amount_done: Number(payload?.amount_done) || 0,
        completed: Boolean(payload?.completed),
        payload,
        updated_at: now,
      },
    };
  }
  if (collection === 'routineBlocks') {
    return {
      table: 'routine_blocks',
      row: {
        user_id: userId,
        contest_id: contestId,
        block_id: String(payload?.id || recordKey),
        block_date: payload?.date || null,
        status: String(payload?.status || 'planned'),
        payload,
        updated_at: now,
      },
    };
  }
  return null;
}

export class ProgressCloud {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async upsertRecord(userId, contestId, collection, value, updatedAt = new Date().toISOString()) {
    if (!SYNC_COLLECTIONS.includes(collection)) return null;
    const recordKey = recordKeyFor(collection, value);
    if (!recordKey) return null;

    const client = requireClient(await this.getClient());
    const row = {
      user_id: userId,
      contest_id: contestId,
      collection,
      record_key: recordKey,
      payload: value,
      updated_at: updatedAt,
    };

    const { error } = await client.from('progress_records').upsert(row, {
      onConflict: 'user_id,contest_id,collection,record_key',
    });
    if (error) throw error;

    const mirror = mirrorRows(userId, contestId, collection, recordKey, value, updatedAt);
    if (mirror) {
      const { error: mirrorError } = await client.from(mirror.table).upsert(mirror.row);
      if (mirrorError) {
        // espelho é best-effort; progress_records já é SSOT na nuvem
        console.warn('[supabase] mirror failed', mirror.table, mirrorError.message);
      }
    }
    return row;
  }

  async upsertMany(userId, contestId, collection, values) {
    if (!values?.length) return [];
    const results = [];
    // lotes de 50 para não estourar payload
    const chunkSize = 50;
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (value) => {
          results.push(await this.upsertRecord(userId, contestId, collection, value));
        }),
      );
    }
    return results;
  }

  async deleteRecord(userId, contestId, collection, recordKey) {
    const client = requireClient(await this.getClient());
    const { error } = await client
      .from('progress_records')
      .delete()
      .eq('user_id', userId)
      .eq('contest_id', contestId)
      .eq('collection', collection)
      .eq('record_key', String(recordKey));
    if (error) throw error;

    // limpa espelhos conhecidos
    const mirrorMap = {
      player: { table: 'players', col: null },
      subtopics: { table: 'subtopic_progress', col: 'subtopic_id' },
      dailyLogs: { table: 'daily_logs', col: 'log_date' },
      reviewQueue: { table: 'review_queue', col: 'question_id' },
      wellbeingLogs: { table: 'wellbeing_logs', col: 'log_id' },
      routineBlocks: { table: 'routine_blocks', col: 'block_id' },
    };
    const m = mirrorMap[collection];
    if (m) {
      let q = client.from(m.table).delete().eq('user_id', userId).eq('contest_id', contestId);
      if (m.col) q = q.eq(m.col, String(recordKey));
      await q;
    }
  }

  async clearCollection(userId, contestId, collection) {
    const client = requireClient(await this.getClient());
    const { error } = await client
      .from('progress_records')
      .delete()
      .eq('user_id', userId)
      .eq('contest_id', contestId)
      .eq('collection', collection);
    if (error) throw error;
  }

  /**
   * Baixa todos os registros de um concurso (ou de uma coleção).
   * @returns {Promise<Array<{collection:string,record_key:string,payload:object,updated_at:string}>>}
   */
  async pullAll(userId, contestId, { collection = null, since = null } = {}) {
    const client = requireClient(await this.getClient());
    let query = client
      .from('progress_records')
      .select('collection,record_key,payload,updated_at')
      .eq('user_id', userId)
      .eq('contest_id', contestId);

    if (collection) query = query.eq('collection', collection);
    if (since) query = query.gt('updated_at', since);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /** Agrupa pull em mapa collection → rows[] (payloads). */
  async pullCollections(userId, contestId, options = {}) {
    const rows = await this.pullAll(userId, contestId, options);
    const map = Object.create(null);
    for (const name of SYNC_COLLECTIONS) map[name] = [];
    for (const row of rows) {
      if (!map[row.collection]) map[row.collection] = [];
      if (row.payload && typeof row.payload === 'object') {
        map[row.collection].push({ ...row.payload, __cloud_updated_at: row.updated_at });
      }
    }
    return map;
  }
}

export const progressCloud = new ProgressCloud();

export { COLLECTION_KEYS, SYNC_COLLECTIONS, recordKeyFor };
