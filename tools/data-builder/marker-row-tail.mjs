const MARKER_TAIL_PATTERN = /Category::([A-Za-z0-9_]+),\s*(-?\d+),\s*(-?\d+),\s*(?:"[^"]*"|nullptr),\s*(\d+)u,\s*(\d+),\s*([-+]?\d+(?:\.\d+)?)f,\s*([-+]?\d+(?:\.\d+)?)f\s*\},/;

export function parseMarkerRowTail(block, rowId) {
  const match = block.match(MARKER_TAIL_PATTERN);
  if (!match) throw new Error(`无法解析标记尾部：Row ID ${rowId}`);
  return {
    category: match[1],
    geomSlot: Number(match[2]),
    secondaryGeomSlot: Number(match[3]),
    lotId: Number(match[4]),
    lotType: Number(match[5]),
    mapOffsetX: Number(match[6]),
    mapOffsetY: Number(match[7]),
  };
}
