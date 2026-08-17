import { getSupabaseClient } from '../supabase/client.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';
import {
  isCourseFactoryStudentPreview,
  courseFactoryPreviewService,
} from './courseFactoryPreviewService.js';

const CACHE_PREFIX = 'detona-contest-content';

function cacheName(userId, contestId, version) {
  return `${CACHE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(contestId)}:${encodeURIComponent(version)}`;
}

export class ContestContentService {
  constructor({
    getClient = getSupabaseClient,
    cacheStorage = globalThis.caches,
    allowLegacyFallback = isLocalDevelopment,
    previewService = courseFactoryPreviewService,
    previewRequested = isCourseFactoryStudentPreview,
  } = {}) {
    this.getClient = getClient;
    this.cacheStorage = cacheStorage;
    this.allowLegacyFallback = allowLegacyFallback;
    this.previewService = previewService;
    this.previewRequested = previewRequested;
  }

  async #cachePackage(userId, contentPackage) {
    if (!this.cacheStorage || !contentPackage?.version) return;
    const prefix = `${CACHE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(contentPackage.contestId)}:`;
    const currentName = cacheName(userId, contentPackage.contestId, contentPackage.version);
    const names = await this.cacheStorage.keys();
    await Promise.all(names.filter((name) => name.startsWith(prefix) && name !== currentName).map((name) => this.cacheStorage.delete(name)));
    const cache = await this.cacheStorage.open(currentName);
    await cache.put(new Request(`https://detona.local/__detona_content__/${encodeURIComponent(contentPackage.contestId)}`), new Response(JSON.stringify(contentPackage), {
      headers: { 'content-type': 'application/json' },
    }));
  }

  async load(userId, contestId, { previewDraftId = null, adminPreviewAccess = false } = {}) {
    if (previewDraftId) {
      return this.previewService.loadRuntimePackage(contestId, { draftId: previewDraftId });
    }
    if (adminPreviewAccess && contestId === 'pc_al_2026') {
      return { legacyStatic: true, contestId, previewOnly: true, adminPreviewAccess: true };
    }
    if (this.previewRequested()) {
      return this.previewService.loadRuntimePackage(contestId);
    }
    const client = await this.getClient();
    if (!client) {
      if (contestId === 'pc_al_2026' && this.allowLegacyFallback()) return { legacyStatic: true, contestId };
      throw new Error('Conteúdo dinâmico indisponível.');
    }
    const { data, error } = await client.functions.invoke('student-content', {
      body: { action: 'get_published_package', contestId },
    });
    if (error || data?.error) {
      if (contestId === 'pc_al_2026' && this.allowLegacyFallback()) return { legacyStatic: true, contestId };
      throw new Error(data?.error || error?.message || 'Pacote publicado indisponível.');
    }
    if (data.legacyStatic) return data;
    if (!data.package || data.package.contestId !== contestId) throw new Error('Pacote de conteúdo inválido.');
    await this.#cachePackage(userId, data.package);
    return data.package;
  }
}

export const contestContentService = new ContestContentService();
