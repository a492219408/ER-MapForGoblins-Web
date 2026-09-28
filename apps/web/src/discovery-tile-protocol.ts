import { addProtocol, type GetResourceResponse, type RequestParameters } from 'maplibre-gl';
import { mapTileTemplateUrl, type MapDiscoveryPiece, type MapTileManifest } from './dataset';

const PROTOCOL = 'mfg-discovery';
const configurations = new Map<string, DiscoveryTileConfiguration>();
let nextConfigurationId = 1;
let protocolRegistered = false;

type DiscoveryMapId = 'M00' | 'M01' | 'M10';

interface DiscoveryTileConfiguration {
  maps: Record<DiscoveryMapId, {
    fullTileTemplate: string;
    hiddenTileTemplate: string;
    pieces: MapDiscoveryPiece[];
    supportedMask: number;
  }>;
}

export function registerDiscoveryTileProtocol(manifest: MapTileManifest): string | undefined {
  const discovery = manifest.discovery;
  if (!discovery) return undefined;
  ensureProtocolRegistered();
  const id = String(nextConfigurationId++);
  const byMapId = (mapId: DiscoveryMapId) => {
    const plane = mapId === 'M00' ? 'surface' : mapId === 'M01' ? 'underground' : 'shadow';
    const full = manifest.maps.find((map) => map.plane === plane);
    if (!full) throw new Error(`${mapId} 缺少完整地图瓦片定义`);
    const pieces = discovery.pieces.filter((piece) => piece.plane === plane);
    return {
      fullTileTemplate: mapTileTemplateUrl(full.tileTemplate),
      hiddenTileTemplate: mapTileTemplateUrl(discovery.hiddenTileTemplates[mapId]),
      pieces,
      supportedMask: pieces.reduce((mask, piece) => mask | piece.maskBit, 0),
    };
  };
  configurations.set(id, {
    maps: { M00: byMapId('M00'), M01: byMapId('M01'), M10: byMapId('M10') },
  });
  return id;
}

export function unregisterDiscoveryTileProtocol(id: string | undefined): void {
  if (!id) return;
  configurations.delete(id);
}

export function discoveryTileTemplate(
  id: string,
  mapId: DiscoveryMapId,
  openMask: number,
): string {
  return `${PROTOCOL}://${id}/${mapId}/${openMask >>> 0}/{z}/{x}/{y}`;
}

function ensureProtocolRegistered(): void {
  if (protocolRegistered) return;
  addProtocol(PROTOCOL, loadDiscoveryTile);
  protocolRegistered = true;
}

async function loadDiscoveryTile(
  request: RequestParameters,
  abortController: AbortController,
): Promise<GetResourceResponse<ImageBitmap>> {
  const url = new URL(request.url);
  const [mapIdValue, openMaskText, z, x, y] = url.pathname.split('/').filter(Boolean);
  const configuration = configurations.get(url.hostname);
  if (!configuration || !isDiscoveryMapId(mapIdValue) || !z || !x || !y) {
    throw new Error(`无效的探索地图瓦片地址：${request.url}`);
  }
  const openMask = Number(openMaskText) >>> 0;
  const map = configuration.maps[mapIdValue];
  const hiddenUrl = resolveTileUrl(map.hiddenTileTemplate, z, x, y);
  if (openMask === 0) {
    return { data: await fetchBitmap(hiddenUrl, abortController.signal) };
  }
  const fullUrl = resolveTileUrl(map.fullTileTemplate, z, x, y);
  if ((openMask & map.supportedMask) === map.supportedMask) {
    return { data: await fetchBitmap(fullUrl, abortController.signal) };
  }

  const openPieces = map.pieces.filter((piece) => (piece.maskBit & openMask) !== 0);
  const [hidden, full, ...pieceMasks] = await Promise.all([
    fetchBitmap(hiddenUrl, abortController.signal),
    fetchBitmap(fullUrl, abortController.signal),
    ...openPieces.map((piece) => fetchBitmap(
      resolveTileUrl(mapTileTemplateUrl(piece.tileTemplate), z, x, y),
      abortController.signal,
    )),
  ]);
  try {
    return {
      data: await composeRevealedTile(hidden, full, pieceMasks),
    };
  } finally {
    hidden.close();
    full.close();
    pieceMasks.forEach((bitmap) => bitmap.close());
  }
}

async function fetchBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`无法读取探索地图瓦片（HTTP ${response.status}）`);
  return createImageBitmap(await response.blob());
}

