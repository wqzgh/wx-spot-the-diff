// 微信小游戏入口：状态机 home → countdown → playing → result
// 计分：基础分 + 连击倍率 + 剩余时间奖励 + 未用提示奖励；点错扣分扣时

import { Renderer } from './js/render.js';
import { loadImage, hitTest } from './js/level.js';
import { LEVELS } from './levels/index.js';
import { save as store, record, setMuted as persistMuted } from './js/store.js';
import { Floaters, Particles } from './js/anim.js';
import * as sound from './js/sound.js';

const AD_UNIT_ID = 'adunit-xxxxxxxxxxxxxxxx'; // 小游戏后台申请后替换
const BASE_SCORE = 100;
const MISS_PENALTY = 30;
const MISS_TIME = 2;
const HINT_BONUS = 50;
const TIME_BONUS = 10;
const REVIVE_TIME = 30;

const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const dpr = sys.pixelRatio || 1;
canvas.width = Math.floor(sys.windowWidth * dpr);
canvas.height = Math.floor(sys.windowHeight * dpr);
const safeTop = ((sys.safeArea && sys.safeArea.top) || 0) * dpr;
const safeBottom = canvas.height - ((sys.safeArea && sys.safeArea.bottom) || sys.windowHeight) * dpr;

const renderer = new Renderer(ctx, dpr);
renderer.layout(canvas.width, canvas.height, safeTop, safeBottom);

const S = {
  mode: 'home',              // home | countdown | playing | pause | result
  levels: LEVELS,
  save: store,
  page: 0,
  maxPage: 1,

  levelIdx: 0,
  levelId: '',
  title: '',
  diffs: [],
  found: [],
  foundAt: [],

  hints: 3,
  hintsUsed: 0,
  misses: 0,
  combo: 0,
  maxCombo: 0,
  comboAt: 0,
  score: 0,

  timeLimit: 90,
  timeLeft: 90,
  elapsed: 0,

  imgA: null,
  imgB: null,
  hintIndex: -1,
  t: 0,
  miss: null,

  countdown: 3,
  cdLast: 0,
  resultType: 'win',
  resultStars: 0,
  resultAge: 0,
  newRecord: false,
  canRevive: true,
  revived: false,
  adShowing: false,
  toast: null,

  particles: new Particles(),
  floaters: new Floaters(),
};

// ---------- 通用反馈 ----------
sound.setMuted(store.muted);   // 恢复上次的音效开关状态

function toast(text) {
  S.toast = { text, age: 0 };
}

function buzz(type) {
  try {
    wx.vibrateShort({ type: type || 'light' });
  } catch (e) {
    // 部分机型不支持，静默降级
  }
}

// ---------- 关卡流程 ----------
function startLevel(idx) {
  if (idx < 0 || idx >= LEVELS.length) return;
  const lv = LEVELS[idx];
  S.levelIdx = idx;
  S.levelId = lv.id || String(idx + 1);
  S.title = lv.title || '找不同';
  S.diffs = lv.diffs || [];
  S.found = S.diffs.map(() => false);
  S.foundAt = S.diffs.map(() => 0);
  S.hints = lv.hintLimit === undefined ? 3 : lv.hintLimit;
  S.hintsUsed = 0;
  S.timeLimit = lv.timeLimit || 90;
  S.timeLeft = S.timeLimit;
  S.elapsed = 0;
  S.score = 0;
  S.combo = 0;
  S.maxCombo = 0;
  S.misses = 0;
  S.hintIndex = -1;
  S.miss = null;
  S.resultAge = 0;
  S.resultStars = 0;
  S.newRecord = false;
  S.canRevive = true;
  S.revived = false;
  S.countdown = 3;
  S.cdLast = 0;
  S.mode = 'countdown';
  S.imgA = null;
  S.imgB = null;
  S.particles.items.length = 0;
  S.floaters.items.length = 0;

  Promise.all([loadImage(lv.imageA), loadImage(lv.imageB)])
    .then(([a, b]) => {
      S.imgA = a;
      S.imgB = b;
    })
    .catch((err) => {
      console.error(err);
      toast('图片加载失败，请检查资源');
    });
}

function toHome() {
  S.mode = 'home';
  if (renderer.grid) {
    const per = renderer.grid.cols * renderer.grid.rows;
    const lastPage = Math.max(0, Math.ceil(LEVELS.length / per) - 1);
    S.page = Math.min(Math.floor(S.levelIdx / per), lastPage);
  }
}

