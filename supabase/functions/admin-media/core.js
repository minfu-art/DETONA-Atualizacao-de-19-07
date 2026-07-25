import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeId,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const CONTEST_VISUAL_TYPES = Object.freeze(['battle_avatar', 'success', 'error', 'attention', 'cover']);
export const MEDIA_ACTIONS = Object.freeze([
  'list_collections', 'list_contest_assets', 'create_signed_upload', 'register_asset',
  'cancel_pending_upload', 'cleanup_expired_uploads', 'remove_draft_asset',
  'save_contest_visual', 'publish_contest_visual',
  'create_collection', 'save_stage', 'publish_collection',
]);

export function assertMediaAction(action) {
  if (!MEDIA_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export function safeStoragePath(path) {
  const value = String(path || '');
  if (!/^[a-zA-Z0-9/_-]+\.(png|webp)$/.test(value) || value.includes('..')) throw new Error('invalid_storage_path');
  return value;
}

function bytesToAscii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function containsChunk(bytes, chunk) {
  const target = [...chunk].map((letter) => letter.charCodeAt(0));
  for (let index = 0; index <= bytes.length - target.length; index += 1) {
    if (target.every((value, offset) => bytes[index + offset] === value)) return true;
  }
  return false;
}

export function inspectImageBytes(input, mimeType) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length > 8_388_608) throw new Error('size_invalid');
  if (mimeType === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value) || bytesToAscii(bytes, 12, 4) !== 'IHDR') throw new Error('image_signature_invalid');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const colorType = bytes[25];
    const hasTransparency = [4, 6].includes(colorType) || containsChunk(bytes, 'tRNS');
    return { width, height, hasTransparency };
  }
  if (mimeType === 'image/webp') {
    if (bytesToAscii(bytes, 0, 4) !== 'RIFF' || bytesToAscii(bytes, 8, 4) !== 'WEBP') throw new Error('image_signature_invalid');
    const chunk = bytesToAscii(bytes, 12, 4);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height, hasTransparency: Boolean(bytes[20] & 0x10) };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, hasTransparency: true };
    }
    throw new Error('webp_variant_not_supported');
  }
  throw new Error('mime_invalid');
}

function visualConfig(input) {
  const value = assertExactKeys(input, CONTEST_VISUAL_TYPES);
  return Object.fromEntries(CONTEST_VISUAL_TYPES.map((key) => [key, value[key] ? safeUuid(value[key], key) : null]));
}

export function validateMediaRequest(input) {
  const body = assertPlainObject(input);
  const action = assertMediaAction(body.action);
  if (action === 'list_collections' || action === 'list_contest_assets') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'create_signed_upload') {
    assertExactKeys(body, ['action', 'contestId', 'file'], ['contestId', 'file']);
    const file = assertExactKeys(body.file, ['name', 'mimeType', 'size'], ['name', 'mimeType', 'size']);
    const name = safeText(file.name, 'name', 180);
    const mimeType = safeEnum(file.mimeType, ['image/png', 'image/webp'], 'mime');
    const extension = name.split('.').pop()?.toLowerCase();
    if ((mimeType === 'image/png' && extension !== 'png') || (mimeType === 'image/webp' && extension !== 'webp')) throw new Error('extension_mismatch');
    const size = Number(file.size);
    if (!Number.isInteger(size) || size < 1 || size > 8_388_608) throw new Error('size_invalid');
    return { action, contestId: safeId(body.contestId, 'contest_id'), file: { name, mimeType, size, extension } };
  }
  if (action === 'register_asset') {
    assertExactKeys(body, ['action', 'contestId', 'asset'], ['contestId', 'asset']);
    const asset = assertExactKeys(body.asset, ['storagePath', 'assetType', 'requireTransparency'], ['storagePath', 'assetType']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      asset: {
        storagePath: safeStoragePath(asset.storagePath),
        assetType: safeEnum(asset.assetType, CONTEST_VISUAL_TYPES, 'asset_type'),
        requireTransparency: asset.requireTransparency !== false,
      },
    };
  }
  if (action === 'cancel_pending_upload') {
    assertExactKeys(body, ['action', 'contestId', 'storagePath'], ['contestId', 'storagePath']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      storagePath: safeStoragePath(body.storagePath),
    };
  }
  if (action === 'cleanup_expired_uploads') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'remove_draft_asset') {
    assertExactKeys(body, ['action', 'contestId', 'assetId'], ['contestId', 'assetId']);
    return { action, contestId: safeId(body.contestId, 'contest_id'), assetId: safeUuid(body.assetId, 'asset_id') };
  }
  if (action === 'save_contest_visual' || action === 'publish_contest_visual') {
    assertExactKeys(body, ['action', 'contestId', 'visual'], ['contestId', 'visual']);
    return { action, contestId: safeId(body.contestId, 'contest_id'), visual: visualConfig(body.visual) };
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
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      collectionId: safeUuid(body.collectionId, 'collection_id'),
      stage: assertPlainObject(body.stage),
    };
  }
  assertExactKeys(body, ['action', 'contestId', 'collectionId'], ['contestId', 'collectionId']);
  return { action, contestId: safeId(body.contestId, 'contest_id'), collectionId: safeUuid(body.collectionId, 'collection_id') };
}
