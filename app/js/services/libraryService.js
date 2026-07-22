import { CONTEST_CATALOG, getContestById } from '../contest/contestCatalog.js';
import { EntitlementRepository } from '../repositories/entitlementRepository.js';
import { CheckoutService } from './checkoutService.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';

export class LibraryService {
  constructor({
    entitlements = new EntitlementRepository(), checkout = new CheckoutService(), summaries = null,
    now = () => new Date(), allowLocalGrants = isLocalDevelopment,
  } = {}) {
    this.entitlements = entitlements;
    this.checkout = checkout;
    this.summaries = summaries;
    this.now = now;
    this.allowLocalGrants = allowLocalGrants;
  }

  async ensureLegacyEntitlements(user) {
    if (!this.allowLocalGrants()) return;
    const modules = user?.enabledModules || ['pc_al_2026'];
    for (const contestId of modules) {
      if (!getContestById(contestId) || await this.entitlements.find(user.id, contestId)) continue;
      await this.entitlements.save(this.#entitlement(user.id, contestId, 'legacy_account'));
    }
  }

  async getLibrary(user) {
    await this.ensureLegacyEntitlements(user);
    const rights = await this.entitlements.listByUser(user.id);
    const byContest = new Map(rights.filter((right) => right.status === 'active').map((right) => [right.contestId, right]));
    return Promise.all(CONTEST_CATALOG.map(async (contest) => ({
      contest,
      owned: byContest.has(contest.id),
      entitlement: byContest.get(contest.id) || null,
      summary: byContest.has(contest.id) && contest.contentStatus === 'ready' && this.summaries
        ? await this.summaries.get(user.id, contest.id)
        : null,
    })));
  }

  async purchase(user, contestId) {
    const contest = getContestById(contestId);
    if (!contest) throw new Error('Concurso nao encontrado.');
    const existing = await this.entitlements.find(user.id, contestId);
    if (existing?.status === 'active') return existing;
    const purchase = await this.checkout.purchase({ userId: user.id, contest });
    if (!this.allowLocalGrants()) {
      return { ...purchase, entitlementPending: true };
    }
    const entitlement = this.#entitlement(user.id, contestId, 'purchase_demo');
    entitlement.purchaseId = purchase.id;
    await this.entitlements.save(entitlement);
    return entitlement;
  }

  async canAccess(userId, contestId) {
    const entitlement = await this.entitlements.find(userId, contestId);
    return entitlement?.status === 'active';
  }

  #entitlement(userId, contestId, source) {
    return {
      id: `${userId}:${contestId}`,
      userId,
      contestId,
      status: 'active',
      source,
      grantedAt: this.now().toISOString(),
    };
  }
}
