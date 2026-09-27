#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 minigame/levels/*.json（手动标注的关卡）同步进微信小游戏工程。

做的事：
  1. 扫描 levels 目录下每个 json，按文件名作为关卡 id
  2. 自动找到对应的两张图（json 里写的路径，或 images/{id}_1.png / {id}_2.png 等常见命名）
  3. 把像素坐标差异点归一化（x/宽, y/高, r/短边）
  4. 重新生成 levels/index.js

用法：
    python sync_levels.py                       # 默认同步 outputs/minigame
    python sync_levels.py --game 小游戏目录
"""

import argparse
import json
import os
import shutil

from PIL import Image

IMAGE_KEYS_A = ("imageA", "baseImage", "image1", "imgA", "left")
IMAGE_KEYS_B = ("imageB", "diffImage", "image2", "imgB", "right")
DIFF_KEYS = ("diffs", "differences", "diffPoints", "points", "spots")


def first(d, keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k):
            return d[k]
    return None


def find_image(images_dir, level_id, declared, suffix_pool):
    """先信任 json 里声明的路径，找不到再按 id 猜常见命名"""
    if declared:
        for cand in (os.path.join(images_dir, os.path.basename(declared)),
                     os.path.join(images_dir, declared)):
            if os.path.exists(cand):
                return cand
    for suf in suffix_pool:
        for ext in (".jpg", ".png", ".jpeg", ".webp"):
            cand = os.path.join(images_dir, f"{level_id}{suf}{ext}")
            if os.path.exists(cand):
                return cand
    return None


def compress_image(src, dst, max_edge, quality):
    """缩小 + 转 JPEG。返回 (成品尺寸, 成品字节数)"""
    im = Image.open(src)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    scale = min(1.0, max_edge / max(im.size))
    if scale < 1.0:
        im = im.resize((max(1, int(im.width * scale)),
                        max(1, int(im.height * scale))), Image.LANCZOS)
    im.save(dst, "JPEG", quality=quality, optimize=True)
    return im.size, os.path.getsize(dst)


def normalize_diffs(raw, w, h):
    """像素坐标 -> 归一化圆"""
    if isinstance(raw, dict):
        items = first(raw, DIFF_KEYS) or [raw]
    else:
        items = raw

    short = min(w, h)
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        x = first(it, ("x", "cx", "centerX", "left"))
        y = first(it, ("y", "cy", "centerY", "top"))
        if x is None or y is None:
            continue
        r = first(it, ("r", "radius", "rad"))
        bw = first(it, ("w", "width"))
        bh = first(it, ("h", "height"))

        if r is not None:
            nx = x / w if x > 1.5 else x
            ny = y / h if y > 1.5 else y
            nr = r / short if r > 1.5 else r
        elif bw is not None and bh is not None:
            if x > 1.5:
                nx, ny = (x + bw / 2) / w, (y + bh / 2) / h
                nr = max(bw, bh) / 2 / short
            else:
                nx, ny = x + bw / 2, y + bh / 2
                nr = max(bw, bh) / 2
        else:
            nx, ny, nr = x, y, 0.04
        out.append({"x": round(float(nx), 5),
                    "y": round(float(ny), 5),
                    "r": round(float(nr), 5)})
    return out


def shrink_pair(pa, pb, img_dir, level_id, args):
    """体积超阈值就压成 JPEG，命名沿用 id_1 / id_2"""

    def one(path, suffix):
        size_kb = os.path.getsize(path) / 1024
        is_jpg = path.lower().endswith((".jpg", ".jpeg"))
        with Image.open(path) as im:
            edge = max(im.size)
        if is_jpg and size_kb <= args.budget_kb / 2 and edge <= args.max_edge:
            return path
        dst = os.path.join(img_dir, f"{level_id}{suffix}.jpg")
        size, nbytes = compress_image(path, dst, args.max_edge, args.quality)
        print(f"    压缩 {os.path.basename(path)} -> {os.path.basename(dst)} "
              f"{size[0]}x{size[1]}, {size_kb:.0f}KB -> {nbytes / 1024:.0f}KB")
        return dst

    return one(pa, "_1"), one(pb, "_2")


def main():
    ap = argparse.ArgumentParser(description="同步关卡到微信小游戏工程")
    ap.add_argument("--game", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "minigame"))
    ap.add_argument("--max-edge", type=int, default=1000,
                    help="图片长边上限，默认 1000")
    ap.add_argument("--quality", type=int, default=82, help="JPEG 质量")
    ap.add_argument("--budget-kb", type=int, default=600,
                    help="单关两张图合计体积预算 KB，超出才压缩")
    args = ap.parse_args()

    lvl_dir = os.path.join(args.game, "levels")
    img_dir = os.path.join(args.game, "images")
    os.makedirs(img_dir, exist_ok=True)

    levels = []
    for fn in sorted(os.listdir(lvl_dir)):
        if not fn.endswith(".json"):
            continue
        level_id = os.path.splitext(fn)[0]
        with open(os.path.join(lvl_dir, fn), encoding="utf-8") as f:
            raw = json.load(f)

        pa = find_image(img_dir, level_id, first(raw, IMAGE_KEYS_A),
                        ("_1", "_a", ".a", "-1"))
        pb = find_image(img_dir, level_id, first(raw, IMAGE_KEYS_B),
                        ("_2", "_b", ".b", "-2"))
        if not pa or not pb:
            print(f"[跳过] {level_id}: 找不到配对的图片（{pa}, {pb}）")
            continue

        # 主包 4MB 上限：真人照片必须压缩，缩放不影响归一化坐标
        pa, pb = shrink_pair(pa, pb, img_dir, level_id, args)
        total_kb = (os.path.getsize(pa) + os.path.getsize(pb)) / 1024

        with Image.open(pa) as im:
            w, h = im.size
        diffs = normalize_diffs(raw, w, h)
        if not diffs:
            print(f"[跳过] {level_id}: 没解析出差异点")
            continue

        levels.append({
            "id": level_id,
            "title": first(raw, ("title", "levelName", "name")) or level_id,
            "imageA": "images/" + os.path.basename(pa),
            "imageB": "images/" + os.path.basename(pb),
            "diffs": diffs,
            "timeLimit": int(first(raw, ("timeLimit", "time")) or 90),
            "hintLimit": int(first(raw, ("hintLimit", "hints")) or 3),
        })
        print(f"[OK] {level_id}: {len(diffs)} 处差异，{w}x{h}，图合计 {total_kb:.0f}KB")

    # 注意：每关之间用逗号分隔，最后一项绝不能带尾随逗号。
    # 尾随逗号在 JS 里合法、在 JSON.parse 里会报错，会导致标注工具读不出这个索引。
    out = ["// 由 sync_levels.py 自动生成，请勿手改", "export const LEVELS = ["]
    for i, lv in enumerate(levels):
        body = json.dumps(lv, ensure_ascii=False, indent=2)
        out.append(body + ("," if i < len(levels) - 1 else ""))
    out.append("];")

    idx = os.path.join(lvl_dir, "index.js")
    with open(idx, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"\n已写入 {idx}，共 {len(levels)} 关")


if __name__ == "__main__":
    main()
