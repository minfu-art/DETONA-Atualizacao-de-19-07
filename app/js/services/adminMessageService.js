import { announcementService, validateAnnouncementInput } from './announcementService.js';

export class AdminMessageService {
  constructor({ announcements = announcementService } = {}) {
    this.announcements = announcements;
  }

  list(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    return this.announcements.listAdminAnnouncements();
  }

  create(contestId, input) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    const payload = validateAnnouncementInput({
      ...input,
      contest_id: input.audience_type === 'contest' ? contestId : null,
    });
    return this.announcements.createAnnouncement(payload);
  }

  publish(contestId, id) {
    if (!contestId || !id) throw new Error('Concurso e mensagem são obrigatórios.');
    return this.announcements.publishAnnouncement(id);
  }

  archive(contestId, id) {
    if (!contestId || !id) throw new Error('Concurso e mensagem são obrigatórios.');
    return this.announcements.archiveAnnouncement(id);
  }
}

export const adminMessageService = new AdminMessageService();
