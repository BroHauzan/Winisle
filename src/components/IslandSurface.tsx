import React, { useEffect, useRef, useState } from 'react';

interface SpringState {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
}

function stepSpring(s: SpringState, dt: number): boolean {
  const force = (s.target - s.value) * s.stiffness - s.velocity * s.damping;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  if (Math.abs(s.target - s.value) < 0.25 && Math.abs(s.velocity) < 1.5) {
    s.value = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

export interface IslandSurfaceProps {
  width: number;
  height: number;
  radius: number;
  shoulder: number;
  topInset: number;
  tintStyle?: 'none' | 'wash' | 'glow' | 'aura';
  tintRgb?: [number, number, number];
  auraColors?: [number, number, number][];
  voiceLevel?: number;
  nudgeTrigger?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

export const IslandSurface: React.FC<IslandSurfaceProps> = ({
  width,
  height,
  radius,
  shoulder,
  topInset,
  tintStyle = 'none',
  tintRgb = [0.2, 0.5, 0.95],
  auraColors = [
    [0.56, 0.4, 1],
    [0.27, 0.56, 1],
    [0.22, 0.84, 0.96],
  ],
  voiceLevel = 0,
  nudgeTrigger = 0,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onContextMenu,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState({ w: width, h: height, s: shoulder });

  const springsRef = useRef({
    w: { value: width, velocity: 0, target: width, stiffness: 155, damping: 18 },
    h: { value: height, velocity: 0, target: height, stiffness: 155, damping: 18 },
    r: { value: radius, velocity: 0, target: radius, stiffness: 155, damping: 24 },
    s: { value: shoulder, velocity: 0, target: shoulder, stiffness: 155, damping: 24 },
  });

  useEffect(() => {
    springsRef.current.w.target = width;
    springsRef.current.h.target = height;
    springsRef.current.r.target = radius;
    springsRef.current.s.target = shoulder;
  }, [width, height, radius, shoulder]);

  useEffect(() => {
    if (nudgeTrigger > 0) {
      springsRef.current.w.velocity += 220;
    }
  }, [nudgeTrigger]);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const sp = springsRef.current;
      stepSpring(sp.w, dt);
      stepSpring(sp.h, dt);
      stepSpring(sp.r, dt);
      stepSpring(sp.s, dt);

      const curW = Math.max(0, sp.w.value);
      const curH = Math.max(0, sp.h.value);
      const curR = Math.max(0, sp.r.value);
      const curS = Math.max(0, sp.s.value);

      setDims((prev) => {
        const nw = Math.ceil(curW);
        const nh = Math.ceil(curH);
        const ns = Math.ceil(curS);
        if (prev.w === nw && prev.h === nh && prev.s === ns) return prev;
        return { w: nw, h: nh, s: ns };
      });

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const outerW = Math.ceil(curW + 2 * curS) + 4;
        const outerH = Math.ceil(curH) + 4;
        if (canvas.width !== Math.round(outerW * dpr) || canvas.height !== Math.round(outerH * dpr)) {
          canvas.width = Math.round(outerW * dpr);
          canvas.height = Math.round(outerH * dpr);
          canvas.style.width = `${outerW}px`;
          canvas.style.height = `${outerH}px`;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.scale(dpr, dpr);
          ctx.translate(2, 0);

          const top = Math.min(topInset, curH);
          const margin = curS;
          const sh = Math.min(margin, Math.max(0, (curH - top) / 2));
          const left = margin;
          const right = left + curW;
          const hanging = Math.min(1, margin / 4);
          const rad = Math.max(0, Math.min(curR, curH - top * hanging - sh, (right - left) / 2));

          // Trace concave-shoulder notch path (ported from island.js _outline)
          const traceOutline = () => {
            ctx.beginPath();
            ctx.moveTo(left - sh, 0);
            ctx.lineTo(right + sh, 0);
            ctx.lineTo(right + sh, top);
            if (sh > 0.1) {
              ctx.arc(right + sh, top + sh, sh, -Math.PI / 2, -Math.PI, true);
            } else {
              ctx.lineTo(right, top);
            }
            ctx.lineTo(right, curH - rad);
            if (rad > 0.1) {
              ctx.arc(right - rad, curH - rad, rad, 0, Math.PI / 2, false);
              ctx.arc(left + rad, curH - rad, rad, Math.PI / 2, Math.PI, false);
            } else {
              ctx.lineTo(right, curH);
              ctx.lineTo(left, curH);
            }
            ctx.lineTo(left, top + sh);
            if (sh > 0.1) {
              ctx.arc(left - sh, top + sh, sh, 0, -Math.PI / 2, true);
            } else {
              ctx.lineTo(left, top);
            }
            ctx.closePath();
          };

          traceOutline();
          ctx.fillStyle = '#000000';
          ctx.fill();

          if (tintStyle === 'wash') {
            ctx.save();
            traceOutline();
            ctx.clip();
            const [r, g, b] = tintRgb;
            const wash = ctx.createLinearGradient(0, top, 0, curH);
            wash.addColorStop(0, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0)`);
            wash.addColorStop(1, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.42)`);
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, outerW, outerH);
            ctx.restore();
          } else if (tintStyle === 'glow') {
            ctx.save();
            traceOutline();
            ctx.clip();
            const [r, g, b] = tintRgb;
            const gRad = Math.min((right - left) * 0.36, Math.max(0, curH - top) * 1.05);
            for (const cx of [left + gRad * 0.12, right - gRad * 0.12]) {
              const rg = ctx.createRadialGradient(cx, curH + gRad * 0.2, 0, cx, curH + gRad * 0.2, gRad);
              rg.addColorStop(0, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.85)`);
              rg.addColorStop(0.4, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.38)`);
              rg.addColorStop(1, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0)`);
              ctx.fillStyle = rg;
              ctx.fillRect(0, 0, outerW, outerH);
            }
            ctx.restore();
          } else if (tintStyle === 'aura') {
            // Ported from glow.js paintRim
            ctx.save();
            traceOutline();
            ctx.clip();
            const elapsed = (now - startTime) / 1000;
            const makeFlow = (alpha: number, shift: number) => {
              const grad = ctx.createLinearGradient(left, 0, right, 0);
              const stops = 16;
              for (let i = 0; i <= stops; i++) {
                const x = i / stops;
                const at = (x + (elapsed + shift) * 0.14) * auraColors.length;
                const idx = Math.floor(at);
                const m = at - idx;
                const c1 = auraColors[idx % auraColors.length];
                const c2 = auraColors[(idx + 1) % auraColors.length];
                const rr = Math.round((c1[0] + (c2[0] - c1[0]) * m) * 255);
                const gg = Math.round((c1[1] + (c2[1] - c1[1]) * m) * 255);
                const bb = Math.round((c1[2] + (c2[2] - c1[2]) * m) * 255);
                grad.addColorStop(x, `rgba(${rr}, ${gg}, ${bb}, ${alpha})`);
              }
              return grad;
            };

            const rise = Math.min(48, Math.max(0, curH - top) * 0.55) * (0.75 + 0.5 * voiceLevel);
            const vMask = ctx.createLinearGradient(0, curH - rise, 0, curH);
            vMask.addColorStop(0, 'rgba(0,0,0,0)');
            vMask.addColorStop(1, 'rgba(255,255,255,1)');

            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = makeFlow(0.28 + 0.25 * voiceLevel, 0);
            ctx.fillRect(left, curH - rise, right - left, rise);

            // Crisp rim along sides and bottom
            ctx.beginPath();
            ctx.moveTo(left, top + sh);
            ctx.lineTo(left, curH - rad);
            ctx.arc(left + rad, curH - rad, rad, Math.PI, Math.PI / 2, true);
            ctx.lineTo(right - rad, curH);
            ctx.arc(right - rad, curH - rad, rad, Math.PI / 2, 0, true);
            ctx.lineTo(right, top + sh);
            ctx.strokeStyle = makeFlow(0.65 + 0.3 * voiceLevel, 1.8);
            ctx.lineWidth = 2.5 + voiceLevel * 2;
            ctx.stroke();
            ctx.restore();
          }

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [topInset, tintStyle, tintRgb, auraColors, voiceLevel]);

  return (
    <div
      className="relative flex justify-center select-none"
      style={{
        width: dims.w + dims.s * 2,
        height: dims.h,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
      />
      <div
        className="relative z-10 overflow-hidden"
        style={{
          width: dims.w,
          height: dims.h,
        }}
      >
        {children}
      </div>
    </div>
  );
};
