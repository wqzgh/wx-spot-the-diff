// 关卡资源加载与命中判定

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = wx.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

/**
 * 判断点击是否命中某处差异。
 * rect 是图片在屏幕上的实际绘制矩形（由 Renderer.fit 得到）
 * tol 是容差，手机上手指没有鼠标精确，给 1.15 倍比较舒服
 */
export function hitTest(rect, diffs, px, py, tol = 1.15) {
  const short = Math.min(rect.w, rect.h);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < diffs.length; i += 1) {
    const d = diffs[i];
    const cx = rect.x + d.x * rect.w;
    const cy = rect.y + d.y * rect.h;
    const r = d.r * short;
    const dist = Math.hypot(px - cx, py - cy);
    if (dist < r * tol && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
