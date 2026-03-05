import type { UIElement } from "./physics";

/**
 * UIスクリーンショットを「行ベースのスライス」で分割する。
 *
 * 原理: UIは横方向の帯（ステータスバー、ヘッダー、カード、リスト…）で構成されている。
 * 1. 各行の「水平エッジ強度」を計算（色が急変する水平ライン = セクション境界）
 * 2. エッジ強度が高い行をカットラインとして使用
 * 3. 各スライス内で垂直方向の分割も検出（2カラムレイアウト等）
 * 4. 結果として自然なUI矩形パーツが得られる
 */
export function analyzeImage(img: HTMLImageElement): UIElement[] {
  const canvas = document.createElement("canvas");
  // 分析用に縮小
  const scale = Math.min(1, 500 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 1. 各行の水平エッジ強度を計算
  //    行yと行y+1の間の色差の合計 → 大きければセクション境界
  const rowEdge = new Float32Array(h);
  for (let y = 0; y < h - 1; y++) {
    let totalDiff = 0;
    for (let x = 0; x < w; x++) {
      const i1 = (y * w + x) * 4;
      const i2 = ((y + 1) * w + x) * 4;
      const dr = data[i1] - data[i2];
      const dg = data[i1 + 1] - data[i2 + 1];
      const db = data[i1 + 2] - data[i2 + 2];
      totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
    }
    rowEdge[y] = totalDiff / w; // 1ピクセルあたりの平均エッジ強度
  }

  // 2. カットラインを検出（エッジ強度が閾値以上の行）
  //    ただし近すぎるカットラインは統合（最小スライス高さを保証）
  const edgeThreshold = 8; // 平均色差がこの値以上ならカットライン
  const minSliceHeight = Math.max(15, h * 0.03); // 最小スライス高さ（画面の3%以上）

  const cutLines: number[] = [0]; // 先頭
  for (let y = 1; y < h - 1; y++) {
    if (rowEdge[y] > edgeThreshold) {
      const lastCut = cutLines[cutLines.length - 1];
      if (y - lastCut >= minSliceHeight) {
        cutLines.push(y);
      } else if (rowEdge[y] > rowEdge[lastCut]) {
        // より強いエッジなら置き換え（ただし最初のカットは保持）
        if (cutLines.length > 1) {
          cutLines[cutLines.length - 1] = y;
        }
      }
    }
  }
  cutLines.push(h); // 末尾

  // 3. 各スライスを生成し、垂直分割も検出
  const slices: UIElement[] = [];

  for (let i = 0; i < cutLines.length - 1; i++) {
    const y1 = cutLines[i];
    const y2 = cutLines[i + 1];
    const sliceHeight = y2 - y1;

    if (sliceHeight < minSliceHeight) continue;

    // このスライス内の垂直エッジ強度を計算
    const colEdge = new Float32Array(w);
    for (let x = 0; x < w - 1; x++) {
      let totalDiff = 0;
      for (let y = y1; y < y2; y++) {
        const i1 = (y * w + x) * 4;
        const i2 = (y * w + x + 1) * 4;
        const dr = data[i1] - data[i2];
        const dg = data[i1 + 1] - data[i2 + 1];
        const db = data[i1 + 2] - data[i2 + 2];
        totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
      }
      colEdge[x] = totalDiff / sliceHeight;
    }

    // 垂直カットラインを検出
    // 画面幅の20%〜80%の範囲にある強い垂直エッジを探す
    const verticalCuts: number[] = [0];
    const minColWidth = w * 0.15;
    const colEdgeThreshold = 6;

    for (let x = Math.round(w * 0.1); x < w * 0.9; x++) {
      if (colEdge[x] > colEdgeThreshold) {
        const lastCut = verticalCuts[verticalCuts.length - 1];
        if (x - lastCut >= minColWidth) {
          verticalCuts.push(x);
        }
      }
    }
    verticalCuts.push(w);

    // 垂直分割が2〜4列なら採用、それ以外は1列として扱う
    if (verticalCuts.length >= 3 && verticalCuts.length <= 5) {
      for (let j = 0; j < verticalCuts.length - 1; j++) {
        const x1 = verticalCuts[j];
        const x2 = verticalCuts[j + 1];
        if (x2 - x1 < minColWidth) continue;
        slices.push({
          label: `slice-${i}-${j}`,
          x: x1 / w,
          y: y1 / h,
          width: (x2 - x1) / w,
          height: sliceHeight / h,
        });
      }
    } else {
      // 1列（全幅）
      slices.push({
        label: `slice-${i}`,
        x: 0,
        y: y1 / h,
        width: 1,
        height: sliceHeight / h,
      });
    }
  }

  // 4. 非常に小さいスライスを除去（画面の1%未満）
  const minArea = 0.01;
  const filtered = slices.filter(s => s.width * s.height >= minArea);

  // 5. 大きすぎるスライス（画面の40%以上）をさらに分割
  const result: UIElement[] = [];
  for (const s of filtered) {
    if (s.height > 0.4 && s.width > 0.8) {
      // 大きすぎる場合は均等に2〜3分割
      const parts = s.height > 0.6 ? 3 : 2;
      const partH = s.height / parts;
      for (let p = 0; p < parts; p++) {
        result.push({
          label: `${s.label}-sub${p}`,
          x: s.x,
          y: s.y + partH * p,
          width: s.width,
          height: partH,
        });
      }
    } else {
      result.push(s);
    }
  }

  // 最大20個に制限
  if (result.length > 20) result.length = 20;

  // 最低でも3パーツは欲しい（検出が少なすぎる場合は均等分割にフォールバック）
  if (result.length < 3) {
    return fallbackGrid(5, 1);
  }

  return result;
}

// フォールバック: 均等グリッド分割
function fallbackGrid(rows: number, cols: number): UIElement[] {
  const elements: UIElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      elements.push({
        label: `grid-${r}-${c}`,
        x: c / cols,
        y: r / rows,
        width: 1 / cols,
        height: 1 / rows,
      });
    }
  }
  return elements;
}
