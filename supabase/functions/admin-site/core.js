import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeId,
  safePagination,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const SITE_ACTIONS = Object.freeze(['list_pages', 'save_page', 'save_block', 'reorder_blocks', 'publish_page', 'archive_page']);
export function assertSiteAction(action) {
  if (!SITE_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}
export function containsUnsafeMarkup(value) {
  return /<(?:script|iframe|object|embed|style)\b/i.test(JSON.stringify(value || {}));
}

export function validateSiteRequest(input) {
  const body = assertPlainObject(input);
  const action = assertSiteAction(body.action);
  if (action === 'list_pages') {
    assertExactKeys(body, ['action', 'contestId', 'page', 'pageSize'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id'), ...safePagination(body) };
  }
  if (action === 'save_block') {
    assertExactKeys(body, ['action', 'contestId', 'block'], ['contestId', 'block']);
    const block = assertExactKeys(body.block, ['id', 'versionId', 'type', 'content', 'orderIndex', 'isEnabled'], ['versionId', 'type', 'content']);
    if (containsUnsafeMarkup(block.content) || JSON.stringify(block.content).length > 20_000) throw new Error('block_content_invalid');
    const orderIndex = Number(block.orderIndex ?? 0);
    if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 1000) throw new Error('order_index_invalid');
    if (block.isEnabled != null && typeof block.isEnabled !== 'boolean') throw new Error('is_enabled_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      block: {
        id: block.id ? safeUuid(block.id) : null,
        versionId: safeUuid(block.versionId, 'version_id'),
        type: safeEnum(block.type, ['hero', 'benefits', 'method', 'features', 'demo', 'testimonials', 'price', 'faq', 'cta', 'footer'], 'type'),
        content: block.content,
        orderIndex,
        isEnabled: block.isEnabled !== false,
      },
    };
  }
  if (action === 'save_page') {
    assertExactKeys(body, ['action', 'contestId', 'page'], ['contestId', 'page']);
    const page = assertExactKeys(body.page, [
      'id', 'slug', 'title', 'seoTitle', 'seoDescription', 'status',
    ], ['slug', 'title', 'seoTitle', 'seoDescription']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      page: {
        id: page.id ? safeUuid(page.id) : null,
        slug: safeId(page.slug, 'slug'),
        title: safeText(page.title, 'title', 160),
        seoTitle: safeText(page.seoTitle, 'seo_title', 160),
        seoDescription: safeText(page.seoDescription, 'seo_description', 320),
        status: safeEnum(page.status || 'draft', ['draft', 'review', 'published', 'archived'], 'status'),
      },
    };
  }
  if (action === 'reorder_blocks') {
    assertExactKeys(body, ['action', 'contestId', 'orderedIds'], ['contestId', 'orderedIds']);
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length > 500) throw new Error('ordered_ids_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      orderedIds: body.orderedIds.map((id) => safeUuid(id)),
    };
  }
  assertExactKeys(body, ['action', 'contestId', 'pageId'], ['contestId', 'pageId']);
  return {
    action,
    contestId: safeId(body.contestId, 'contest_id'),
    pageId: safeUuid(body.pageId, 'page_id'),
  };
}
