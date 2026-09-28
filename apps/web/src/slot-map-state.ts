import { gaItemCountForSaveVersion } from './save-layout-version';

export type SaveMapId = [number, number, number, number];
export type SaveCoordinates = [number, number, number];

export interface SaveMapPoint {
  mapId: SaveMapId;
  coordinates: SaveCoordinates;
}

export interface SlotMapState {
  player: SaveMapPoint;
  bloodstain: SaveMapPoint & { runes: number };
  /**
   * 游戏保存的地表探索迷雾位图。它位于 MenuProfile 的起始区，前 205
   * 字节恰好容纳 40×41 位；后续字节包含结构化菜单字段和地图坐标，不能
   * 继续当作位图解析。
   */
  fogRevealBytes: Uint8Array;
}

const SLOT_START = 0x300;
const SLOT_STRIDE = 0x280010;
const SLOT_CHECKSUM_BYTES = 0x10;
const EVENT_FLAGS_BYTES = 0x1bf99f;
const FOG_REVEAL_OFFSET_AFTER_REGIONS = 0x087e;
const FOG_REVEAL_BYTES = 0x00cd;

/**
 * 从 UserDataX 中只读提取地图所需字段。这个窄解析器沿用完整存档布局的
 * 长度边界，但不会复制库存、事件旗标或其他大型结构。
 */
export function extractSlotMapState(bytes: ArrayBuffer, slotIndex: number): SlotMapState {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 10) throw new Error('存档槽位索引无效');
  const slotBase = SLOT_START + SLOT_STRIDE * slotIndex;
  const reader = new SlotReader(bytes, slotBase + SLOT_CHECKSUM_BYTES, slotBase + SLOT_STRIDE);
  const version = reader.u32();
  if (version <= 0) throw new Error('存档槽位为空');

  reader.skip(4 + 8 + 0x10); // map id + UserDataX header
  const gaitemCount = gaItemCountForSaveVersion(version);
  for (let index = 0; index < gaitemCount; index += 1) {
    const handle = reader.u32();
    reader.skip(4); // item id
    if (handle === 0) continue;
    const handleClass = (handle & 0xf0000000) >>> 0;
    if (handleClass !== 0xc0000000) reader.skip(8);
    if (handleClass === 0x80000000) reader.skip(5);
  }

  reader.skip(0x1b0); // PlayerGameData
  reader.skip(0xd * 0x10); // SpEffect
  reader.skip(0x58 + 0x1c + 0x58 + 0x58); // equipment indices, active slots, ids, ChrAsm
  reader.skip(inventoryBytes(0xa80, 0x180));
  reader.skip(0x74 + 0x8c + 0x18); // spells, quick/pouch items, gestures
  const projectileCount = reader.u32();
  reader.skip(projectileCount * 8);
  reader.skip(0x9c + 0x0c + 0x12f); // redundant equipment, physick, face
  reader.skip(inventoryBytes(0x780, 0x80));
  reader.skip(0x100); // gesture table
  const regionCount = reader.u32();
  reader.skip(regionCount * 4);
  const fogRevealBytes = reader.copyAt(FOG_REVEAL_OFFSET_AFTER_REGIONS, FOG_REVEAL_BYTES);
  reader.skip(0x28 + 1); // Torrent + control byte

  const bloodCoordinates = reader.coordinates();
  reader.skip(16 + 20 + 4);
  const bloodRunes = reader.i32();
  const bloodMapId = reader.mapId();
  reader.skip(8);

  reader.skip(8);
  reader.skip(4);
  reader.skip(reader.u32()); // menu_profile_save_load
  reader.skip(0x34 + (8 + 7000 * 16));
  reader.skip(4);
  const tutorialSize = reader.u32();
  const tutorialCount = reader.u32();
  if (tutorialCount !== 0) reader.skip(tutorialSize - 4);
  reader.skip(3 + 4 + 4 + 1 + 4 + 4 + 1 + 4 + 4); // deaths through countdown fields
  reader.skip(EVENT_FLAGS_BYTES + 1);
  for (let section = 0; section < 5; section += 1) reader.skip(reader.i32());

  const playerCoordinates = reader.coordinates();
  const playerMapId = reader.mapId();

  return {
    player: { coordinates: playerCoordinates, mapId: playerMapId },
    bloodstain: { coordinates: bloodCoordinates, mapId: bloodMapId, runes: bloodRunes },
    fogRevealBytes,
  };
}

function inventoryBytes(commonCapacity: number, keyCapacity: number): number {
  return 4 + commonCapacity * 12 + 4 + keyCapacity * 12 + 8;
}

class SlotReader {
  private readonly view: DataView;
  private readonly end: number;
  private position: number;

  constructor(bytes: ArrayBuffer, start: number, end: number) {
    this.view = new DataView(bytes);
    this.end = end;
    this.position = start;
    this.ensure(0);
  }

  skip(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('存档槽位包含无效长度');
    this.ensure(length);
    this.position += length;
  }

  copyAt(relativeOffset: number, length: number): Uint8Array {
    if (!Number.isSafeInteger(relativeOffset) || relativeOffset < 0) throw new Error('存档槽位包含无效偏移');
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('存档槽位包含无效长度');
    const start = this.position + relativeOffset;
    if (start < 0 || start + length > this.end || start + length > this.view.byteLength) {
      throw new Error('存档槽位被截断或字段越界');
    }
    return new Uint8Array(this.view.buffer.slice(start, start + length));
  }

  u32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.position, true);
    this.position += 4;
    return value;
  }

  i32(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.position, true);
    this.position += 4;
    return value;
  }

  f32(): number {
    this.ensure(4);
    const value = this.view.getFloat32(this.position, true);
    this.position += 4;
    return value;
  }

  coordinates(): SaveCoordinates {
    return [this.f32(), this.f32(), this.f32()];
  }

  mapId(): SaveMapId {
    this.ensure(4);
    const mapId: SaveMapId = [
      this.view.getUint8(this.position),
      this.view.getUint8(this.position + 1),
      this.view.getUint8(this.position + 2),
      this.view.getUint8(this.position + 3),
    ];
    this.position += 4;
    return mapId;
  }

  private ensure(length: number): void {
    if (this.position < 0 || this.position + length > this.end || this.position + length > this.view.byteLength) {
      throw new Error('存档槽位被截断或字段越界');
    }
  }
}
