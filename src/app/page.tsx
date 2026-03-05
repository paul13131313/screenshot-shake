"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { UIElement, PhysicsWorld } from "@/lib/physics";
import { createPhysicsWorld, triggerShake, updatePhysics, resetPhysics } from "@/lib/physics";
import { analyzeImage } from "@/lib/analyze";

type AppState = "idle" | "analyzing" | "ready" | "shaken";

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [elementCount, setElementCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const animFrameRef = useRef<number>(0);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const elementsRef = useRef<UIElement[]>([]);
  const stateRef = useRef<AppState>("idle");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // スプライト（パーツ切り抜き画像）を生成
  const createSprites = useCallback(
    (img: HTMLImageElement, els: UIElement[], cw: number, ch: number) => {
      const sprites: HTMLCanvasElement[] = [];
      els.forEach((el) => {
        const sx = el.x * img.naturalWidth;
        const sy = el.y * img.naturalHeight;
        const sw = el.width * img.naturalWidth;
        const sh = el.height * img.naturalHeight;
        const dw = el.width * cw;
        const dh = el.height * ch;

        const sprite = document.createElement("canvas");
        sprite.width = Math.max(1, Math.round(dw));
        sprite.height = Math.max(1, Math.round(dh));
        const ctx = sprite.getContext("2d")!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sprite.width, sprite.height);
        sprites.push(sprite);
      });
      spritesRef.current = sprites;
    },
    []
  );

  // Canvas描画ループ
  const startRenderLoop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const img = imageRef.current!;
    const cw = canvas.width;
    const ch = canvas.height;

    const loop = () => {
      const physics = physicsRef.current;
      if (!physics) return;

      // 物理更新
      updatePhysics(physics);

      ctx.clearRect(0, 0, cw, ch);

      if (stateRef.current === "shaken" && physics.active) {
        // 崩壊中: 背景は黒（clearRectのまま）
      } else {
        // 待機中: 元画像をそのまま表示
        ctx.drawImage(img, 0, 0, cw, ch);
      }

      // 各パーツの描画
      physics.pieces.forEach((piece, i) => {
        const sprite = spritesRef.current[i];
        if (!sprite) return;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.angle);

        // 影（崩壊中のみ）
        if (physics.active && piece.released) {
          ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 4;
        }

        ctx.drawImage(sprite, -piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    loop();
  }, []);

  // Canvasの初期化
  const setupCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current!;
    const maxWidth = Math.min(window.innerWidth - 32, 430);
    const ratio = img.naturalHeight / img.naturalWidth;
    const cw = maxWidth;
    const ch = Math.round(maxWidth * ratio);
    canvas.width = cw;
    canvas.height = ch;
    canvasSizeRef.current = { width: cw, height: ch };
    return { cw, ch };
  }, []);

  // 画像アップロード → 即座に物理セットアップ
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("analyzing");

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      const els = analyzeImage(img);
      elementsRef.current = els;
      setElementCount(els.length);

      const { cw, ch } = setupCanvas(img);
      createSprites(img, els, cw, ch);

      const physics = createPhysicsWorld(els, cw, ch);
      physicsRef.current = physics;

      startRenderLoop();
      setState("ready");
    };
    img.src = URL.createObjectURL(file);
  };

  // 崩壊実行
  const doShake = useCallback(() => {
    if (stateRef.current !== "ready" || !physicsRef.current) return;
    triggerShake(physicsRef.current);
    if (navigator.vibrate) navigator.vibrate(200);
    setState("shaken");
  }, []);

  // リセット
  const doReset = useCallback(() => {
    if (!physicsRef.current) return;
    const els = elementsRef.current;
    const { width: cw, height: ch } = canvasSizeRef.current;
    resetPhysics(physicsRef.current, els, cw, ch);
    setState("ready");
  }, []);

  // 別の画像
  const doNewImage = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;
    physicsRef.current = null;
    spritesRef.current = [];
    elementsRef.current = [];
    setElementCount(0);
    setState("idle");
  }, []);

  // キーボード（Space）
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && stateRef.current === "ready") {
        e.preventDefault();
        doShake();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [doShake]);

  const showCanvas = state !== "idle" && state !== "analyzing";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-8 pb-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          画面崩壊
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          スクショをアップロードしてタップで崩す
        </p>
      </header>

      <main className="flex-1 w-full max-w-md px-4 flex flex-col items-center gap-4 pb-8">
        {state === "idle" && (
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-600 rounded-2xl cursor-pointer hover:border-blue-500 transition-colors">
            <svg className="w-12 h-12 text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-gray-400 text-sm">スクリーンショットを選択</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        )}

        {state === "analyzing" && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">解析中...</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`rounded-xl shadow-2xl ${showCanvas ? "" : "hidden"}`}
          style={{ maxWidth: "100%" }}
        />

        {state === "ready" && (
          <div className="flex flex-col items-center gap-3 mt-2 w-full">
            <p className="text-green-400 text-sm font-medium">
              {elementCount}個のパーツを検出
            </p>
            <button
              onClick={doShake}
              className="w-full max-w-xs px-6 py-4 bg-red-600 rounded-xl text-lg font-bold hover:bg-red-700 transition-colors active:scale-95"
            >
              崩壊させる
            </button>
            <p className="text-gray-500 text-xs">PCの場合はSpaceキーでも崩せます</p>
            <button onClick={doNewImage} className="text-gray-500 text-xs underline mt-1">
              別の画像にする
            </button>
          </div>
        )}

        {state === "shaken" && (
          <div className="flex flex-col items-center gap-3 mt-2 w-full">
            <p className="text-yellow-400 text-sm font-medium">崩壊中…</p>
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={doReset} className="flex-1 px-4 py-3 bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-600 transition-colors">
                もう一回
              </button>
              <button onClick={doNewImage} className="flex-1 px-4 py-3 bg-blue-600 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                別の画像
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