function finish(type) {
  S.mode = 'result';
  S.resultType = type;
  S.resultAge = 0;
  if (type === 'win') sound.win(); else sound.lose();
  if (type !== 'win') {
    S.resultStars = 0;
    return;
  }
  S.score += Math.floor(S.timeLeft) * TIME_BONUS;   // 剩余时间奖励
  S.score += S.hints * HINT_BONUS;                  // 未用提示奖励
  let stars = 1;
  if (S.misses === 0) stars += 1;
  if (S.hintsUsed === 0) stars += 1;
  S.resultStars = stars;
  const r = record(S.levelIdx, S.levelId, {
    score: S.score, stars, time: S.elapsed,
  });
  S.newRecord = r.improved;

  // 通关撒花：顶部多色粒子爆开
  const Wc = canvas.width;
  const Hc = canvas.height;
  const conf = ['#FFD166', '#2EE6A8', '#22D3EE', '#8B5CF6', '#FF7AB6'];
  for (let k = 0; k < 7; k += 1) {
    S.particles.burst(
      Wc * (0.1 + 0.13 * k), Hc * 0.3, conf[k % conf.length], 26, 2.6,
    );
  }
}

// ---------- 提示与广告 ----------
let rewardedAd = null;
let adReward = '';

function initAd() {
  if (!wx.createRewardedVideoAd) return;
  try {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
    rewardedAd.onClose((res) => {
      S.adShowing = false;
      const ok = res && res.isEnded;
      if (ok && adReward === 'hint') {
        S.hints += 1;
        toast('获得 1 次提示');
      } else if (ok && adReward === 'revive') {
        S.revived = true;
        S.canRevive = false;
        S.timeLeft += REVIVE_TIME;
        S.mode = 'playing';
        toast(`复活成功，+${REVIVE_TIME} 秒`);
      }
      adReward = '';
    });
  } catch (e) {
    console.warn('激励视频初始化失败', e);
  }
}

function showAd(reason) {
  if (!rewardedAd) {
    toast('广告暂不可用');
    return;
  }
  adReward = reason;
  S.adShowing = true;
  rewardedAd.show().catch(() => {
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => {
      S.adShowing = false;
      toast('广告加载失败，稍后再试');
    });
  });
}

function useHint() {
  if (S.mode !== 'playing') return;
  if (S.hints > 0) {
    S.hints -= 1;
    S.hintsUsed += 1;
    const idx = pickUnfound();
    if (idx >= 0) {
      S.hintIndex = idx;
      sound.hint();
      toast('已圈出一处，快找找');
    }
    return;
  }
  showAd('hint');
}

function pickUnfound() {
  const left = [];
  for (let i = 0; i < S.diffs.length; i += 1) {
    if (!S.found[i]) left.push(i);
  }
  if (!left.length) return -1;
  return left[Math.floor(Math.random() * left.length)];
}

// ---------- 触摸 ----------
wx.onTouchStart((e) => {
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  const p = { x: touch.clientX * dpr, y: touch.clientY * dpr };

  const h = renderer.pick(p.x, p.y);
  if (h) {
    if (h.id !== 'mute') sound.click();
    onButton(h.id, h.data);
    return;
  }
  if (S.mode === 'playing') onImageTap(p);
});

function onButton(id, data) {
  switch (id) {
    case 'level':
      if (data >= store.unlocked) {
        toast('先通关前一关才能解锁');
        return;
      }
      startLevel(data);
      return;
    case 'page-prev':
      S.page = Math.max(0, S.page - 1);
      return;
    case 'page-next':
      S.page = Math.min(S.maxPage - 1, S.page + 1);
      return;
    case 'back':
      toHome();
      return;
    case 'pause':
      if (S.mode === 'playing') S.mode = 'pause';
      return;
    case 'hint':
      useHint();
      return;
    case 'resume':
      if (S.mode === 'pause') S.mode = 'playing';
      return;
    case 'retry':
      startLevel(S.levelIdx);
      return;
    case 'quit':
    case 'home-btn':
      toHome();
      return;
    case 'next':
      startLevel(S.levelIdx + 1);
      return;
    case 'mute':
      store.muted = !store.muted;
      persistMuted(store.muted);
      sound.setMuted(store.muted);
      toast(store.muted ? '音效已关闭' : '音效已开启');
      return;
    case 'revive':
      showAd('revive');
      return;
    default:
      return;
  }
}