async function composeRevealedTile(
  hidden: ImageBitmap,
  full: ImageBitmap,
  pieceMasks: readonly ImageBitmap[],
): Promise<ImageBitmap> {
  const output = createCanvas(hidden.width, hidden.height);
  const outputContext = context2d(output);

  outputContext.drawImage(hidden, 0, 0);
  // 每个官方碎片都带有自己的平滑外缘，直接绘制才能保留“已揭示—未揭示”
  // 边界的原始过渡。相邻已揭示碎片之间的暗边在下一步单独修补。
  for (const piece of pieceMasks) outputContext.drawImage(piece, 0, 0);
  if (pieceMasks.length < 2) return canvasToBitmap(output);

  const seamMask = buildInternalSeamMask(pieceMasks, hidden.width, hidden.height);
  if (!seamMask) return canvasToBitmap(output);

  const revealed = createCanvas(hidden.width, hidden.height);
  const mask = createCanvas(hidden.width, hidden.height);
  const union = createCanvas(hidden.width, hidden.height);
  const revealedContext = context2d(revealed);
  const maskContext = context2d(mask);
  const unionContext = context2d(union);
  const lowResolutionMask = createCanvas(seamMask.width, seamMask.height);
  const lowResolutionMaskContext = context2d(lowResolutionMask);
  const maskImage = lowResolutionMaskContext.createImageData(seamMask.width, seamMask.height);
  for (let index = 0; index < seamMask.alpha.length; index += 1) {
    maskImage.data[index * 4 + 3] = seamMask.alpha[index];
  }
  lowResolutionMaskContext.putImageData(maskImage, 0, 0);
  maskContext.imageSmoothingEnabled = true;
  maskContext.drawImage(lowResolutionMask, 0, 0, hidden.width, hidden.height);
  // 低分辨率边界检测只决定“哪里是内部接缝”；最终仍用完整分辨率
  // 的官方 alpha 并集精确裁切，避免任何像素向未揭示区域外扩。
  for (const piece of pieceMasks) unionContext.drawImage(piece, 0, 0);
  maskContext.globalCompositeOperation = 'destination-in';
  maskContext.drawImage(union, 0, 0);
  revealedContext.drawImage(full, 0, 0);
  revealedContext.globalCompositeOperation = 'destination-in';
  revealedContext.drawImage(mask, 0, 0);
  outputContext.drawImage(revealed, 0, 0);
  return canvasToBitmap(output);
}

/**
 * 找出两个已揭示碎片真正相接的窄带。修补带始终裁在已揭示像素的并集内，
 * 因而不会把完整地图的硬边带到外侧未揭示区域。
 */
interface InternalSeamMask {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
}

function buildInternalSeamMask(
  pieces: readonly ImageBitmap[],
  width: number,
  height: number,
): InternalSeamMask | undefined {
  // 只需要找出接缝拓扑；以四分之一尺寸分析，再由完整 alpha 精确裁切。
  const sampleScale = 4;
  const sampleWidth = Math.max(1, Math.ceil(width / sampleScale));
  const sampleHeight = Math.max(1, Math.ceil(height / sampleScale));
  const pixelCount = sampleWidth * sampleHeight;
  const owner = new Int16Array(pixelCount);
  owner.fill(-1);
  const seamSeed = new Uint8Array(pixelCount);
  const scratch = createCanvas(sampleWidth, sampleHeight);
  const scratchContext = context2d(scratch);

  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
    scratchContext.clearRect(0, 0, sampleWidth, sampleHeight);
    scratchContext.drawImage(pieces[pieceIndex], 0, 0, sampleWidth, sampleHeight);
    const pixels = scratchContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let pixel = 0, channel = 3; pixel < pixelCount; pixel += 1, channel += 4) {
      const alpha = pixels[channel];
      if (alpha === 0) continue;
      if (owner[pixel] < 0) {
        owner[pixel] = pieceIndex;
      } else if (owner[pixel] !== pieceIndex) {
        seamSeed[pixel] = 1;
      }
    }
  }

  // 兼容两个遮罩刚好相接、但没有 alpha 重叠的边界。
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const pixel = y * sampleWidth + x;
      const currentOwner = owner[pixel];
      if (currentOwner < 0) continue;
      if (x + 1 < sampleWidth) markOwnerBoundary(pixel, pixel + 1, currentOwner, owner, seamSeed);
      if (y + 1 < sampleHeight) {
        markOwnerBoundary(pixel, pixel + sampleWidth, currentOwner, owner, seamSeed);
      }
      if (x + 1 < sampleWidth && y + 1 < sampleHeight) {
        markOwnerBoundary(pixel, pixel + sampleWidth + 1, currentOwner, owner, seamSeed);
      }
      if (x > 0 && y + 1 < sampleHeight) {
        markOwnerBoundary(pixel, pixel + sampleWidth - 1, currentOwner, owner, seamSeed);
      }
    }
  }
  if (!seamSeed.some(Boolean)) return undefined;

  // 一个采样像素约等于四个源像素，足以覆盖碎片烘焙的暗边。
  const radius = 1;
  const result = new Uint8ClampedArray(pixelCount);
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const pixel = y * sampleWidth + x;
      if (!seamSeed[pixel]) continue;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(sampleHeight - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(sampleWidth - 1, x + radius);
      for (let targetY = minY; targetY <= maxY; targetY += 1) {
        const row = targetY * sampleWidth;
        for (let targetX = minX; targetX <= maxX; targetX += 1) {
          const target = row + targetX;
          result[target] = 255;
        }
      }
    }
  }
  return { alpha: result, width: sampleWidth, height: sampleHeight };
}

function markOwnerBoundary(
  leftPixel: number,
  rightPixel: number,
  leftOwner: number,
  owners: Int16Array,
  seamSeed: Uint8Array,
): void {
  const rightOwner = owners[rightPixel];
  if (rightOwner < 0 || rightOwner === leftOwner) return;
  seamSeed[leftPixel] = 1;
  seamSeed[rightPixel] = 1;
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: OffscreenCanvas | HTMLCanvasElement): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持探索地图瓦片合成');
  return context as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
}

function canvasToBitmap(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<ImageBitmap> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return Promise.resolve(canvas.transferToImageBitmap());
  }
  return createImageBitmap(canvas);
}

function resolveTileUrl(template: string, z: string, x: string, y: string): string {
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

function isDiscoveryMapId(value: string | undefined): value is DiscoveryMapId {
  return value === 'M00' || value === 'M01' || value === 'M10';
}
