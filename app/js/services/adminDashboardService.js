import { adminAccessService } from './adminAccessService.js';
import { announcementService } from './announcementService.js';
import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getAppEnvironment } from '../config/appEnvironment.js';

async function publishedQuestionCount(fetcher = globalThis.fetch) {
  const files = [
    './js/data/questions_pc_al_lote.json',
    './js/data/questions_pc_al_port.json',
  ];
  const batches = await Promise.all(files.map(async (path) => {
    const response = await fetcher(path);
    if (!response.ok) throw new Error(`Falha ao ler ${path}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.questions || [];
  }));
  return new Set(batches.flat().map(({ id }) => id).filter(Boolean)).size;
}

export class AdminDashboardService {
  constructor({
    access = adminAccessService,
    announcements = announcementService,
    fetcher = globalThis.fetch,
  } = {}) {
    this.access = access;
    this.announcements = announcements;
    this.fetcher = fetcher;
  }

  async getSnapshot(contestId) {
    if (!contestId) throw new Error('contestId administrativo é obrigatório.');
    const [usersResult, messagesResult, questionsResult] = await Promise.allSettled([
      this.access.listUsers({ contestId, page: 1, pageSize: 50 }),
      this.announcements.listAdminAnnouncements(),
      publishedQuestionCount(this.fetcher),
    ]);
    const users = usersResult.status === 'fulfilled' ? usersResult.value?.users || [] : [];
    const totalUsers = usersResult.status === 'fulfilled' ? Number(usersResult.value?.total || users.length) : null;
    const activeAccess = users.filter((user) =>
      user.entitlement?.contestId === contestId && user.entitlement?.status === 'active').length;
    const messages = messagesResult.status === 'fulfilled' ? messagesResult.value : [];
    return {
      totalStudents: totalUsers,
      activeStudents: users.filter((user) => user.entitlement?.status === 'active').length,
      activeAccess,
      contests: CONTEST_CATALOG.length,
      publishedQuestions: questionsResult.status === 'fulfilled' ? questionsResult.value : null,
      reviewQuestions: null,
      publishedMessages: messages.filter((item) => item.is_published && !item.archived_at).length,
      recentActions: 0,
      edgeStatus: usersResult.status === 'fulfilled' ? 'admin-access operacional' : 'verificação indisponível',
      environment: getAppEnvironment().toUpperCase(),
      warnings: [usersResult, messagesResult, questionsResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Métrica indisponível'),
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