function onImageTap(p) {
  if (!S.imgA || !S.imgB) return;
  for (let i = 0; i < 2; i += 1) {
    const rect = renderer.rects[i];
    if (!rect) continue;
    if (p.x < rect.x || p.x > rect.x + rect.w || p.y < rect.y || p.y > rect.y + rect.h) continue;

    const hit = hitTest(rect, S.diffs, p.x, p.y);
    if (hit >= 0) {
      // 已找到的圈不重复判定，避免误伤
      if (S.found[hit]) return;
      onFound(hit, rect);
    } else {
      onMiss(i, p);
    }
    return;
  }
}

function onFound(idx, rect) {
  S.found[idx] = true;
  S.foundAt[idx] = S.t;
  S.combo += 1;
  S.comboAt = S.t;
  if (S.combo > S.maxCombo) S.maxCombo = S.combo;
  if (S.hintIndex === idx) S.hintIndex = -1;

  const gain = Math.round(BASE_SCORE * (1 + 0.25 * (S.combo - 1)));
  S.score += gain;

  const g = renderer.geom(rect, S.diffs[idx]);
  S.floaters.add(`+${gain}`, g.cx, g.cy, '#8FF7FF', 17);
  S.particles.burst(g.cx, g.cy, '#2EE6A8', 16, 1);
  if (S.combo >= 2) S.particles.burst(g.cx, g.cy, '#8B5CF6', 10, 1.4);
  sound.found(S.combo);
  buzz('light');

  if (S.found.every(Boolean)) finish('win');
}

function onMiss(frame, p) {
  S.misses += 1;
  S.combo = 0;
  S.miss = { frame, px: p.x, py: p.y, age: 0 };
  S.timeLeft -= MISS_TIME;
  S.score = Math.max(0, S.score - MISS_PENALTY);
  S.floaters.add(`-${MISS_TIME}秒`, p.x, p.y - 18 * dpr, '#FF8A80', 14);
  sound.miss();
  buzz('heavy');
  if (S.timeLeft <= 0) {
    S.timeLeft = 0;
    finish('lose');
  }
}

// ---------- 分享（右上角菜单转发） ----------
function initShare() {
  try {
    wx.showShareMenu({ withShareTicket: false });
  } catch (e) { /* 忽略 */ }
  if (!wx.onShareAppMessage) return;
  wx.onShareAppMessage(() => {
    const done = S.found.filter(Boolean).length;
    const total = S.diffs.length || 0;
    return {
      title: total
        ? `我在第 ${S.levelIdx + 1} 关找出 ${done}/${total} 处不同，你来试试？`
        : '来找茬！两张照片里藏着好几处不同',
      query: `level=${S.levelId}`,
    };
  });
}

// 切后台自动暂停，避免偷跑时间
if (wx.onHide) {
  wx.onHide(() => {
    if (S.mode === 'playing') S.mode = 'pause';
  });
}

// ---------- 主循环 ----------
let last = 0;

function loop(now) {
  const dt = last ? Math.min(now - last, 100) : 0;
  last = now;
  S.t = now;

  S.particles.update(dt);
  S.floaters.update(dt);
  if (S.toast) {
    S.toast.age += dt;
    if (S.toast.age > 1900) S.toast = null;
  }
  if (S.miss) {
    S.miss.age += dt;
    if (S.miss.age > 520) S.miss = null;
  }

  if (S.mode === 'countdown') {
    // 图片没加载完就先停在 3，不偷跑倒计时
    if (S.imgA && S.imgB) {
      S.countdown -= dt / 1000;
      const n = Math.ceil(S.countdown);
      if (n !== S.cdLast) {
        S.cdLast = n;
        if (n <= 0) sound.go(); else sound.tick();
      }
      if (S.countdown <= -0.6) {
        S.countdown = 0;
        S.mode = 'playing';
      }
    }
  } else if (S.mode === 'playing' && !S.adShowing) {
    S.timeLeft -= dt / 1000;
    S.elapsed += dt / 1000;
    if (S.timeLeft <= 0) {
      S.timeLeft = 0;
      finish('lose');
    }
  }
  if (S.mode === 'result') S.resultAge += dt;

  renderer.draw(S);
  requestAnimationFrame(loop);
}

initAd();
initShare();
requestAnimationFrame(loop);
