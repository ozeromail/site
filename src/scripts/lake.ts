// Still water, as in the app's empty inbox: a horizon hairline, a soft reflection and a few streaks under it.
// Only a cause moves it: a drop that opens the water, or a touch. Rings lie on the water in perspective,
// nearer ones rounder, and light up only where a crest faces the eye. The clock sleeps while the water is calm.

import { clamp, still } from './motion';

const G = 760;
const STREAKS = [[9, 104, 0.1], [20, 84, 0.075], [35, 62, 0.055], [55, 40, 0.035]] as const;
// One surface along the horizon: a damped wave equation with banks at both ends.
const N = 101;
const DX = 3;
const C = 150;
const BANKS = 150;

interface Drop { x: number; y: number; v: number; land: number; r: number; opens: boolean }
interface Jet { x: number; y: number; v: number; base: number }
interface Wave { x: number; y: number; t: number; e: number }

const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);

export class Lake {
  private ctx: CanvasRenderingContext2D;
  private drops: Drop[] = [];
  private jets: Jet[] = [];
  private waves: Wave[] = [];
  private fh = new Float32Array(N);
  private fv = new Float32Array(N);
  private past = Array.from({ length: 20 }, () => new Float32Array(N));
  private pastAt = 0;
  private pastTick = 0;
  private moving = 0;
  private calm = 0;
  private level = 0;
  private rising = false;
  private shown = false;
  private frame = 0;
  private last = 0;
  private rgb = '47,140,255';
  // Each wave's crests, worked out once a frame.
  private crests: { r: number; amp: number; k: number; q: number }[][] = [];
  // Points of one line, reused from frame to frame.
  private xs = new Float32Array(128);
  private ys = new Float32Array(128);
  private gl = new Float32Array(128);
  private w = 0;
  private h = 0;
  /** Called once when the drop that opens the water lands. */
  onOpen: (() => void) | null = null;

