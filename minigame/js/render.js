// 绘制层：科幻风格 UI（深空蓝紫底 + 霓虹青主色 + 星点网格）
// 包含首页选关、开场倒计时、HUD（环形倒计时）、图片区、底部操作条、暂停层、结算层
// 所有可点击区域每帧注册到 this.hits，由 game.js 的 pick() 统一命中
// 卡片高度全部动态计算，按钮不会再溢出卡外

import { clamp01, easeOutCubic, easeOutBack, easeOutElastic } from './anim.js';
import { loadImage } from './level.js';

export const C = {
  bg1: '#070B1A',
  bg2: '#0C1430',
  bg3: '#170D33',
  glass: 'rgba(120,170,255,0.10)',
  glassHi: 'rgba(140,200,255,0.28)',
  ink: '#0A0F22',
  sub: '#8B93B8',
  onDark: '#EAF2FF',
  onDarkSub: 'rgba(210,225,255,0.62)',
  accent: '#22D3EE',      // 霓虹青
  accentD: '#0E9FBF',
  accent2: '#8B5CF6',     // 星云紫
  ok: '#2EE6A8',          // 荧光绿
  okD: '#17B584',
  bad: '#FF5470',
  gold: '#FFD166',
  goldD: '#E8B23C',
  lock: 'rgba(200,215,255,0.28)',
  line: 'rgba(120,180,255,0.10)',
  cardBg: 'rgba(12,19,42,0.96)',
};

function rr(c, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y);
  c.quadraticCurveTo(x + w, y, x + w, y + k);
  c.lineTo(x + w, y + h - k);
  c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  c.lineTo(x + k, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - k);
  c.lineTo(x, y + k);
  c.quadraticCurveTo(x, y, x + k, y);
  c.closePath();
}

function starPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  constructor(ctx, dpr) {
    this.ctx = ctx;
    this.dpr = dpr;
    this.W = 0;
    this.H = 0;
    this.safeTop = 0;
    this.safeBottom = 0;
    this.frames = [];
    this.rects = [];
    this.hits = [];
    this.grid = null;
    this.stars = [];
    this.thumbs = {};   // 关卡缩略图缓存 { id: Image | null(加载中) | false(失败) }
  }

  layout(W, H, safeTop = 0, safeBottom = 0) {
    this.W = W;
    this.H = H;
    this.safeTop = safeTop;
    this.safeBottom = safeBottom;
    const u = this.dpr;
    this.pad = 14 * u;
    this.hudH = 58 * u;
    this.barH = 62 * u;

    const top = safeTop + this.hudH;
    const bottomLimit = H - safeBottom - this.barH;
    const availH = bottomLimit - top - this.pad * 3;
    const frameH = Math.floor((availH - this.pad) / 2);
    const frameW = W - this.pad * 2;
    this.frames = [
      { x: this.pad, y: top + this.pad, w: frameW, h: frameH },
      { x: this.pad, y: top + this.pad * 2 + frameH, w: frameW, h: frameH },
    ];

    // 静态星点（固定种子，每帧不闪烁计算）
    const rnd = mulberry32(20260926);
    this.stars = [];
    for (let i = 0; i < 46; i += 1) {
      this.stars.push({
        x: rnd() * W,
        y: rnd() * H,
        r: (0.6 + rnd() * 1.4) * u,
        a: 0.12 + rnd() * 0.4,
        ph: rnd() * Math.PI * 2,
      });
    }
  }

  // ---------- 命中区域 ----------
  hit(id, x, y, w, h, data) {
    const item = { id, x, y, w, h, data };
    this.hits.push(item);
    return item;
  }

  pick(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }

  // ---------- 基础绘制件 ----------
  cardBox(x, y, w, h, r, fill, shadow = true) {
    const c = this.ctx;
    const u = this.dpr;
    if (!shadow) {
      rr(c, x, y + 3 * u, w, h, r);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fill();
      rr(c, x, y, w, h, r);
      c.fillStyle = fill;
      c.fill();
      return;
    }
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 16 * u;
    c.shadowOffsetY = 5 * u;
    rr(c, x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
    c.restore();
  }

  /** 科幻玻璃卡：深色底 + 霓虹描边 + 顶部高光线 */
  neonCard(x, y, w, h, r, glow = C.accent) {
    const c = this.ctx;
    const u = this.dpr;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 24 * u;
    c.shadowOffsetY = 8 * u;
    rr(c, x, y, w, h, r);
    c.fillStyle = C.cardBg;
    c.fill();
    c.restore();
    rr(c, x, y, w, h, r);
    c.strokeStyle = glow;
    c.globalAlpha = 0.5;
    c.lineWidth = 1.5 * u;
    c.stroke();
    c.globalAlpha = 1;
    // 顶部一条渐变高光
    c.save();
    rr(c, x, y, w, h, r);
    c.clip();
    const g = c.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(190,240,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x, y, w, 2 * u);
    c.restore();
  }

  /** fill 传数组时按线性渐变渲染 */
  button(id, x, y, w, h, opt) {
    const c = this.ctx;
    const u = this.dpr;
    const {
      fill = C.accent, text = '', color = '#FFFFFF',
      r = h / 2, size = 15, disabled = false, data = null, shadow = true,
    } = opt;
    c.save();
    if (shadow && !disabled) {
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 12 * u;
      c.shadowOffsetY = 4 * u;
    }
    rr(c, x, y, w, h, r);
    if (disabled) {
      c.fillStyle = 'rgba(255,255,255,0.16)';
    } else if (Array.isArray(fill)) {
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, fill[0]);
      g.addColorStop(1, fill[1]);
      c.fillStyle = g;
    } else {
      c.fillStyle = fill;
    }
    c.fill();
    c.restore();
    // 主按钮顶部内高光
    if (!disabled && Array.isArray(fill)) {
      c.save();
      rr(c, x, y, w, h, r);
      c.clip();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x, y, w, 1.5 * u);
      c.restore();
    }
    if (text) {
      c.fillStyle = disabled ? 'rgba(255,255,255,0.45)' : color;
      c.font = `bold ${size * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, x + w / 2, y + h / 2 + 1 * u);
    }
    return this.hit(id, x, y, w, h, data);
  }

  iconButton(id, x, y, size, glyph, opt = {}) {
    const c = this.ctx;
    const u = this.dpr;
    c.save();
    rr(c, x, y, size, size, size / 2);
    c.fillStyle = opt.fill || C.glass;
    c.fill();
    c.strokeStyle = C.glassHi;
    c.lineWidth = 1 * u;
    c.stroke();
    c.restore();
    c.fillStyle = opt.color || C.onDark;
    c.font = `${(opt.fontSize || 17) * u}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(glyph, x + size / 2, y + size / 2 + 1 * u);
    return this.hit(id, x, y, size, size, null);
  }

  ring(cx, cy, r, p, color, lw) {
    const c = this.ctx;
    c.save();
    c.lineCap = 'round';
    c.lineWidth = lw;
    c.strokeStyle = 'rgba(140,190,255,0.16)';
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = color;
    c.beginPath();
    c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(p));
    c.stroke();
    c.restore();
  }

  star(cx, cy, r, fill) {
    const c = this.ctx;
    starPath(c, cx, cy, r);
    c.fillStyle = fill;
    c.fill();
  }

  // ---------- 缩略图缓存 ----------
  // 首页只加载「当前可见页」的关卡图，做封面用；加载完下一帧即绘制，不阻塞
  ensureThumbs(s) {
    if (s.mode !== 'home' || !this.grid) return;
    const per = this.grid.cols * this.grid.rows;
    const start = s.page * per;
    for (let n = 0; n < per; n += 1) {
      const idx = start + n;
      if (idx >= s.levels.length) break;
      const lv = s.levels[idx];
      if (!lv || !lv.imageA) continue;
      const id = lv.id || String(idx + 1);
      if (Object.prototype.hasOwnProperty.call(this.thumbs, id)) continue;
      this.thumbs[id] = null; // 加载中占位
      loadImage(lv.imageA)
        .then((im) => { this.thumbs[id] = im; })
        .catch(() => { this.thumbs[id] = false; });
    }
  }

  /** 把图片以 cover 方式裁剪进圆角矩形 */
  coverImage(img, x, y, w, h, r) {
    const c = this.ctx;
    const sc = Math.max(w / img.width, h / img.height);
    const iw = img.width * sc;
    const ih = img.height * sc;
    const ix = x + (w - iw) / 2;
    const iy = y + (h - ih) / 2;
    c.save();
    rr(c, x, y, w, h, r);
    c.clip();
    c.drawImage(img, ix, iy, iw, ih);
    c.restore();
  }

  // ---------- 主入口 ----------
  draw(s) {
    this.hits = [];
    this.bg(s);
    if (s.mode === 'home') {
      this.ensureThumbs(s);
      this.home(s);
      return;
    }
    this.images(s);
    this.hud(s);
    this.bottom(s);
    if (s.mode === 'countdown') this.countdown(s);
    if (s.mode === 'pause') this.pause(s);
    if (s.mode === 'result') this.result(s);
    if (s.mode === 'result' || s.mode === 'pause') this.overlays(s);
  }

  bg(s) {
    const c = this.ctx;
    const u = this.dpr;
    const t = s.t / 1000;

    const g = c.createLinearGradient(0, 0, this.W * 0.32, this.H);
    g.addColorStop(0, C.bg1);
    g.addColorStop(0.55, C.bg2);
    g.addColorStop(1, C.bg3);
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.H);

    // 漂移星云（柔和径向光斑，缓慢浮动）
    c.save();
    c.globalCompositeOperation = 'lighter';
    const blob = (col, cx, cy, r, al) => {
      const rg = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = al;
      c.fillStyle = rg;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
    };
    blob(C.accent, this.W * (0.84 + 0.05 * Math.sin(t * 0.23)), this.H * (0.12 + 0.04 * Math.cos(t * 0.19)), 150 * u, 0.16);
    blob(C.accent2, this.W * (0.10 + 0.05 * Math.cos(t * 0.17)), this.H * (0.80 + 0.04 * Math.sin(t * 0.21)), 190 * u, 0.18);
    blob(C.accent, this.W * (0.52 + 0.06 * Math.sin(t * 0.14)), this.H * (0.52 + 0.05 * Math.cos(t * 0.16)), 130 * u, 0.10);
    c.restore();

    // 星点（闪烁）
    for (const st of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + st.ph);
      c.globalAlpha = st.a * (0.45 + 0.55 * tw);
      c.fillStyle = '#D6ECFF';
      c.beginPath();
      c.arc(st.x, st.y, st.r * (0.8 + 0.3 * tw), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // 暗角，聚焦中心
    const vg = c.createRadialGradient(
      this.W / 2, this.H / 2, this.H * 0.26,
      this.W / 2, this.H / 2, this.H * 0.74,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(3,5,14,0.58)');
    c.fillStyle = vg;
    c.fillRect(0, 0, this.W, this.H);
  }

  // ---------- 首页选关 ----------
  home(s) {
    const c = this.ctx;
    const u = this.dpr;
    const W = this.W;
    const top = this.safeTop;

    // 标题（霓虹）
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.save();
    c.shadowColor = C.accent;
    c.shadowBlur = 16 * u;
    c.fillStyle = C.onDark;
    c.font = `bold ${34 * u}px sans-serif`;
    c.fillText('找 不 同', W / 2, top + 60 * u);
    c.restore();
    c.fillStyle = C.onDarkSub;
    c.font = `${13 * u}px sans-serif`;
    c.fillText('在两张照片里找出所有不同', W / 2, top + 84 * u);

    // 标题下方霓虹装饰线
    const lineW = 70 * u;
    c.save();
    c.shadowColor = C.accent;
    c.shadowBlur = 10 * u;
    const lg = c.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
    lg.addColorStop(0, 'rgba(34,211,238,0)');
    lg.addColorStop(0.5, C.accent);
    lg.addColorStop(1, 'rgba(34,211,238,0)');
    c.fillStyle = lg;
    c.fillRect(W / 2 - lineW / 2, top + 96 * u, lineW, 3 * u);
    c.restore();

    // 音效开关
    const mw = 74 * u;
    this.button('mute', W - this.pad - mw, top + 12 * u, mw, 30 * u, {
      text: s.save.muted ? '♪ 音效关' : '♪ 音效开',
      fill: 'rgba(120,170,255,0.12)',
      color: s.save.muted ? C.onDarkSub : C.accent,
      size: 12,
      shadow: false,
    });

    // 星星总数胶囊
    const stars = s.save.totalStars || 0;
    const pillW = 112 * u;
    const pillH = 30 * u;
    const pillX = W / 2 - pillW / 2;
    const pillY = top + 112 * u;
    c.save();
    rr(c, pillX, pillY, pillW, pillH, pillH / 2);
    c.fillStyle = 'rgba(120,170,255,0.10)';
    c.fill();
    c.strokeStyle = 'rgba(140,200,255,0.22)';
    c.lineWidth = 1 * u;
    c.stroke();
    c.restore();
    this.star(pillX + 20 * u, pillY + pillH / 2, 8 * u, C.gold);
    c.fillStyle = C.onDark;
    c.font = `bold ${14 * u}px sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(`${stars}`, pillX + 33 * u, pillY + pillH / 2 + 1 * u);
    c.fillStyle = C.onDarkSub;
    c.font = `${11 * u}px sans-serif`;
    c.fillText('颗星', pillX + 33 * u + c.measureText(`${stars}`).width + 30 * u, pillY + pillH / 2 + 1 * u);

    // 关卡网格
    const pad = this.pad;
    const gridTop = pillY + pillH + 26 * u;
    const gridBottom = this.H - this.safeBottom - 74 * u;
    const cols = 3;
    const gap = 12 * u;
    const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
    const rows = Math.max(1, Math.floor((gridBottom - gridTop + gap) / (cellW * 0.82 + gap)));
    const cellH = Math.min(cellW * 0.86, (gridBottom - gridTop - gap * (rows - 1)) / rows);
    this.grid = { cellW, cellH, cols, rows, gap, gridTop };

    const perPage = cols * rows;
    const total = s.levels.length;
    const maxPage = Math.max(1, Math.ceil(total / perPage));
    s.maxPage = maxPage;
    const start = s.page * perPage;

    for (let n = 0; n < perPage; n += 1) {
      const idx = start + n;
      if (idx >= total) break;
      const r = Math.floor(n / cols);
      const col = n % cols;
      const x = pad + col * (cellW + gap);
      const y = gridTop + r * (cellH + gap);
      const lv = s.levels[idx] || {};
      const lid = lv.id || String(idx + 1);
      const unlocked = idx < s.save.unlocked;
      const got = (s.save.levels[lid] && s.save.levels[lid].stars) || 0;

      // 卡片底：优先画关卡缩略图封面，没有则降级为渐变底
      const im = this.thumbs[lid];
      if (im && im.width) {
        this.coverImage(im, x, y, cellW, cellH, 16 * u);
        c.save();
        rr(c, x, y, cellW, cellH, 16 * u);
        c.clip();
        const og = c.createLinearGradient(x, y, x, y + cellH);
        og.addColorStop(0, 'rgba(7,11,26,0.12)');
        og.addColorStop(0.5, 'rgba(7,11,26,0.30)');
        og.addColorStop(1, 'rgba(7,11,26,0.78)');
        c.fillStyle = og;
        c.fillRect(x, y, cellW, cellH);
        c.restore();
      } else {
        c.save();
        rr(c, x, y, cellW, cellH, 16 * u);
        c.fillStyle = unlocked ? 'rgba(24,38,74,0.72)' : 'rgba(16,22,44,0.55)';
        c.fill();
        c.restore();
      }

      // 玻璃高光（左上斜向）
      c.save();
      rr(c, x, y, cellW, cellH, 16 * u);
      c.clip();
      const sh = c.createLinearGradient(x, y, x + cellW * 0.7, y + cellH * 0.5);
      sh.addColorStop(0, 'rgba(255,255,255,0.10)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sh;
      c.fillRect(x, y, cellW, cellH);
      c.restore();

      // 霓虹描边（金色=已通关，青色=未通关，灰=锁定）
      c.save();
      rr(c, x, y, cellW, cellH, 16 * u);
      c.strokeStyle = !unlocked
        ? 'rgba(150,175,235,0.16)'
        : got > 0 ? 'rgba(255,209,102,0.62)' : 'rgba(34,211,238,0.5)';
      c.lineWidth = got > 0 || unlocked ? 1.8 * u : 1 * u;
      c.stroke();
      c.restore();

      c.textAlign = 'center';
      c.textBaseline = 'middle';

      if (unlocked) {
        // 关卡号徽章（左上，玻璃胶囊）
        const nbW = 34 * u;
        const nbH = 22 * u;
        const nbX = x + 10 * u;
        const nbY = y + 10 * u;
        c.save();
        rr(c, nbX, nbY, nbW, nbH, nbH / 2);
        c.fillStyle = 'rgba(8,14,32,0.66)';
        c.fill();
        c.strokeStyle = got > 0 ? 'rgba(255,209,102,0.7)' : 'rgba(34,211,238,0.7)';
        c.lineWidth = 1 * u;
        c.stroke();
        c.restore();
        c.fillStyle = got > 0 ? C.gold : C.accent;
        c.font = `bold ${13 * u}px sans-serif`;
        c.fillText(String(idx + 1), nbX + nbW / 2, nbY + nbH / 2 + 1 * u);

        // 底部三星
        const sr = 7.5 * u;
        const totalW = sr * 2 * 3 + 9 * u * 2;
        const sx = x + cellW / 2 - totalW / 2 + sr;
        const sy = y + cellH - 18 * u;
        for (let k = 0; k < 3; k += 1) {
          this.star(sx + k * (sr * 2 + 9 * u), sy, sr, k < got ? C.gold : 'rgba(255,255,255,0.16)');
        }
      } else {
        // 锁定遮罩
        c.save();
        rr(c, x, y, cellW, cellH, 16 * u);
        c.fillStyle = 'rgba(7,11,24,0.5)';
        c.fill();
        c.restore();
        c.fillStyle = C.lock;
        c.font = `${22 * u}px sans-serif`;
        c.textBaseline = 'middle';
        c.fillText('🔒', x + cellW / 2, y + cellH * 0.42);
        c.font = `${12 * u}px sans-serif`;
        c.fillText('未解锁', x + cellW / 2, y + cellH * 0.62);
      }
      this.hit('level', x, y, cellW, cellH, idx);
    }

    // 翻页
    const navY = this.H - this.safeBottom - 60 * u;
    const bw = 96 * u;
    const bh = 40 * u;
    if (maxPage > 1) {
      this.button('page-prev', W / 2 - bw - 8 * u, navY, bw, bh,
        { text: '上一页', fill: 'rgba(120,170,255,0.12)', size: 13, r: bh / 2, shadow: false });
      this.button('page-next', W / 2 + 8 * u, navY, bw, bh,
        { text: '下一页', fill: 'rgba(120,170,255,0.12)', size: 13, r: bh / 2, shadow: false });
      c.fillStyle = C.onDarkSub;
      c.font = `${12 * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${s.page + 1} / ${maxPage}`, W / 2, navY - 16 * u);
    }
  }

  // ---------- 顶部 HUD ----------
  hud(s) {
    const c = this.ctx;
    const u = this.dpr;
    const y = this.safeTop + 4 * u;
    const h = this.hudH - 8 * u;
    const bs = 38 * u;

    this.iconButton('back', this.pad, y + (h - bs) / 2, bs, '‹', { fontSize: 22 });

    // 关卡标题
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = C.onDarkSub;
    c.font = `${11 * u}px sans-serif`;
    c.fillText(`第 ${s.levelIdx + 1} 关`, this.pad + bs + 12 * u, y + h * 0.34);
    c.fillStyle = C.onDark;
    c.font = `bold ${16 * u}px sans-serif`;
    let title = s.title || '找不同';
    const maxW = this.W - this.pad * 2 - bs * 2 - 90 * u;
    while (c.measureText(title).width > maxW && title.length > 2) {
      title = title.slice(0, -1);
    }
    if (title !== s.title) title = title.slice(0, -1) + '…';
    c.fillText(title, this.pad + bs + 12 * u, y + h * 0.66);

    // 环形倒计时
    const rr2 = 26 * u;
    const cx = this.W - this.pad - bs - 14 * u - rr2;
    const cy = y + h / 2;
    const p = s.timeLeft / s.timeLimit;
    let col = C.accent;
    if (p <= 0.2) col = C.bad; else if (p <= 0.45) col = C.gold;
    if (p <= 0.2) {
      const blink = 0.65 + 0.35 * Math.abs(Math.sin(s.t / 200));
      c.save();
      c.globalAlpha = blink;
      this.ring(cx, cy, rr2, p, col, 4.5 * u);
      c.restore();
    } else {
      this.ring(cx, cy, rr2, p, col, 4.5 * u);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = p <= 0.2 ? C.bad : C.onDark;
    c.font = `bold ${15 * u}px sans-serif`;
    c.fillText(String(Math.ceil(Math.max(0, s.timeLeft))), cx, cy - 2 * u);
    c.fillStyle = C.onDarkSub;
    c.font = `${9 * u}px sans-serif`;
    c.fillText('秒', cx, cy + 12 * u);

    this.iconButton('pause', this.W - this.pad - bs, y + (h - bs) / 2, bs, '❚❚', { fontSize: 13 });
  }

  // ---------- 图片区 ----------
  images(s) {
    const c = this.ctx;
    const u = this.dpr;
    const imgs = [s.imgA, s.imgB];
    const labels = ['原图', '找不同'];
    this.rects = [];

    for (let i = 0; i < 2; i += 1) {
      const f = this.frames[i];
      this.cardBox(f.x, f.y, f.w, f.h, 14 * u, '#0C1734', false);
      c.save();
      rr(c, f.x, f.y, f.w, f.h, 14 * u);
      c.strokeStyle = 'rgba(34,211,238,0.30)';
      c.lineWidth = 1.5 * u;
      c.stroke();
      c.restore();

      const img = imgs[i];
      if (!img || !img.width) {
        c.fillStyle = C.onDarkSub;
        c.font = `${13 * u}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('加载中…', f.x + f.w / 2, f.y + f.h / 2);
        continue;
      }
      const scale = Math.min(f.w / img.width, f.h / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const r = {
        x: f.x + (f.w - w) / 2,
        y: f.y + (f.h - h) / 2,
        w, h,
      };
      this.rects[i] = r;

      c.save();
      rr(c, r.x, r.y, r.w, r.h, 10 * u);
      c.clip();
      c.drawImage(img, r.x, r.y, r.w, r.h);
      c.restore();

      // 角标
      c.save();
      rr(c, r.x + 8 * u, r.y + 8 * u, 52 * u, 22 * u, 11 * u);
      c.fillStyle = 'rgba(8,14,32,0.72)';
      c.fill();
      c.strokeStyle = 'rgba(34,211,238,0.5)';
      c.lineWidth = 1 * u;
      c.stroke();
      c.restore();
      c.fillStyle = C.accent;
      c.font = `bold ${11 * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(labels[i], r.x + 8 * u + 26 * u, r.y + 19 * u);

      // 已找到的圈
      for (let k = 0; k < s.diffs.length; k += 1) {
        if (!s.found[k]) continue;
        const age = s.t - (s.foundAt[k] || 0);
        const pr = clamp01(age / 400);
        const grow = 1.34 - 0.34 * easeOutBack(pr);
        const g = this.geom(r, s.diffs[k]);
        const rad = g.r * grow;

        if (pr < 1) {
          c.save();
          c.globalAlpha = 1 - pr;
          c.strokeStyle = '#FFFFFF';
          c.lineWidth = 3 * u;
          c.beginPath();
          c.arc(g.cx, g.cy, rad * (1 + 0.55 * pr), 0, Math.PI * 2);
          c.stroke();
          c.restore();
        }
        c.save();
        c.shadowColor = C.ok;
        c.shadowBlur = 8 * u;
        c.strokeStyle = C.ok;
        c.lineWidth = 3.2 * u;
        c.beginPath();
        c.arc(g.cx, g.cy, rad, 0, Math.PI * 2);
        c.stroke();
        c.restore();

        // 柔光填充（命中瞬间一闪即灭）
        const fl = clamp01(1 - age / 420);
        if (fl > 0) {
          c.save();
          c.globalAlpha = 0.22 * fl;
          c.fillStyle = C.ok;
          c.beginPath();
          c.arc(g.cx, g.cy, rad, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }

        // 序号徽章
        const bx = g.cx - rad * 0.72;
        const by = g.cy - rad * 0.72;
        c.save();
        c.beginPath();
        c.arc(bx, by, 12 * u, 0, Math.PI * 2);
        c.fillStyle = C.ok;
        c.fill();
        c.restore();
        c.fillStyle = '#FFFFFF';
        c.font = `bold ${12 * u}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(k + 1), bx, by + 1 * u);
      }

      // 提示圈：呼吸
      if (s.hintIndex >= 0 && !s.found[s.hintIndex]) {
        const blink = 0.35 + 0.65 * Math.abs(Math.sin(s.t / 300));
        const g = this.geom(r, s.diffs[s.hintIndex]);
        c.save();
        c.globalAlpha = blink;
        c.strokeStyle = C.gold;
        c.lineWidth = 4.5 * u;
        c.setLineDash([9 * u, 7 * u]);
        c.beginPath();
        c.arc(g.cx, g.cy, g.r * 1.12, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }

      // 点错的 X
      if (s.miss && s.miss.frame === i) {
        const a = 1 - clamp01(s.miss.age / 520);
        const g = { cx: s.miss.px, cy: s.miss.py, r: 15 * u };
        c.save();
        c.globalAlpha = a;
        c.strokeStyle = C.bad;
        c.lineWidth = 4.5 * u;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(g.cx - g.r, g.cy - g.r);
        c.lineTo(g.cx + g.r, g.cy + g.r);
        c.moveTo(g.cx + g.r, g.cy - g.r);
        c.lineTo(g.cx - g.r, g.cy + g.r);
        c.stroke();
        c.restore();
      }
    }

    s.particles.draw(c, u);
    s.floaters.draw(c, u);
  }

  geom(rect, d) {
    return {
      cx: rect.x + d.x * rect.w,
      cy: rect.y + d.y * rect.h,
      r: d.r * Math.min(rect.w, rect.h),
    };
  }

  // ---------- 底部操作条 ----------
  bottom(s) {
    const c = this.ctx;
    const u = this.dpr;
    const y = this.H - this.safeBottom - this.barH + 6 * u;
    const h = 44 * u;
    const hintW = 116 * u;

    this.button('hint', this.pad, y, hintW, h, {
      text: s.hints > 0 ? `提示 ${s.hints}` : '看广告得提示',
      fill: s.hints > 0 ? [C.accent, C.accent2] : [C.accent2, '#6D28D9'],
      size: 14,
      r: h / 2,
    });

    // 进度点
    const total = s.diffs.length;
    const done = s.found.filter(Boolean).length;
    const dotR = 5 * u;
    const gapD = 15 * u;
    const dotsW = total * gapD;
    const startX = this.pad + hintW + 18 * u;
    const cy = y + h / 2;
    for (let i = 0; i < total; i += 1) {
      const dx = startX + i * gapD + dotR;
      c.beginPath();
      c.arc(dx, cy, dotR, 0, Math.PI * 2);
      c.fillStyle = s.found[i] ? C.ok : 'rgba(180,210,255,0.24)';
      c.fill();
    }
    c.fillStyle = C.onDarkSub;
    c.font = `${11 * u}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`${done}/${total}`, startX + dotsW / 2 - dotR, cy + 15 * u);

    // 分数
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillStyle = C.onDark;
    c.font = `bold ${19 * u}px sans-serif`;
    c.fillText(String(s.score), this.W - this.pad, cy - 3 * u);
    c.fillStyle = C.onDarkSub;
    c.font = `${10 * u}px sans-serif`;
    c.fillText('分', this.W - this.pad, cy + 13 * u);

    // 连击
    if (s.combo >= 2) {
      const pop = clamp01((s.t - s.comboAt) / 320);
      const sc = 0.6 + 0.4 * easeOutElastic(pop);
      c.save();
      c.translate(this.W - this.pad - 52 * u, cy);
      c.scale(sc, sc);
      c.shadowColor = C.accent;
      c.shadowBlur = 8 * u;
      c.fillStyle = C.accent;
      c.font = `bold ${13 * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`COMBO ×${s.combo}`, 0, 0);
      c.restore();
    }
  }

  // ---------- 开场倒计时 ----------
  countdown(s) {
    const c = this.ctx;
    const u = this.dpr;
    c.save();
    c.fillStyle = 'rgba(6,9,22,0.74)';
    c.fillRect(0, 0, this.W, this.H);
    c.restore();

    const n = Math.ceil(s.countdown);
    const frac = s.countdown - Math.floor(s.countdown);
    const label = n <= 0 ? 'GO!' : String(n);
    const grow = 1.5 - 0.5 * easeOutCubic(1 - frac);
    const alpha = clamp01(frac * 2.2);

    c.save();
    c.globalAlpha = 0.35 + 0.65 * alpha;
    c.translate(this.W / 2, this.H / 2);
    c.scale(grow, grow);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `bold ${64 * u}px sans-serif`;
    c.lineWidth = 6 * u;
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.strokeText(label, 0, 0);
    c.shadowColor = n <= 0 ? C.ok : C.accent;
    c.shadowBlur = 18 * u;
    c.fillStyle = n <= 0 ? C.ok : C.accent;
    c.fillText(label, 0, 0);
    c.restore();

    c.fillStyle = C.onDarkSub;
    c.font = `${13 * u}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`找出 ${s.diffs.length} 处不同`, this.W / 2, this.H / 2 + 62 * u);
  }

  // ---------- 暂停 ----------
  pause(s) {
    const c = this.ctx;
    const u = this.dpr;
    c.save();
    c.fillStyle = 'rgba(6,9,22,0.80)';
    c.fillRect(0, 0, this.W, this.H);
    c.restore();

    const cw = Math.min(this.W - this.pad * 4, 300 * u);
    const bh = 44 * u;
    const gapB = 11 * u;
    const ch = 76 * u + (bh + gapB) * 3 + 22 * u;   // 标题区 + 三按钮 + 底边距
    const x = this.W / 2 - cw / 2;
    const y = this.H / 2 - ch / 2;
    this.neonCard(x, y, cw, ch, 20 * u);

    c.fillStyle = C.onDark;
    c.font = `bold ${20 * u}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('已暂停', this.W / 2, y + 38 * u);
    c.fillStyle = C.onDarkSub;
    c.font = `${13 * u}px sans-serif`;
    c.fillText(`已找到 ${s.found.filter(Boolean).length} / ${s.diffs.length}`, this.W / 2, y + 62 * u);

    const bw = cw - 44 * u;
    this.button('resume', x + 22 * u, y + 76 * u, bw, bh,
      { text: '继续游戏', fill: [C.accent, C.accent2], size: 15 });
    this.button('retry', x + 22 * u, y + 76 * u + bh + gapB, bw, bh,
      { text: '重新开始', fill: 'rgba(120,170,255,0.12)', color: C.onDark, size: 15 });
    this.button('quit', x + 22 * u, y + 76 * u + (bh + gapB) * 2, bw, bh,
      { text: '返回选关', fill: 'rgba(120,170,255,0.10)', color: C.onDarkSub, size: 14 });
  }

  // ---------- 结算 ----------
  result(s) {
    const c = this.ctx;
    const u = this.dpr;
    c.save();
    c.fillStyle = 'rgba(6,9,22,0.82)';
    c.fillRect(0, 0, this.W, this.H);
    c.restore();

    const win = s.resultType === 'win';
    const hasRevive = !win && s.canRevive;

    // ---- 动态高度：从内容自上而下累加，按钮完整落在卡内 ----
    const bh = 46 * u;        // 主按钮高
    const smH = 36 * u;       // 次按钮高
    const gapB = 10 * u;      // 按钮间距
    const headH = 64 * u;     // 标题彩带
    const starZone = 78 * u;  // 星级区
    const rowsH = 4 * 24 * u; // 数据行
    const scoreZone = 62 * u; // 得分区
    const btnZone = bh + gapB + smH + (hasRevive ? bh + gapB : 0);
    const contentH = headH + starZone + rowsH + scoreZone + btnZone + 24 * u;
    const avail = this.H - this.safeTop - this.safeBottom - 24 * u;
    const ch = Math.min(contentH, avail);
    const cw = Math.min(this.W - this.pad * 4, 320 * u);
    const x = this.W / 2 - cw / 2;
    const y = this.H / 2 - ch / 2;

    this.neonCard(x, y, cw, ch, 22 * u, win ? C.ok : C.bad);

    // 顶部渐变标题带
    c.save();
    rr(c, x, y, cw, ch, 22 * u);
    c.clip();
    const g = c.createLinearGradient(x, y, x + cw, y + headH);
    if (win) {
      g.addColorStop(0, '#0FA97C');
      g.addColorStop(1, '#2EE6A8');
    } else {
      g.addColorStop(0, '#7A3BFF');
      g.addColorStop(1, '#FF5470');
    }
    c.fillStyle = g;
    c.fillRect(x, y, cw, headH);
    // 标题带上的扫描线
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(x, y + headH - 2 * u, cw, 1.5 * u);
    c.restore();

    c.fillStyle = '#FFFFFF';
    c.font = `bold ${22 * u}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(win ? '全部找到！' : '时间到', this.W / 2, y + headH / 2 + 1 * u);

    // 星级（逐个弹出）
    const sr = 20 * u;
    const sy = y + headH + 42 * u;
    const shown = win ? s.resultStars : 0;
    for (let i = 0; i < 3; i += 1) {
      const delay = 180 + i * 200;
      const age = s.resultAge - delay;
      let sc2 = 1;
      if (age < 0) sc2 = 0;
      else sc2 = 0.4 + 0.6 * easeOutBack(clamp01(age / 420));
      if (sc2 <= 0) continue;
      const sx = this.W / 2 + (i - 1) * (sr * 2 + 14 * u);
      c.save();
      c.translate(sx, sy);
      c.scale(sc2, sc2);
      if (i < shown) {
        c.shadowColor = C.gold;
        c.shadowBlur = 12 * u;
      }
      starPath(c, 0, 0, sr);
      c.fillStyle = i < shown ? C.gold : 'rgba(150,180,240,0.14)';
      c.fill();
      if (i < shown) {
        c.strokeStyle = C.goldD;
        c.lineWidth = 1.5 * u;
        c.stroke();
      }
      c.restore();
    }

    if (!win) {
      c.fillStyle = C.onDarkSub;
      c.font = `${12 * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`还差 ${s.diffs.length - s.found.filter(Boolean).length} 处`, this.W / 2, sy + 2 * u);
    }

    // 数据行
    const rows = [
      ['用时', `${s.elapsed.toFixed(1)} 秒`],
      ['找到', `${s.found.filter(Boolean).length} / ${s.diffs.length}`],
      ['最高连击', `×${s.maxCombo}`],
      ['提示消耗', `${s.hintsUsed} 次`],
    ];
    let ry = y + headH + starZone + 6 * u;
    for (const [k, v] of rows) {
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = C.onDarkSub;
      c.font = `${13 * u}px sans-serif`;
      c.fillText(k, x + 30 * u, ry);
      c.textAlign = 'right';
      c.fillStyle = C.onDark;
      c.font = `bold ${13 * u}px sans-serif`;
      c.fillText(v, x + cw - 30 * u, ry);
      ry += 24 * u;
    }

    // 得分
    c.textAlign = 'center';
    c.fillStyle = C.onDarkSub;
    c.font = `${11 * u}px sans-serif`;
    c.textBaseline = 'middle';
    c.fillText('本关得分', this.W / 2, ry + 2 * u);
    c.save();
    c.shadowColor = win ? C.ok : C.accent2;
    c.shadowBlur = 12 * u;
    c.fillStyle = win ? C.ok : C.accent;
    c.font = `bold ${30 * u}px sans-serif`;
    c.fillText(String(s.score), this.W / 2, ry + 28 * u);
    c.restore();

    if (s.newRecord) {
      const bw2 = 74 * u;
      const bh2 = 22 * u;
      const bx2 = this.W / 2 + 42 * u;
      const by2 = ry + 28 * u - bh2 / 2;
      c.save();
      rr(c, bx2, by2, bw2, bh2, bh2 / 2);
      c.fillStyle = C.accent2;
      c.fill();
      c.restore();
      c.fillStyle = '#FFFFFF';
      c.font = `bold ${11 * u}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('新纪录', bx2 + bw2 / 2, by2 + bh2 / 2 + 1 * u);
    }

    // ---- 按钮区：从卡片底边向上排，永远在卡内 ----
    const bw = cw - 44 * u;
    const smY = y + ch - 24 * u - smH;
    const mainY = smY - gapB - bh;
    const hasNext = s.levelIdx + 1 < s.levels.length;

    if (hasRevive) {
      this.button('revive', x + 22 * u, mainY - gapB - bh, bw, bh,
        { text: '看广告 +30 秒', fill: [C.accent, C.accent2], size: 15 });
    }
    this.button(win && hasNext ? 'next' : 'retry', x + 22 * u, mainY, bw, bh, {
      text: win ? (hasNext ? '下一关' : '再玩一次') : '再试一次',
      fill: win ? [C.ok, '#0FA97C'] : [C.accent, C.accent2],
      size: 15,
    });
    this.button('home-btn', x + 22 * u, smY, bw, smH,
      { text: '返回选关', fill: 'rgba(120,170,255,0.10)', color: C.onDarkSub, size: 14, shadow: false });
  }

  // ---------- 浮层：toast ----------
  overlays(s) {
    const c = this.ctx;
    const u = this.dpr;
    if (s.toast) {
      const a = clamp01(s.toast.age / 260) * (1 - clamp01((s.toast.age - 1400) / 500));
      if (a > 0.01) {
        c.save();
        c.globalAlpha = a;
        c.font = `${13 * u}px sans-serif`;
        const tw = Math.max(140 * u, c.measureText(s.toast.text).width + 44 * u);
        const tx = this.W / 2 - tw / 2;
        const ty = this.H - this.safeBottom - 130 * u;
        rr(c, tx, ty, tw, 34 * u, 17 * u);
        c.fillStyle = 'rgba(10,16,36,0.92)';
        c.fill();
        c.strokeStyle = 'rgba(34,211,238,0.4)';
        c.lineWidth = 1 * u;
        c.stroke();
        c.fillStyle = C.onDark;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(s.toast.text, this.W / 2, ty + 17 * u);
        c.restore();
      }
    }
  }
}
