// 轻量动画层：飘字、粒子、缓动函数。全部由主循环 dt 驱动，不依赖 DOM

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
export const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** 找到差异时向上飘的得分文字 */
export class Floaters {
  constructor() {
    this.items = [];
  }

  add(text, x, y, color, size = 16) {
    this.items.push({ text, x, y, color, size, t: 0, life: 950 });
  }

  update(dt) {
    for (let i = 0; i < this.items.length; i += 1) this.items[i].t += dt;
    this.items = this.items.filter((it) => it.t < it.life);
  }

  draw(c, u) {
    for (const it of this.items) {
      const p = it.t / it.life;
      const y = it.y - 52 * u * easeOutCubic(clamp01(p));
      let a = 1;
      if (p < 0.12) a = p / 0.12;
      else if (p > 0.6) a = 1 - (p - 0.6) / 0.4;
      const scale = p < 0.2 ? 0.7 + 0.3 * easeOutBack(p / 0.2) : 1;
      c.save();
      c.globalAlpha = Math.max(0, a);
      c.translate(it.x, y);
      c.scale(scale, scale);
      c.font = `bold ${it.size * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3 * u;
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.strokeText(it.text, 0, 0);
      c.fillStyle = it.color;
      c.fillText(it.text, 0, 0);
      c.restore();
    }
  }
}

/** 命中处爆开的彩色粒子 */
export class Particles {
  constructor() {
    this.items = [];
  }

  burst(x, y, color, count = 14, spread = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const sp = (0.6 + Math.random() * 0.9) * spread;
      this.items.push({
        x, y, color,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.35 * spread,
        r: (1.6 + Math.random() * 2.4),
        t: 0,
        life: 620 + Math.random() * 260,
      });
    }
  }

  update(dt) {
    const k = dt / 16.67;
    for (const p of this.items) {
      p.t += dt;
      p.x += p.vx * 9 * k;
      p.y += p.vy * 9 * k;
      p.vy += 0.16 * k;
      p.vx *= 0.985;
    }
    this.items = this.items.filter((p) => p.t < p.life);
  }

  draw(c, u) {
    for (const p of this.items) {
      const pr = p.t / p.life;
      c.save();
      c.globalAlpha = Math.max(0, 1 - pr);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r * u * (1 - pr * 0.5), 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
}
