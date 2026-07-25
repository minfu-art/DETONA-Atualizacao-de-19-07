import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeId,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const MEDIA_ACTIONS = Object.freeze(['list_collections', 'create_collection', 'save_stage', 'register_asset', 'publish_collection']);
export function assertMediaAction(action) {
  if (!MEDIA_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}
export function safeStoragePath(path) {
  const value = String(path || '');
  if (!/^[a-zA-Z0-9/_-]+\.(png|webp)$/.test(value) || value.includes('..')) throw new Error('invalid_storage_path');
  return value;
}

export function validateMediaRequest(input) {
  const body = assertPlainObject(input);
  const action = assertMediaAction(body.action);
  if (action === 'list_collections') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'create_collection') {
    assertExactKeys(body, ['action', 'contestId', 'collection'], ['contestId', 'collection']);
    const collection = assertExactKeys(body.collection, ['name', 'gender', 'status'], ['name', 'gender']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      collection: {
        name: safeText(collection.name, 'name', 160),
        gender: safeEnum(collection.gender, ['female', 'male', 'neutral'], 'gender'),
        status: safeEnum(collection.status || 'draft', ['draft', 'active', 'inactive', 'published', 'archived'], 'status'),
      },
    };
  }
  if (action === 'save_stage') {
    assertExactKeys(body, ['action', 'contestId', 'collectionId', 'stage'], ['contestId', 'collectionId', 'stage']);
    const stage = assertExactKeys(body.stage, [
      'id', 'stageNumber', 'minimumGlobalMastery', 'isInitial', 'orderIndex', 'status',
    ], ['stageNumber', 'minimumGlobalMastery']);
    const stageNumber = Number(stage.stageNumber);
    const mastery = Number(stage.minimumGlobalMastery);
    const orderIndex = Number(stage.orderIndex ?? 0);
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 9) throw new Error('stage_number_invalid');
    if (!Number.isFinite(mastery) || mastery < 0 || mastery > 100) throw new Error('mastery_invalid');
    if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 1000) throw new Error('order_index_invalid');
    if (stage.isInitial != null && typeof stage.isInitial !== 'boolean') throw new Error('is_initial_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      collectionId: safeUuid(body.collectionId, 'collection_id'),
      stage: {
        id: stage.id ? safeUuid(stage.id) : null,
        stageNumber,
        minimumGlobalMastery: mastery,
        isInitial: stage.isInitial === true,
        orderIndex,
        status: safeEnum(stage.status || 'draft', ['draft', 'active', 'inactive', 'published', 'archived'], 'status'),
      },
    };
  }
  if (action === 'register_asset') {
    assertExactKeys(body, ['action', 'contestId', 'asset'], ['contestId', 'asset']);
    const asset = assertExactKeys(body.asset, [
      'stageId', 'storagePath', 'name', 'mimeType', 'size', 'width', 'height', 'hasTransparency', 'assetType',
    ], ['stageId', 'storagePath', 'name', 'mimeType', 'size', 'width', 'height', 'hasTransparency', 'assetType']);
    const size = Number(asset.size); const width = Number(asset.width); const height = Number(asset.height);
    if (!Number.isInteger(size) || size < 1 || size > 8_388_608) throw new Error('size_invalid');
    if (!Number.isInteger(width) || width < 1 || width > 8192 || !Number.isInteger(height) || height < 1 || height > 8192) throw new Error('dimensions_invalid');
    if (typeof asset.hasTransparency !== 'boolean') throw new Error('transparency_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      asset: {
        stageId: safeUuid(asset.stageId, 'stage_id'),
        storagePath: safeStoragePath(asset.storagePath),
        name: safeText(asset.name, 'name', 180),
        mimeType: safeEnum(asset.mimeType, ['image/png', 'image/webp'], 'mime'),
        size, width, height, hasTransparency: asset.hasTransparency,
        assetType: safeEnum(asset.assetType, ['portrait', 'full_body', 'chibi_head', 'success', 'error', 'attention', 'victory', 'defeat', 'weapon', 'equipment'], 'asset_type'),
      },
    };
  }
  assertExactKeys(body, ['action', 'contestId', 'collectionId'], ['contestId', 'collectionId']);
  return {
    action,
    contestId: safeId(body.contestId, 'contest_id'),
    collectionId: safeUuid(body.collectionId, 'collection_id'),
  };
}
