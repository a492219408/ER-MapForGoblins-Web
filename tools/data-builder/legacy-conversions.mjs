const MASTER_AREAS = new Set([60, 61]);

export function parseLegacyConversions(generatedHeaderSource, parameterJsonSource) {
  const parameterRows = JSON.parse(parameterJsonSource);
  if (!Array.isArray(parameterRows)) throw new Error('WorldMapLegacyConvParam.json 顶层必须是数组');

  const edges = [];
  const edgeKeys = new Set();

  // 优先正式基准点。这样同一区域中更晚追加的替代基准点不会覆盖法姆·亚兹拉
  // 等区域最早且实际使用的转换。
  for (const row of parameterRows) {
    if (Number(row.isBasePoint) !== 1) continue;
    addEdge(edges, edgeKeys, conversionFromParameterRow(row));
  }

  // ERR JSON 尾部保存了跨旧地图页的扩展连接。它们不仅可能直接抵达 60/61，
  // 也可能组成 12→35→11→60 这样的链，或者需要反向走回已有基准点。
  for (const row of parameterRows) {
    if (row.isBasePoint !== undefined) continue;
    addEdge(edges, edgeKeys, conversionFromParameterRow(row));
  }

  // 较旧 checkout 没有完整 JSON 时，生成头仍可为直达主画布的区域兜底。
  for (const conversion of parseGeneratedHeader(generatedHeaderSource)) {
    addEdge(edges, edgeKeys, conversion);
  }

  const graph = buildGraph(edges);
  const conversions = [];
  for (const sourceNode of graph.keys()) {
    const resolved = resolveToMaster(graph, sourceNode);
    if (resolved) conversions.push(resolved);
  }
  return conversions;
}

function buildGraph(edges) {
  const graph = new Map();
  const add = (edge) => {
    const key = nodeKey(edge.sourceArea, edge.sourceGridX);
    const values = graph.get(key) ?? [];
    values.push(edge);
    graph.set(key, values);
  };

  for (const edge of edges) {
    add(edge);
    if (!MASTER_AREAS.has(edge.targetArea)) add(invert(edge));
  }
  return graph;
}

function resolveToMaster(graph, sourceNode) {
  const queue = [{ node: sourceNode, deltaX: 0, deltaZ: 0, first: undefined, visited: new Set([sourceNode]) }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of graph.get(current.node) ?? []) {
      const first = current.first ?? edge;
      const deltaX = current.deltaX + edge.targetX - edge.sourceX;
      const deltaZ = current.deltaZ + edge.targetZ - edge.sourceZ;
      if (MASTER_AREAS.has(edge.targetArea)) {
        return {
          sourceArea: first.sourceArea,
          sourceGridX: first.sourceGridX,
          sourceX: first.sourceX,
          sourceZ: first.sourceZ,
          targetArea: edge.targetArea,
          targetGridX: edge.targetGridX,
          targetGridZ: edge.targetGridZ,
          targetX: round(first.sourceX + deltaX),
          targetZ: round(first.sourceZ + deltaZ),
        };
      }

      const targetNode = nodeKey(edge.targetArea, edge.targetGridX);
      if (current.visited.has(targetNode)) continue;
      const visited = new Set(current.visited);
      visited.add(targetNode);
      queue.push({ node: targetNode, deltaX, deltaZ, first, visited });
    }
  }
  return undefined;
}

function parseGeneratedHeader(source) {
  const conversions = [];
  const pattern = /\{\s*(\d+),\s*(\d+),\s*([-+]?\d+(?:\.\d+)?)f,\s*([-+]?\d+(?:\.\d+)?)f,\s*(\d+),\s*(\d+),\s*(\d+),\s*([-+]?\d+(?:\.\d+)?)f,\s*([-+]?\d+(?:\.\d+)?)f\s*\}/g;
  for (const match of source.matchAll(pattern)) {
    conversions.push({
      sourceArea: Number(match[1]),
      sourceGridX: Number(match[2]),
      sourceX: Number(match[3]),
      sourceZ: Number(match[4]),
      targetArea: Number(match[5]),
      targetGridX: Number(match[6]),
      targetGridZ: Number(match[7]),
      targetX: Number(match[8]),
      targetZ: Number(match[9]),
    });
  }
  return conversions;
}

function conversionFromParameterRow(row) {
  const conversion = {
    sourceArea: Number(row.srcAreaNo),
    sourceGridX: Number(row.srcGridXNo),
    sourceX: Number(row.srcPosX),
    sourceZ: Number(row.srcPosZ),
    targetArea: Number(row.dstAreaNo),
    targetGridX: Number(row.dstGridXNo),
    targetGridZ: Number(row.dstGridZNo),
    targetX: Number(row.dstPosX),
    targetZ: Number(row.dstPosZ),
  };
  return Object.values(conversion).every(Number.isFinite) ? conversion : undefined;
}

function addEdge(edges, keys, conversion) {
  if (!conversion) return;
  const key = [
    conversion.sourceArea,
    conversion.sourceGridX,
    conversion.targetArea,
    conversion.targetGridX,
  ].join(':');
  if (keys.has(key)) return;
  keys.add(key);
  edges.push(conversion);
}

function invert(edge) {
  return {
    sourceArea: edge.targetArea,
    sourceGridX: edge.targetGridX,
    sourceX: edge.targetX,
    sourceZ: edge.targetZ,
    targetArea: edge.sourceArea,
    targetGridX: edge.sourceGridX,
    targetGridZ: 0,
    targetX: edge.sourceX,
    targetZ: edge.sourceZ,
  };
}

function nodeKey(area, gridX) {
  return `${area}:${gridX}`;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
