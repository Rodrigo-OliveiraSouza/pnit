import { useEffect, useRef } from "react";

const symbolModules = import.meta.glob(
  "../assets/floating/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    as: "url",
  }
);

const symbolUrls = Object.values(symbolModules) as string[];

const CONFIG = {
  symbolSize: 70,
  driftSpeed: 0.25,
  floatAmplitude: 14,
  rotationAmplitude: 0.1,
  edgePadding: 60,
};

type SymbolSprite = {
  img: HTMLImageElement;
  ok: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  floatSpeed: number;
  floatAmp: number;
  rotPhase: number;
  rotSpeed: number;
  rotAmp: number;
  size: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function FloatingSymbols() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || symbolUrls.length === 0) {
      return undefined;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let animationFrameId = 0;
    let symbols: SymbolSprite[] = [];
    let last = performance.now();

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    };

    const resetPositions = () => {
      const w = canvas.width;
      const h = canvas.height;
      const pad = CONFIG.edgePadding * dpr;

      symbols.forEach((symbol) => {
        symbol.x = rand(pad, w - pad);
        symbol.y = rand(pad, h - pad);
      });
    };

    const drawSymbol = (
      symbol: SymbolSprite,
      x: number,
      y: number,
      rot: number
    ) => {
      if (!symbol.ok || !symbol.img.naturalWidth) {
        return;
      }

      const size = symbol.size * dpr;
      const iw = symbol.img.naturalWidth;
      const ih = symbol.img.naturalHeight;
      const scale = Math.min(size / iw, size / ih);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(
        symbol.img,
        -(iw * scale) / 2,
        -(ih * scale) / 2,
        iw * scale,
        ih * scale
      );
      ctx.restore();
    };

    const loadImage = (src: string) =>
      new Promise<{ img: HTMLImageElement; ok: boolean }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ img, ok: true });
        img.onerror = () => resolve({ img, ok: false });
        img.src = src;
      });

    let isMounted = true;

    Promise.all(symbolUrls.map(loadImage)).then((loaded) => {
      if (!isMounted) {
        return;
      }

      symbols = loaded.map(({ img, ok }) => ({
        img,
        ok,
        x: 0,
        y: 0,
        vx: rand(-1, 1) * CONFIG.driftSpeed,
        vy: rand(-1, 1) * CONFIG.driftSpeed,
        phase: rand(0, Math.PI * 2),
        floatSpeed: rand(0.6, 1.6),
        floatAmp: rand(CONFIG.floatAmplitude * 0.6, CONFIG.floatAmplitude * 1.2),
        rotPhase: rand(0, Math.PI * 2),
        rotSpeed: rand(0.4, 1.4),
        rotAmp: rand(-CONFIG.rotationAmplitude, CONFIG.rotationAmplitude),
        size: rand(CONFIG.symbolSize * 0.85, CONFIG.symbolSize * 1.1),
      }));

      resize();
      resetPositions();

      const frame = (now: number) => {
        const dt = clamp((now - last) / 1000, 0, 0.033);
        last = now;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = canvas.width;
        const h = canvas.height;
        const pad = CONFIG.edgePadding * dpr;

        symbols.forEach((symbol) => {
          symbol.x += symbol.vx * (w * 0.02) * dt;
          symbol.y += symbol.vy * (h * 0.02) * dt;

          if (symbol.x < pad) {
            symbol.x = pad;
            symbol.vx *= -1;
          }
          if (symbol.x > w - pad) {
            symbol.x = w - pad;
            symbol.vx *= -1;
          }
          if (symbol.y < pad) {
            symbol.y = pad;
            symbol.vy *= -1;
          }
          if (symbol.y > h - pad) {
            symbol.y = h - pad;
            symbol.vy *= -1;
          }

          const fx =
            Math.sin(now / 1000 * symbol.floatSpeed + symbol.phase) *
            symbol.floatAmp *
            dpr;
          const fy =
            Math.cos(now / 1000 * (symbol.floatSpeed * 0.9) + symbol.phase) *
            symbol.floatAmp *
            dpr;
          const rot =
            Math.sin(now / 1000 * symbol.rotSpeed + symbol.rotPhase) * symbol.rotAmp;

          drawSymbol(symbol, symbol.x + fx, symbol.y + fy, rot);
        });

        animationFrameId = requestAnimationFrame(frame);
      };

      animationFrameId = requestAnimationFrame(frame);
    });

    window.addEventListener("resize", resize);
    window.addEventListener("resize", resetPositions);

    return () => {
      isMounted = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", resetPositions);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return <canvas className="floating-canvas" ref={canvasRef} />;
}
