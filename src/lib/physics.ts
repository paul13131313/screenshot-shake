import Matter from "matter-js";

export interface UIElement {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysicsWorld {
  engine: Matter.Engine;
  bodies: Matter.Body[];
  walls: Matter.Body[];
}

export function createPhysicsWorld(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number
): PhysicsWorld {
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0, scale: 0.001 },
  });

  const bodies = elements.map((el, i) => {
    const x = el.x * canvasWidth + (el.width * canvasWidth) / 2;
    const y = el.y * canvasHeight + (el.height * canvasHeight) / 2;
    const w = el.width * canvasWidth;
    const h = el.height * canvasHeight;

    const body = Matter.Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      label: `element-${i}`,
      friction: 0.8,
      restitution: 0.05,
      frictionAir: 0.08, // 水中のような空気抵抗（高め）
      density: 0.001 + (el.width * el.height) * 0.002, // 面積に比例した密度
      render: { visible: false },
    });

    return body;
  });

  // 壁（画面下部と左右）
  const wallThickness = 60;
  const walls = [
    Matter.Bodies.rectangle(
      canvasWidth / 2,
      canvasHeight + wallThickness / 2,
      canvasWidth + 200,
      wallThickness,
      { isStatic: true, label: "wall-bottom" }
    ),
    Matter.Bodies.rectangle(
      -wallThickness / 2,
      canvasHeight / 2,
      wallThickness,
      canvasHeight * 3,
      { isStatic: true, label: "wall-left" }
    ),
    Matter.Bodies.rectangle(
      canvasWidth + wallThickness / 2,
      canvasHeight / 2,
      wallThickness,
      canvasHeight * 3,
      { isStatic: true, label: "wall-right" }
    ),
  ];

  Matter.Composite.add(engine.world, [...bodies, ...walls]);

  return { engine, bodies, walls };
}

export function triggerShake(physics: PhysicsWorld) {
  // 水中のような弱い重力
  physics.engine.gravity.y = 0.4;
  physics.engine.gravity.scale = 0.001;

  // 各パーツを時間差で解放（上から順にバラバラに）
  const sorted = physics.bodies
    .map((body, i) => ({ body, i, y: body.position.y }))
    .sort((a, b) => a.y - b.y);

  sorted.forEach(({ body }, index) => {
    setTimeout(() => {
      Matter.Body.setStatic(body, false);
      // ゆるやかなランダム初速（水中で揺れるような動き）
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 0.5,
      });
      // ゆるやかな回転
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);
    }, index * 80); // 80msずつ遅らせる
  });

  // 時間経過で重力をじわじわ強くする（沈んでいく感じ）
  let step = 0;
  const interval = setInterval(() => {
    step++;
    physics.engine.gravity.y = Math.min(0.4 + step * 0.05, 1.0);
    if (step >= 12) clearInterval(interval);
  }, 200);
}

export function resetPhysics(
  physics: PhysicsWorld,
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number
) {
  physics.bodies.forEach((body, i) => {
    const el = elements[i];
    const x = el.x * canvasWidth + (el.width * canvasWidth) / 2;
    const y = el.y * canvasHeight + (el.height * canvasHeight) / 2;

    Matter.Body.setStatic(body, true);
    Matter.Body.setPosition(body, { x, y });
    Matter.Body.setAngle(body, 0);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
  });

  physics.engine.gravity.y = 0;
}
