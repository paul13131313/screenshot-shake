import type { UIElement } from "./physics";

// Union-Find (Disjoint Set Union) for connected components
class UnionFind {
  parent: Int32Array;
  rank: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]; // path compression
      x = this.parent[x];
    }
    return x;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}

// Sobelフィルタでエッジの強さを計算
function computeEdgeMap(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  // まずグレースケール変換
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  }

  const edges = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Sobel X
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];

      // Sobel Y
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return edges;
}

interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
  colorSum: [number, number, number]; // 平均色計算用
}

export function analyzeImage(img: HTMLImageElement): UIElement[] {
  const canvas = document.createElement("canvas");
  // 分析用に縮小（高速化）— UIスクショは400pxで十分
  const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const totalPixels = w * h;

  // 1. エッジマップを計算（Sobelフィルタ）
  const edgeMap = computeEdgeMap(data, w, h);

  // エッジ閾値: この値以上の勾配があるピクセル間は結合しない
  const edgeThreshold = 15;
  // 色の類似度閾値
  const colorThreshold = 25;

  // 2. Union-Find で連結領域を構築（エッジをバリアとして使用）
  const uf = new UnionFind(totalPixels);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pixel = idx * 4;
      const edgeHere = edgeMap[idx];

      // 右のピクセルと比較
      if (x + 1 < w) {
        const rightIdx = idx + 1;
        const rightPixel = pixel + 4;
        const edgeRight = edgeMap[rightIdx];
        // エッジが強い場所は結合しない（バリア）
        const maxEdge = Math.max(edgeHere, edgeRight);
        if (maxEdge < edgeThreshold) {
          // エッジが弱い場所は色の類似度で判定
          const dr = data[pixel] - data[rightPixel];
          const dg = data[pixel + 1] - data[rightPixel + 1];
          const db = data[pixel + 2] - data[rightPixel + 2];
          if (dr * dr + dg * dg + db * db < colorThreshold * colorThreshold) {
            uf.union(idx, rightIdx);
          }
        }
      }
      // 下のピクセルと比較
      if (y + 1 < h) {
        const belowIdx = idx + w;
        const belowPixel = pixel + w * 4;
        const edgeBelow = edgeMap[belowIdx];
        const maxEdge = Math.max(edgeHere, edgeBelow);
        if (maxEdge < edgeThreshold) {
          const dr = data[pixel] - data[belowPixel];
          const dg = data[pixel + 1] - data[belowPixel + 1];
          const db = data[pixel + 2] - data[belowPixel + 2];
          if (dr * dr + dg * dg + db * db < colorThreshold * colorThreshold) {
            uf.union(idx, belowIdx);
          }
        }
      }
    }
  }

  // 3. 各領域のバウンディングボックスとピクセル数を集計
  const regions = new Map<number, Region>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const root = uf.find(idx);
      let region = regions.get(root);
      if (!region) {
        region = {
          minX: x, minY: y, maxX: x, maxY: y,
          pixelCount: 0,
          colorSum: [0, 0, 0],
        };
        regions.set(root, region);
      }
      if (x < region.minX) region.minX = x;
      if (x > region.maxX) region.maxX = x;
      if (y < region.minY) region.minY = y;
      if (y > region.maxY) region.maxY = y;
      region.pixelCount++;
      region.colorSum[0] += data[p];
      region.colorSum[1] += data[p + 1];
      region.colorSum[2] += data[p + 2];
    }
  }

  // 4. 背景を特定（最大ピクセル数の領域）
  let bgRoot = -1;
  let bgSize = 0;
  for (const [root, region] of regions) {
    if (region.pixelCount > bgSize) {
      bgSize = region.pixelCount;
      bgRoot = root;
    }
  }

  // 背景色を取得
  const bgRegion = regions.get(bgRoot);
  const bgColor = bgRegion
    ? [
        bgRegion.colorSum[0] / bgRegion.pixelCount,
        bgRegion.colorSum[1] / bgRegion.pixelCount,
        bgRegion.colorSum[2] / bgRegion.pixelCount,
      ]
    : [0, 0, 0];

  // 5. 背景以外の領域をフィルタリング
  const minArea = totalPixels * 0.003; // 全体の0.3%以上
  const candidates: UIElement[] = [];

  for (const [root, region] of regions) {
    if (root === bgRoot) continue;
    if (region.pixelCount < minArea) continue;

    const rw = region.maxX - region.minX + 1;
    const rh = region.maxY - region.minY + 1;

    // 幅・高さが小さすぎるものをスキップ
    if (rw < 4 && rh < 4) continue;

    // 背景と同じ色の大きな領域もスキップ（2番目の背景の可能性）
    const avgR = region.colorSum[0] / region.pixelCount;
    const avgG = region.colorSum[1] / region.pixelCount;
    const avgB = region.colorSum[2] / region.pixelCount;
    const bgDist = Math.sqrt(
      (avgR - bgColor[0]) ** 2 +
      (avgG - bgColor[1]) ** 2 +
      (avgB - bgColor[2]) ** 2
    );
    // 背景と非常に近い色で、かつ非常に大きい領域はスキップ
    if (bgDist < 10 && region.pixelCount > totalPixels * 0.1) continue;

    candidates.push({
      label: `region-${root}`,
      x: region.minX / w,
      y: region.minY / h,
      width: rw / w,
      height: rh / h,
    });
  }

  // 6. 近接する小さな領域を大きな矩形にグループ化
  //    UIスクショではテキスト行・アイコン等の細かいパーツが多数出るので、
  //    近くにある領域をグループ化して「カード」「セクション」単位にまとめる
  const grouped = groupNearbyRegions(candidates, w, h);

  // 7. 重なっているパーツを統合（IoU > 0.3なら統合）
  const merged = mergeOverlapping(grouped, 0.3);

  // 8. 大きさ順にソートして最大20個
  merged.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  if (merged.length > 20) merged.length = 20;

  return merged;
}

