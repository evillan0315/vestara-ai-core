import { useEffect, useRef } from 'react';

export function MatrixCanvas({ paused, replayKey }: { paused: boolean; replayKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    const chars = 'VESTARA01/<>';
    let drops: number[] = [];

    const resize = () => {
      canvas.width = window.innerWidth * 0.7;
      canvas.height = window.innerHeight * 0.7;
      const cols = Math.floor(canvas.width / 14);
      drops = Array(cols)
        .fill(0)
        .map(() => Math.random() * canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      if (paused) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.fillStyle = 'rgba(5,5,7,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '11px JetBrains Mono, monospace';
      drops.forEach((y, x) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const opacity = Math.random() * 0.18 + 0.02;
        ctx.fillStyle = `rgba(0,229,255,${opacity})`;
        ctx.fillText(ch, x * 14, y);
        drops[x] = y > canvas.height + Math.random() * 100 ? 0 : y + 10 + Math.random() * 12;
      });
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [paused, replayKey]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.55]"
    />
  );
}
