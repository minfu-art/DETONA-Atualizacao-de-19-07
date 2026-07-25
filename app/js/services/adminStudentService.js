import { adminAccessService } from './adminAccessService.js';

export class AdminStudentService {
  constructor({ access = adminAccessService } = {}) {
    this.access = access;
  }

  listUsers(contestId, options = {}) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    return this.access.listUsers(options);
  }

  grant(contestId, userId) {
    if (!contestId || !userId) throw new Error('Concurso e aluno são obrigatórios.');
    return this.access.grantAccess(userId, contestId);
  }

  revoke(contestId, userId) {
    if (!contestId || !userId) throw new Error('Concurso e aluno são obrigatórios.');
    return this.access.revokeAccess(userId, contestId);
  }

  reactivate(contestId, userId) {
    if (!contestId || !userId) throw new Error('Concurso e aluno são obrigatórios.');
    return this.access.reactivateAccess(userId, contestId);
  }
}

export const adminStudentService = new AdminStudentService();
