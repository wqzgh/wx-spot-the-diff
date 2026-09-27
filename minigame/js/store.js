// 本地存档：关卡解锁进度、每关星级与最高分（wx.setStorageSync，无服务端）

const KEY = 'spotdiff_save_v1';

function blank() {
  return { unlocked: 1, levels: {}, totalStars: 0, muted: false };
}

function read() {
  const base = blank();
  try {
    const raw = wx.getStorageSync(KEY);
    if (!raw) return base;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d || typeof d !== 'object') return base;
    base.unlocked = Number(d.unlocked) > 0 ? Number(d.unlocked) : 1;
    base.levels = d.levels && typeof d.levels === 'object' ? d.levels : {};
    base.muted = !!d.muted;
    return base;
  } catch (e) {
    return base;
  }
}

function write(data) {
  let stars = 0;
  for (const k in data.levels) stars += data.levels[k].stars || 0;
  data.totalStars = stars;
  try {
    wx.setStorageSync(KEY, data);
  } catch (e) {
    console.warn('存档写入失败', e);
  }
  return data;
}

export const save = read();

/** 记录一次通关成绩，只在更好时覆盖 */
export function record(levelIdx, levelId, { score, stars, time }) {
  const cur = save.levels[levelId] || { stars: 0, best: 0, bestTime: 0 };
  const next = {
    stars: Math.max(cur.stars, stars),
    best: Math.max(cur.best, score),
    bestTime: cur.bestTime ? Math.min(cur.bestTime, time) : time,
  };
  save.levels[levelId] = next;
  if (levelIdx + 1 >= save.unlocked) {
    save.unlocked = Math.min(levelIdx + 2, 999);
  }
  write(save);
  return { improved: score > cur.best, prevBest: cur.best, record: next };
}

export function starsOf(levelId) {
  const r = save.levels[levelId];
  return r ? r.stars : 0;
}

export function isUnlocked(idx) {
  return idx < save.unlocked;
}

export function setMuted(m) {
  save.muted = !!m;
  write(save);
}

export function resetAll() {
  const b = blank();
  save.unlocked = 1;
  save.levels = {};
  write(save);
  return b;
}
