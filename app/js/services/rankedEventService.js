import { getSupabaseClient } from '../supabase/client.js';

function messageFrom(error, data, fallback) {
  return data?.error?.message || error?.message || fallback;
}

export class RankedEventService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Eventos ranqueados exigem conexão com o staging.');
    const { data, error } = await client.functions.invoke('ranked-events', {
      body: { action, ...payload },
    });
    if (error || data?.error) {
      const failure = new Error(messageFrom(error, data, 'Não foi possível concluir a operação do evento.'));
      failure.code = data?.error?.code || error?.name || 'OPERATION_FAILED';
      throw failure;
    }
    return data || {};
  }

  listEvents(contestId) {
    return this.invoke('list_events', { contestId });
  }

  getHomeEvent(contestId) {
    return this.invoke('get_home_event', { contestId });
  }

  register(eventId) {
    return this.invoke('register', { eventId });
  }

  start(eventId) {
    return this.invoke('start', { eventId });
  }

  submit(eventId, answers) {
    return this.invoke('submit', { eventId, answers });
  }

  getRanking(eventId) {
    return this.invoke('get_ranking', { eventId });
  }

  getResult(eventId) {
    return this.invoke('get_result', { eventId });
  }

  listAdminEvents(contestId) {
    return this.invoke('list_admin_events', { contestId });
  }

  saveDraft(event) {
    return this.invoke('save_draft', { event });
  }

  publishEvent(eventId) {
    return this.invoke('publish_event', { eventId });
  }

  cancelEvent(eventId) {
    return this.invoke('cancel_event', { eventId });
  }

  listParticipants(eventId) {
    return this.invoke('list_participants', { eventId });
  }
}

export const rankedEventService = new RankedEventService();