  /** [horizon] is in px from the canvas top, [half] the horizon's half width. */
  constructor(private canvas: HTMLCanvasElement, private horizon: number, private half = 150) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.shown || this.level < 0.5) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (y > this.horizon - 4 && Math.abs(x - this.w / 2) < this.half) this.touch(x, y);
    });
  }

  /** The last letter left: a drop falls from above and opens the water. */
  open() {
    this.measure();
    this.reset();
    this.shown = true;
    if (still.matches) {
      this.level = 1;
      this.onOpen?.();
      this.wake();
      return;
    }
    this.level = 0;
    this.drops.push({ x: this.w / 2, y: this.horizon - 70, v: 120, land: this.horizon + 40, r: 2.8, opens: true });
    this.wake();
  }

  hide() {
    this.measure();
    this.reset();
    this.shown = false;
    this.wake();
  }

  /** A wave from under a finger at [x], [y] px. */
  touch(x: number, y: number) {
    if (still.matches) return;
    this.waves.push({ x, y: Math.max(y, this.horizon + 6), t: 0, e: 0.55 });
    this.kick(x, -22);
    this.wake();
  }

  private reset() {
    this.drops = [];
    this.jets = [];
    this.waves = [];
    this.fh.fill(0);
    this.fv.fill(0);
    this.past.forEach((p) => p.fill(0));
    this.rising = false;
    this.moving = 0;
    this.calm = 0;
  }

  private kick(x: number, amount: number) {
    const cx = this.w / 2;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const d = cx - BANKS + i * DX - x;
      this.fv[i] += amount * Math.exp(-(d * d) / (2 * 13 * 13));
      mean += this.fv[i];
    }
    mean /= N;
    for (let i = 0; i < N; i++) this.fv[i] -= mean;
  }

  private get busy() {
    return this.drops.length > 0 || this.jets.length > 0 || this.waves.length > 0 || this.rising || this.moving > 0.01;
  }

  private wake() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number) {
    this.frame = 0;
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    while (dt > 0) {
      const s = Math.min(dt, 1 / 120);
      this.step(s);
      dt -= s;
    }
    this.draw();
    if (this.busy) this.wake();
  }

  private step(dt: number) {
    const { fh, fv } = this;
    let fast = 0;
    for (let i = 0; i < N; i++) {
      const l = fh[i > 0 ? i - 1 : 1] - 2 * fh[i] + fh[i < N - 1 ? i + 1 : N - 2];
      fv[i] += ((C * C * l) / (DX * DX) - 1.5 * fv[i]) * dt;
    }
    for (let i = 0; i < N; i++) {
      fh[i] += fv[i] * dt;
      fast = Math.max(fast, Math.abs(fv[i]));
    }
    this.moving += (Math.min(1, fast / 25) - this.moving) * Math.min(1, dt * 4);
    if (++this.pastTick % 2 === 0) {
      this.pastAt = (this.pastAt + 1) % this.past.length;
      this.past[this.pastAt].set(fh);
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.v += G * dt;
      d.y += d.v * dt;
      if (d.y < d.land) continue;
      this.drops.splice(i, 1);
      const e = Math.max(0.18, Math.min(1, d.r / 6.6));
      this.waves.push({ x: d.x, y: d.land, t: 0, e });
      // A real drop throws a tiny one back up, which falls again as a smaller ring.
      if (d.r > 2) this.jets.push({ x: d.x, y: d.land, v: -Math.sqrt(2 * G * 4 * e + 40), base: d.land });
      if (d.opens) {
        this.rising = true;
        this.onOpen?.();
      }
      this.kick(d.x, -40 * e);
    }
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      j.v += G * dt;
      j.y += j.v * dt;
      if (j.v > 0 && j.y >= j.base) {
        this.jets.splice(i, 1);
        this.waves.push({ x: j.x, y: j.base, t: 0, e: 0.32 });
      }
    }
    let energy = 0;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const a = w.e * Math.exp(-w.t / 1.5);
      if (a < 0.015) this.waves.splice(i, 1);
      else energy += a;
    }
    this.calm += (Math.min(1, energy) - this.calm) * Math.min(1, dt * 2);
    if (this.rising) {
      this.level = Math.min(1, this.level + dt / 1.9);
      if (this.level >= 1) this.rising = false;
    }
  }

  private measure() {
    const dpr = devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(this.w * dpr) || this.canvas.height !== Math.round(this.h * dpr)) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = parseInt((getComputedStyle(this.canvas).getPropertyValue('--water').trim() || '#2f8cff').slice(1), 16);
    this.rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  /** Redraws at the current size and colour scheme, without waking the clock. */
  redraw() {
    this.measure();
    this.draw();
  }

  private rgba(a: number) {
    return `rgba(${this.rgb},${a.toFixed(3)})`;
  }

  private fieldAt(x: number, near: number) {
    const f = near > 0 ? this.past[(this.pastAt - Math.round(near * 12) + this.past.length * 2) % this.past.length] : this.fh;
    const u = (x - (this.w / 2 - BANKS)) / DX;
    if (u <= 0) return f[0];
    if (u >= N - 1) return f[N - 1];
    const i = Math.floor(u);
    const r = u - i;
    return f[i] * (1 - r) + f[i + 1] * r;
  }

  private surface(x: number, near: number) {
    return this.fieldAt(x, near) * (1 + 0.7 * near);
  }

  // A ring's crests, in its own perspective.
  private crestsOf(wv: Wave) {
    const spread = 64 * Math.sqrt(wv.e) * (1 - Math.exp(-wv.t / 0.85)) + 7 * wv.t;
    const depth = clamp((wv.y - this.horizon) / 220);
    const out: { r: number; amp: number; k: number; q: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const r = spread - k * (6 + 5 * wv.t);
      if (r <= 0.5) continue;
      const amp = ((wv.e * Math.exp(-wv.t / 1.5) * (1 - k * 0.32)) / Math.sqrt(1 + r / 40)) * Math.min(1, wv.t * 12);
      if (amp > 0.01) out.push({ r, amp, k: 1 + 0.8 * depth, q: 0.13 + 0.3 * depth });
    }
    return out;
  }

  private crest(x: number, y: number) {
    let lift = 0;
    for (let w = 0; w < this.waves.length; w++) {
      const wv = this.waves[w];
      for (const c of this.crests[w]) {
        const d = Math.hypot(x - wv.x, (y - wv.y) / c.q) / c.k - c.r;
        // A crest lifts the water, a trough follows it.
        lift -= 2.6 * c.amp * (Math.exp((-d * d) / 8) - 0.6 * Math.exp((-(d + 4) * (d + 4)) / 8));
      }
    }
    return lift;
  }

  // A hairline that follows the surface; a piece lights up when its slope turns it to the eye.
  private line(cx: number, y0: number, half: number, a: number, near: number) {
    if (half < 0.5) return;
    const { ctx } = this;
    const facing = 0.06 + 0.05 * near;
    const x0 = cx - half;
    const n = Math.ceil((half * 2) / 3);
    const { xs, ys, gl } = this;
    for (let i = 0; i <= n; i++) {
      xs[i] = x0 + i * 3;
      ys[i] = y0 + this.surface(xs[i], near) + this.crest(xs[i], y0);
    }
    const lit = Math.min(1, this.calm + this.moving);
    for (let i = 0; i <= n; i++) {
      const l = Math.max(0, i - 2);
      const r = Math.min(n, i + 2);
      const slope = Math.abs(ys[r] - ys[l]) / Math.max(1, xs[r] - xs[l]);
      gl[i] = Math.exp(-Math.pow((slope - facing) / 0.05, 2)) * lit;
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n; i++) gl[i] = (gl[i - 1] + gl[i] * 2 + gl[i + 1]) / 4;
    const grad = ctx.createLinearGradient(x0, 0, cx + half, 0);
    grad.addColorStop(0, this.rgba(0));
    grad.addColorStop(0.5, this.rgba(a));
    grad.addColorStop(1, this.rgba(0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) (i ? ctx.lineTo(xs[i], ys[i]) : ctx.moveTo(xs[i], ys[i]));
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = this.rgba(1);
    for (let i = 1; i <= n; i++) {
      const fade = Math.max(0, 1 - Math.abs(xs[i] - 1.5 - cx) / half);
      const alpha = ((Math.min(0.42, a * 2.6) * (gl[i] + gl[i - 1])) / 2) * Math.sqrt(fade);
      if (alpha < 0.01) continue;
      // One colour, varying alpha: no new style string per segment.
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(xs[i - 1], ys[i - 1]);
      ctx.lineTo(xs[i], ys[i]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Rings drawn on the surface: light only where a crest faces the eye, more on the near side.
  private rings() {
    const { ctx } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.rgba(1);
    for (let w = 0; w < this.waves.length; w++) {
      const wv = this.waves[w];
      const depth = clamp((wv.y - this.horizon) / 220);
      for (const cr of this.crests[w]) {
        const rx = cr.r * cr.k;
        const ry = rx * cr.q;
        const n = Math.max(24, Math.ceil(rx / 2));
        let px = 0;
        let py = 0;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = wv.x + rx * Math.cos(a);
          const y = wv.y + ry * Math.sin(a) + this.surface(x, 0.4 + 0.6 * depth);
          if (i) {
            const face = Math.pow(Math.abs(Math.sin(a - Math.PI / n)), 3);
            const side = Math.sin(a) > 0 ? 1 : 0.55;
            const alpha = 0.5 * cr.amp * face * side;
            if (alpha > 0.008) {
              ctx.globalAlpha = Math.min(0.42, alpha);
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(x, y);
              ctx.stroke();
            }
          }
          px = x;
          py = y;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // A glass drop: a hairline brighter below, a faint tone inside, drawn to a point on top.
  private drop(x: number, y: number, r: number, stretch: number) {
    const { ctx } = this;
    const point = 0.9;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const px = r * Math.sin(a) * Math.pow(Math.abs(Math.sin(a / 2)), point);
      const py = -r * Math.cos(a) * (Math.cos(a) > 0 ? 1 + 0.45 * point : 1) * stretch;
      if (i) ctx.lineTo(x + px, y + py);
      else ctx.moveTo(x + px, y + py);
    }
    ctx.closePath();
    ctx.fillStyle = this.rgba(0.13);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - r * (1 + 0.45 * point) * stretch, 0, y + r);
    g.addColorStop(0, this.rgba(0.3));
    g.addColorStop(1, this.rgba(0.95));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (r < 2.4) return;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, Math.PI * 0.62, Math.PI * 0.95);
    ctx.strokeStyle = this.rgba(0.5);
    ctx.stroke();
  }

  private draw() {
    this.crests = this.waves.map((w) => this.crestsOf(w));
    const { ctx, w, h, horizon: hz } = this;
    ctx.clearRect(0, 0, w, h);
    // A hidden canvas has no width to draw on.
    if (!this.shown || w < 16) return;
    const cx = w / 2;
    const lv = ease(this.level);
    const half = Math.min(this.half, cx - 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hz - 6, w, h - hz + 6);
    ctx.clip();
    if (lv > 0) {
      const glow = ctx.createRadialGradient(cx, hz, 0, cx, hz, half * lv + 1);
      glow.addColorStop(0, this.rgba(0.14));
      glow.addColorStop(1, this.rgba(0));
      ctx.save();
      ctx.translate(cx, hz);
      ctx.scale(1, 0.32);
      ctx.translate(-cx, -hz);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - half, hz, half * 2, (h - hz) / 0.28);
      ctx.restore();
      const scale = half / 150;
      STREAKS.forEach(([dy, len, a], i) => this.line(cx, hz + dy, len * scale * lv, a, (i + 1) / 4));
    }
    this.rings();
    for (const d of this.drops) {
      // The drop's reflection, nearer as it falls.
      const near = 1 - (d.land - d.y) / 90;
      if (near <= 0 || d.y >= d.land) continue;
      ctx.beginPath();
      ctx.ellipse(d.x, d.land + (d.land - d.y) * 0.3, d.r, d.r * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.rgba(0.22 * near);
      ctx.fill();
    }
    ctx.restore();
    if (lv > 0) this.line(cx, hz, half * lv, 0.55, 0);
    for (const d of this.drops) this.drop(d.x, d.y, d.r, 1 + Math.min(0.35, d.v / 1100));
    for (const j of this.jets) {
      ctx.beginPath();
      ctx.arc(j.x, j.y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = this.rgba(0.6);
      ctx.fill();
    }
  }
}
