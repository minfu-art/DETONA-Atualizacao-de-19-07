import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

export async function inspectPngAlpha(file) {
  const source = await readFile(file);
  if (!source.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`PNG invÃ¡lido: ${file}`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressed = [];
  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.toString('ascii', offset + 4, offset + 8);
    const data = source.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`PNG deve ser RGBA 8-bit: ${file} (depth=${bitDepth}, type=${colorType})`);
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== height * (stride + 1)) throw new Error(`Dados PNG inesperados: ${file}`);

  let previous = Buffer.alloc(stride);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let nonTransparentPixels = 0;
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const scanline = Buffer.allocUnsafe(stride);
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[cursor + x];
      const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 0) scanline[x] = encoded;
      else if (filter === 1) scanline[x] = (encoded + left) & 255;
      else if (filter === 2) scanline[x] = (encoded + above) & 255;
      else if (filter === 3) scanline[x] = (encoded + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) scanline[x] = (encoded + paeth(left, above, upperLeft)) & 255;
      else throw new Error(`Filtro PNG desconhecido (${filter}): ${file}`);
    }
    cursor += stride;
    for (let x = 0; x < width; x += 1) {
      if (scanline[(x * bytesPerPixel) + 3] === 0) continue;
      nonTransparentPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    previous = scanline;
  }

  if (!nonTransparentPixels) throw new Error(`PNG totalmente transparente: ${file}`);
  const bbox = Object.freeze({ left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 });
  const margins = Object.freeze({
    left: bbox.left,
    top: bbox.top,
    right: width - bbox.right,
    bottom: height - bbox.bottom,
  });
  return Object.freeze({
    file,
    width,
    height,
    bitDepth,
    colorType,
    hasAlpha: true,
    nonTransparentPixels,
    bbox,
    margins,
    visualWidthRatio: (bbox.right - bbox.left) / width,
    visualHeightRatio: (bbox.bottom - bbox.top) / height,
    touchesEdge: Object.values(margins).some((margin) => margin === 0),
  });
}

export async function auditAvatarAssets(appRoot) {
  const entries = [];
  for (const gender of ['male', 'female']) {
    for (let stage = 1; stage <= 10; stage += 1) {
      const stageLabel = String(stage).padStart(2, '0');
      const file = path.join(appRoot, 'assets', 'hero', 'tiers-v2', gender, `stage-${stageLabel}.png`);
      entries.push(Object.freeze({ gender, stage, ...(await inspectPngAlpha(file)) }));
    }
  }
  return Object.freeze(entries);
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = await auditAvatarAssets(appRoot);
  console.table(report.map((entry) => ({
    gender: entry.gender,
    stage: entry.stage,
    size: `${entry.width}x${entry.height}`,
    bbox: `${entry.bbox.left},${entry.bbox.top}â€“${entry.bbox.right},${entry.bbox.bottom}`,
    margins: `${entry.margins.left}/${entry.margins.top}/${entry.margins.right}/${entry.margins.bottom}`,
    visualHeight: `${(entry.visualHeightRatio * 100).toFixed(1)}%`,
    edge: entry.touchesEdge ? 'SIM' : 'nÃ£o',
  })));
}
