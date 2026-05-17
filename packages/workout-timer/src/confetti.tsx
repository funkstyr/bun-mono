import { useEffect, useRef } from "react";

const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#007aff", "#af52de", "#ff9500"];

const PARTICLES_PER_CANNON = 60;
const RIGHT_DELAY_MS = 150;
const LIFETIME_SEC = 3;
const GRAVITY_PX_PER_SEC2 = 900;
const HORIZONTAL_DRAG_PER_SEC = 0.6;

type ParticleKind = "rect" | "streamer";

type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  age: number;
  lifetime: number;
  flutterPhase: number;
  flutterFreq: number;
};

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawnCannon(
  particles: Particle[],
  side: "left" | "right",
  width: number,
  height: number,
): void {
  const originX = side === "left" ? 0 : width;
  const originY = height;
  const midAngle = side === "left" ? -Math.PI / 3 : -(2 * Math.PI) / 3;
  const spread = (Math.PI / 180) * 25;

  for (let i = 0; i < PARTICLES_PER_CANNON; i++) {
    const angle = midAngle + randRange(-spread, spread);
    const speed = randRange(700, 1100);
    const kind: ParticleKind = Math.random() < 0.6 ? "rect" : "streamer";
    particles.push({
      kind,
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: randRange(0, Math.PI * 2),
      rotationSpeed: randRange(-8, 8),
      size: kind === "rect" ? randRange(6, 12) : randRange(14, 22),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      age: 0,
      lifetime: LIFETIME_SEC + randRange(-0.3, 0.5),
      flutterPhase: Math.random() * Math.PI * 2,
      flutterFreq: randRange(4, 7),
    });
  }
}

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    spawnCannon(particles, "left", width, height);

    let rightFired = false;
    let rafId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      const elapsedMs = now - startTime;

      if (!rightFired && elapsedMs >= RIGHT_DELAY_MS) {
        rightFired = true;
        spawnCannon(particles, "right", width, height);
      }

      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of particles) {
        if (p.age >= p.lifetime) continue;
        p.age += dt;
        p.vy += GRAVITY_PX_PER_SEC2 * dt;
        p.vx *= Math.pow(1 - HORIZONTAL_DRAG_PER_SEC, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotationSpeed * dt;

        const lifeFrac = p.age / p.lifetime;
        const alpha = lifeFrac < 0.7 ? 1 : Math.max(0, 1 - (lifeFrac - 0.7) / 0.3);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        if (p.kind === "rect") {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          const tumble = Math.cos(p.rotation * 2);
          ctx.scale(tumble, 1);
          const w = p.size;
          const h = p.size * 0.5;
          ctx.fillRect(-w / 2, -h / 2, w, h);
        } else {
          const flutter = Math.sin(p.age * Math.PI * 2 * p.flutterFreq + p.flutterPhase) * 6;
          ctx.translate(p.x + flutter, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-1, -p.size / 2, 2, p.size);
        }

        ctx.restore();
        if (p.age < p.lifetime) alive++;
      }

      if (alive > 0) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
