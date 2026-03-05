/**
 * 物理シミュレーション（自前実装）
 *
 * Matter.jsの重力問題を回避し、
 * 「じわじわズレて → ゆっくり落ちていく」を自前で制御する。
 *
 * フェーズ:
 * 1. CRACK（0〜2秒）: パーツが元の位置からじわじわズレる
 * 2. FALL（2秒〜）: 重力がかかりパーツがゆっくり下に落ちていく
 * 3. SETTLE: パーツが画面下部に溜まる
 */

export interface UIElement {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Piece {
  // 元の位置（正規化座標）
  el: UIElement;
  // 現在のピクセル位置
  x: number;
  y: number;
  // 速度
  vx: number;
  vy: number;
  // 回転
  angle: number;
  angularVel: number;
  // サイズ（ピクセル）
  w: number;
  h: number;
  // 解放されたか
  released: boolean;
  // 解放タイミング（ms）
  releaseTime: number;
}

export interface PhysicsWorld {
  pieces: Piece[];
  canvasWidth: number;
  canvasHeight: number;
  startTime: number;
  active: boolean;
}

export function createPhysicsWorld(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number
): PhysicsWorld {
  const pieces: Piece[] = elements.map((el, i) => ({
    el,
    x: el.x * canvasWidth + (el.width * canvasWidth) / 2,
    y: el.y * canvasHeight + (el.height * canvasHeight) / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVel: 0,
    w: el.width * canvasWidth,
    h: el.height * canvasHeight,
    released: false,
    // 上のパーツから順に解放（上のパーツが先にズレ始める）
    releaseTime: 500 + (el.y) * 1500 + Math.random() * 300,
  }));

  return {
    pieces,
    canvasWidth,
    canvasHeight,
    startTime: 0,
    active: false,
  };
}

export function triggerShake(physics: PhysicsWorld) {
  physics.startTime = performance.now();
  physics.active = true;

  // 各パーツにランダムなドリフト方向を設定
  physics.pieces.forEach((piece) => {
    // 横方向のドリフト（小さめ）
    piece.vx = (Math.random() - 0.5) * 0.3;
    // 回転速度（ごく小さい）
    piece.angularVel = (Math.random() - 0.5) * 0.002;
  });
}

const GRAVITY = 0.6;         // 重力加速度（ピクセル/frame²）
const AIR_FRICTION = 0.99;   // 空気抵抗
const FLOOR_BOUNCE = 0.15;   // 床での反発係数

export function updatePhysics(physics: PhysicsWorld) {
  if (!physics.active) return;

  const now = performance.now();
  const elapsed = now - physics.startTime;
  const { canvasWidth, canvasHeight } = physics;

  physics.pieces.forEach((piece) => {
    // まだ解放時間に達していないパーツ
    if (elapsed < piece.releaseTime) {
      // CRACKフェーズ: じわじわとズレ始める
      const crackProgress = Math.min(elapsed / piece.releaseTime, 1);
      if (crackProgress > 0.3) {
        // 微かにズレる（元の位置から少しだけ）
        const drift = (crackProgress - 0.3) * 0.5;
        piece.x += piece.vx * drift;
        piece.angle += piece.angularVel * drift;
      }
      return;
    }

    // 解放済みマーク
    if (!piece.released) {
      piece.released = true;
      // 解放時に初速を与える（下方向 + 横にバラけ）
      piece.vx = (Math.random() - 0.5) * 2;
      piece.vy = Math.random() * 2 + 1;
    }

    // FALLフェーズ: 重力で下に落ちていく
    const timeSinceRelease = elapsed - piece.releaseTime;

    // 重力（時間経過で少しずつ強くなる — じわっと加速する感じ）
    const gravityMul = Math.min(timeSinceRelease / 2000, 1.5) + 0.3;
    piece.vy += GRAVITY * gravityMul;

    // 空気抵抗
    piece.vx *= AIR_FRICTION;
    piece.vy *= AIR_FRICTION;

    // 位置更新
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.angle += piece.angularVel;

    // 回転減衰
    piece.angularVel *= 0.998;

    // 床との衝突
    const floorY = canvasHeight - piece.h / 2;
    if (piece.y > floorY) {
      piece.y = floorY;
      piece.vy = -piece.vy * FLOOR_BOUNCE;
      piece.vx *= 0.8; // 床との摩擦
      piece.angularVel *= 0.5;

      // ほぼ停止したら完全停止
      if (Math.abs(piece.vy) < 0.5) {
        piece.vy = 0;
      }
    }

    // 左右壁との衝突
    const leftBound = piece.w / 2;
    const rightBound = canvasWidth - piece.w / 2;
    if (piece.x < leftBound) {
      piece.x = leftBound;
      piece.vx = Math.abs(piece.vx) * FLOOR_BOUNCE;
    }
    if (piece.x > rightBound) {
      piece.x = rightBound;
      piece.vx = -Math.abs(piece.vx) * FLOOR_BOUNCE;
    }
  });
}

export function resetPhysics(
  physics: PhysicsWorld,
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number
) {
  physics.active = false;
  physics.pieces.forEach((piece, i) => {
    const el = elements[i];
    piece.x = el.x * canvasWidth + (el.width * canvasWidth) / 2;
    piece.y = el.y * canvasHeight + (el.height * canvasHeight) / 2;
    piece.vx = 0;
    piece.vy = 0;
    piece.angle = 0;
    piece.angularVel = 0;
    piece.released = false;
  });
}
