import { EntitlementRepository } from '../repositories/entitlementRepository.js';
import { CheckoutService } from './checkoutService.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';
import { contestCatalogService } from './contestCatalogService.js';
import { LibrarySnapshotRepository } from '../repositories/librarySnapshotRepository.js';
import { checkoutActionFor } from './studentEntryModel.js';
import { homologationCourseService } from './homologationCourseService.js';

export class LibraryService {
  constructor({
    entitlements = new EntitlementRepository(), checkout = new CheckoutService(), summaries = null,
    now = () => new Date(), allowLocalGrants = isLocalDevelopment, catalog = contestCatalogService,
    snapshots = new LibrarySnapshotRepository(),
    homologations = homologationCourseService,
  } = {}) {
    this.entitlements = entitlements;
    this.checkout = checkout;
    this.summaries = summaries;
    this.now = now;
    this.allowLocalGrants = allowLocalGrants;
    this.catalog = catalog;
    this.snapshots = snapshots;
    this.homologations = homologations;
  }

  async ensureLegacyEntitlements(user) {
    if (!this.allowLocalGrants()) return;
    const modules = user?.enabledModules || ['pc_al_2026'];
    for (const contestId of modules) {
      if (!(await this.catalog.getById(contestId)) || await this.entitlements.find(user.id, contestId)) continue;
      await this.entitlements.save(this.#entitlement(user.id, contestId, 'legacy_account'));
    }
  }

  async getLibraryState(user, { refresh = false } = {}) {
    try {
      await this.ensureLegacyEntitlements(user);
      const [rights, contests] = await Promise.all([
        this.entitlements.listByUser(user.id),
        this.catalog.list({ refresh }),
      ]);
      const byContest = new Map(rights.filter((right) => right.status === 'active').map((right) => [right.contestId, right]));
      const capability = this.getCheckoutCapability();
      const baseItems = await Promise.all(contests.map(async (contest) => {
        const owned = byContest.has(contest.id);
        let summary = null;
        if (owned && contest.contentStatus === 'ready' && this.summaries) {
          try { summary = await this.summaries.get(user.id, contest.id); }
          catch { summary = null; }
        }
        const item = {
          contest,
          owned,
          entitlement: byContest.get(contest.id) || null,
          summary,
        };
        return { ...item, checkoutAction: checkoutActionFor(item, capability) };
      }));
      this.snapshots?.save?.(user.id, baseItems);
      let items = baseItems;
      if (this.homologations?.canList?.(user)) {
        const adminItems = baseItems.map((item) => {
          if (item.owned || item.contest.contentStatus !== 'ready') return item;
          const adminItem = {
            ...item,
            contest: { ...item.contest, adminPreviewAccess: true },
            owned: true,
            entitlement: null,
            adminPreview: true,
          };
          return { ...adminItem, checkoutAction: checkoutActionFor(adminItem, capability) };
        });
        items = adminItems;
        try {
          const previewContests = await this.homologations.listForAdmin(user);
          const byContestId = new Map(adminItems.map((item) => [item.contest.id, item]));
          for (const contest of previewContests) {
            const existing = byContestId.get(contest.id);
            if (existing?.owned && !existing.adminPreview) continue;
            const item = {
              contest,
              owned: true,
              entitlement: null,
              summary: null,
              homologation: true,
            };
            byContestId.set(contest.id, { ...item, checkoutAction: checkoutActionFor(item, capability) });
          }
          items = [...byContestId.values()];
        } catch {
          items = adminItems;
        }
      }
      return { items, offline: false, stale: false, checkout: capability };
    } catch (error) {
      const snapshot = this.snapshots?.read?.(user.id);
      if (!snapshot?.items?.length) throw error;
      const capability = this.getCheckoutCapability();
      const items = snapshot.items.map((cached) => {
        const item = {
          ...cached,
          entitlement: null,
          summary: null,
          accessVerificationRequired: true,
        };
        return { ...item, checkoutAction: checkoutActionFor(item, capability) };
      });
      return { items, offline: true, stale: true, checkout: capability, error };
    }
  }

  async getLibrary(user, options) {
    return (await this.getLibraryState(user, options)).items;
  }

  async purchase(user, contestId) {
    const contest = await this.catalog.getById(contestId);
    if (!contest) throw new Error('Concurso nao encontrado.');
    const existing = await this.entitlements.find(user.id, contestId);
    if (existing?.status === 'active') return existing;
    const localGrantAllowed = this.allowLocalGrants();
    if (!localGrantAllowed) {
      if (contest.contentStatus !== 'ready' || contest.salesStatus !== 'available') {
        throw new Error('Este curso ainda não está disponível para aquisição.');
      }
    }
    const purchase = await this.checkout.purchase({ userId: user.id, contest });
    if (!localGrantAllowed) {
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

  async setInterest(contestId, interested, { offline = false } = {}) {
    if (offline || globalThis.navigator?.onLine === false) {
      const error = new Error('Conecte-se para registrar seu interesse.');
      error.code = 'OFFLINE_INTEREST_UNAVAILABLE';
      throw error;
    }
    return this.catalog.setInterest(contestId, interested === true);
  }

  getContest(contestId, options) {
    return this.catalog.getById(contestId, options);
  }

  getCheckoutCapability() {
    return this.checkout?.capability?.() || {
      configured: false,
      provider: null,
      reason: 'gateway_not_configured',
    };
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