// 近接する領域をグループ化（UIパーツの断片をカード単位にまとめる）
function groupNearbyRegions(elements: UIElement[], imgW: number, imgH: number): UIElement[] {
  if (elements.length === 0) return [];

  // ピクセル単位での近接距離（この距離以内の領域をグループ化）
  const proximityX = 8 / imgW; // 8px
  const proximityY = 6 / imgH; // 6px

  const uf = new UnionFind(elements.length);

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];

      // 水平方向の距離
      const gapX = Math.max(0,
        Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
      // 垂直方向の距離
      const gapY = Math.max(0,
        Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));

      // 近接していればグループ化
      if (gapX < proximityX && gapY < proximityY) {
        uf.union(i, j);
      }
    }
  }

  // グループごとにバウンディングボックスを計算
  const groups = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();

  for (let i = 0; i < elements.length; i++) {
    const root = uf.find(i);
    const el = elements[i];
    let g = groups.get(root);
    if (!g) {
      g = { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
      groups.set(root, g);
    }
    g.minX = Math.min(g.minX, el.x);
    g.minY = Math.min(g.minY, el.y);
    g.maxX = Math.max(g.maxX, el.x + el.width);
    g.maxY = Math.max(g.maxY, el.y + el.height);
  }

  const result: UIElement[] = [];
  for (const [root, g] of groups) {
    result.push({
      label: `group-${root}`,
      x: g.minX,
      y: g.minY,
      width: g.maxX - g.minX,
      height: g.maxY - g.minY,
    });
  }

  return result;
}

// 重なり率が高いパーツ同士を統合
function mergeOverlapping(elements: UIElement[], iouThreshold: number): UIElement[] {
  const result: UIElement[] = [...elements];
  let merged = true;

  while (merged) {
    merged = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];

        // 交差面積を計算
        const overlapX = Math.max(0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const overlapArea = overlapX * overlapY;

        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        const unionArea = areaA + areaB - overlapArea;

        // IoUまたは「小さい方が大きい方に含まれる率」で判定
        const containmentA = areaA > 0 ? overlapArea / areaA : 0;
        const containmentB = areaB > 0 ? overlapArea / areaB : 0;
        const maxContainment = Math.max(containmentA, containmentB);

        if (unionArea > 0 && (overlapArea / unionArea > iouThreshold || maxContainment > 0.7)) {
          // 統合: 両方を囲む矩形
          const minX = Math.min(a.x, b.x);
          const minY = Math.min(a.y, b.y);
          const maxX = Math.max(a.x + a.width, b.x + b.width);
          const maxY = Math.max(a.y + a.height, b.y + b.height);

          result[i] = {
            label: a.label,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
          result.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  return result;
}
