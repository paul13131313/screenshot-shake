"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Matter from "matter-js";
import type { UIElement } from "@/lib/physics";
import { createPhysicsWorld, triggerShake, resetPhysics } from "@/lib/physics";
import type { PhysicsWorld } from "@/lib/physics";
import { analyzeImage } from "@/lib/analyze";

type AppState = "idle" | "analyzing" | "preview" | "ready" | "shaken";

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

  // プレビュー描画（解析結果を矩形で表示）
  const drawPreview = useCallback((els: UIElement[]) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
      "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
      "#F8C471", "#82E0AA", "#F1948A", "#85929E", "#AED6F1",
      "#A3E4D7", "#FAD7A0", "#D2B4DE", "#A9CCE3", "#ABEBC6",
    ];
    els.forEach((el, i) => {
      const x = el.x * cw;
      const y = el.y * ch;
      const w = el.width * cw;
      const h = el.height * ch;
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = colors[i % colors.length] + "20";
      ctx.fillRect(x, y, w, h);
    });
  }, []);

  // Canvas描画ループ（物理シミュレーション中）
  const startRenderLoop = useCallback((els: UIElement[]) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const physics = physicsRef.current!;
    const img = imageRef.current!;
    const cw = canvas.width;
    const ch = canvas.height;

    const loop = () => {
      Matter.Engine.update(physics.engine, 1000 / 60);

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.globalAlpha = 1;

      physics.bodies.forEach((body, i) => {
        const sprite = spritesRef.current[i];
        if (!sprite) return;
        const el = els[i];
        if (!el) return;
        const w = el.width * cw;
        const h = el.height * ch;

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
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

  // 画像アップロード処理
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("analyzing");

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      // クライアント側で即時解析
      const els = analyzeImage(img);
      elementsRef.current = els;
      setElementCount(els.length);

      // Canvasセットアップ
      const { cw, ch } = setupCanvas(img);

      // プレビュー描画
      drawPreview(els);

      // スプライト生成
      createSprites(img, els, cw, ch);

      setState("preview");
    };
    img.src = URL.createObjectURL(file);
  };

  // プレビューから物理シミュレーションへ
  const startPhysics = useCallback(() => {
    const els = elementsRef.current;
    const { width: cw, height: ch } = canvasSizeRef.current;

    if (physicsRef.current) {
      Matter.World.clear(physicsRef.current.engine.world, false);
      Matter.Engine.clear(physicsRef.current.engine);
    }
    const physics = createPhysicsWorld(els, cw, ch);
    physicsRef.current = physics;

    startRenderLoop(els);
    setState("ready");
  }, [startRenderLoop]);

  // iOS DeviceMotion許可 → 物理モードへ
  const requestPermissionAndStart = async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (DME.requestPermission) {
      try { await DME.requestPermission(); } catch { /* ボタンで崩せるので続行 */ }
    }
    startPhysics();
  };

  // シェイク実行
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
    if (physicsRef.current) {
      Matter.World.clear(physicsRef.current.engine.world, false);
      Matter.Engine.clear(physicsRef.current.engine);
    }
    physicsRef.current = null;
    spritesRef.current = [];
    elementsRef.current = [];
    setElementCount(0);
    setState("idle");
  }, []);

  // DeviceMotion シェイク検知
  useEffect(() => {
    if (state !== "ready") return;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      if (mag > 25) doShake();
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [state, doShake]);

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
          Screenshot Shake
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          スクショをアップロードして振ると崩れる
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
            <p className="text-gray-400 text-sm">UIパーツを解析中...</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`rounded-xl shadow-2xl ${showCanvas ? "" : "hidden"}`}
          style={{ maxWidth: "100%" }}
        />

        {state === "preview" && (
          <div className="flex flex-col items-center gap-3 mt-2 w-full">
            <p className="text-green-400 text-sm font-medium">
              {elementCount}個のUIパーツを検出
            </p>
            <button
              onClick={requestPermissionAndStart}
              className="w-full max-w-xs px-6 py-4 bg-red-600 rounded-xl text-base font-bold hover:bg-red-700 transition-colors"
            >
              準備OK！振って崩す
            </button>
            <button onClick={doNewImage} className="text-gray-500 text-xs underline">
              別の画像にする
            </button>
          </div>
        )}

        {state === "ready" && (
          <div className="flex flex-col items-center gap-3 mt-2 w-full">
            <div className="flex items-center gap-2 text-xl animate-bounce">
              <span>📳</span>
              <span className="font-bold">スマホを振ってください！</span>
            </div>
            <button
              onClick={doShake}
              className="w-full max-w-xs px-6 py-4 bg-red-600 rounded-xl text-base font-bold hover:bg-red-700 transition-colors active:scale-95"
            >
              タップで崩す
            </button>
            <p className="text-gray-500 text-xs">PCの場合はSpaceキーでも崩せます</p>
          </div>
        )}

        {state === "shaken" && (
          <div className="flex flex-col items-center gap-3 mt-2 w-full">
            <p className="text-yellow-400 text-sm font-medium">崩壊完了！</p>
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
