// 音效：wx.createWebAudioContext 实时合成，无音频文件、零包体
// 基础库 2.19.0+ 支持；不可用或静音时全部静默降级

let ac = null;
let muted = false;

function getCtx() {
  if (ac) return ac;
  try {
    if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
      ac = wx.createWebAudioContext();
    }
  } catch (e) {
    ac = null;
  }
  return ac;
}

export function setMuted(m) {
  muted = !!m;
}

/** 单音：freq 起始频率，dur 秒，opt.slide 结束频率（滑音） */
function tone(freq, dur, opt = {}) {
  if (muted) return;
  const a = getCtx();
  if (!a) return;
  try {
    const o = a.createOscillator();
    const g = a.createGain();
    const t0 = a.currentTime;
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(opt.slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opt.vol || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch (e) {
    // 合成失败静默
  }
}

export function click() {
  tone(880, 0.06, { type: 'triangle', vol: 0.10 });
}

/** 找到差异：随连击升调的双音 ping */
export function found(combo) {
  const base = 660 * Math.pow(1.12, Math.min(Math.max(combo, 1) - 1, 6));
  tone(base, 0.09, { vol: 0.16 });
  setTimeout(() => tone(base * 1.5, 0.13, { vol: 0.13 }), 70);
}

export function miss() {
  tone(190, 0.2, { type: 'sawtooth', vol: 0.11, slide: 120 });
}

export function hint() {
  tone(1046, 0.08, { vol: 0.12 });
  setTimeout(() => tone(1318, 0.1, { vol: 0.12 }), 60);
}

export function tick() {
  tone(520, 0.07, { type: 'square', vol: 0.07 });
}

export function go() {
  tone(780, 0.16, { type: 'square', vol: 0.09, slide: 1180 });
}

export function win() {
  [523, 659, 784, 1046].forEach((f, i) => {
    setTimeout(() => tone(f, 0.17, { vol: 0.14 }), i * 130);
  });
}

export function lose() {
  tone(330, 0.22, { vol: 0.12, slide: 230 });
  setTimeout(() => tone(220, 0.32, { vol: 0.12, slide: 150 }), 190);
}
