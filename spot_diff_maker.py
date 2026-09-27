#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
橘猫「找不同」图片生成器

用法：
    python spot_diff_maker.py 输入图.jpg -n 6 -o 输出目录

原理：先在图上自动规划若干候选区域，再对每个区域施加一种"像素级可控"的改动。
除被改动的区域外，两张图完全一致，因此不存在 AI 重绘导致的整体漂移。

改动类型（--types 可组合）：
    hue      局部换色      —— 难度低，最自然
    flip     局部镜像翻转  —— 难度低
    nudge    局部整体错位  —— 难度中
    rotate   局部旋转90度  —— 难度中
    tone     局部明暗变化  —— 难度高
    clone    局部复制一份  —— 难度高，观感为"多了一个东西"
"""

import argparse
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ALL_TYPES = ["hue", "flip", "nudge", "rotate", "tone", "clone"]

# 真人照片上最自然的差异是"衣服/配饰换色"和"明暗变化"；
# 镜像和旋转落在脸上会很惊悚，所以人脸附近只用这两类
FACE_SAFE_TYPES = ["hue", "tone"]


def skin_mask(img, dilate=9):
    """用 YCbCr 肤色范围粗略框出皮肤区域，作为「差异禁区」

    不去装 opencv，这套经典阈值（Cb 77-127 / Cr 133-173）对付
    人像够用了，目的是别把改动糊到脸上。
    """
    # 经典阈值范围（Cb 77-127 / Cr 133-173）会把米色墙、木质背景、暖色调照片
    # 大面积误判成皮肤，导致几乎无处可放差异。这里收紧 Cr 下限并提高红蓝差要求：
    # 米色背景 Cr 约 135、R-B 约 28，真实肤色 Cr 普遍 145+、R-B 普遍 50+
    arr = np.asarray(img.convert("YCbCr"), dtype=np.int16)
    cb, cr = arr[:, :, 1], arr[:, :, 2]
    rgb = np.asarray(img.convert("RGB"), dtype=np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mask = ((cb >= 80) & (cb <= 125) & (cr >= 138) & (cr <= 175)
            & (r > g) & (g > b) & ((r - b) >= 35)).astype(np.uint8) * 255

    # 先腐蚀再膨胀（开运算），去掉散点噪声，只保留成片的皮肤区域
    m = Image.fromarray(mask)
    m = m.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(dilate))
    return np.asarray(m) > 0


def ensure_dir(path):
    if path and not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def shift_hue(patch, degrees):
    """把色相旋转若干度，保持明度与饱和度不变，避免露馅"""
    hsv = patch.convert("HSV")
    h = hsv.split()[0]
    lut = [int((i + degrees) % 256) for i in range(256)]
    h = h.point(lut)
    merged = Image.merge("HSV", (h, hsv.split()[1], hsv.split()[2]))
    return merged.convert("RGB")


def change_tone(patch, factor):
    """只改明暗，不改色相"""
    return ImageEnhance.Brightness(patch).enhance(factor)


def apply_diff(img, box, kind):
    """对 img 的 box 区域施加一种改动，返回修改后的整图与新区域"""
    x0, y0, x1, y1 = box
    w, h = img.size
    patch = img.crop(box)
    out = img.copy()

    if kind in ("flip", "rotate", "hue", "tone"):
        if kind == "flip":
            new_patch = patch.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        elif kind == "rotate":
            new_patch = patch.transpose(Image.Transpose.ROTATE_90)
        elif kind == "hue":
            new_patch = shift_hue(patch, random.randint(60, 150))
        else:
            new_patch = change_tone(patch, random.choice([0.55, 1.7]))
        out.paste(new_patch, (x0, y0))
        return out, box

    if kind == "nudge":
        dx, dy = random.randint(8, 22), random.randint(8, 22)
        nx1, ny1 = min(x1 + dx, w), min(y1 + dy, h)
        if nx1 - x0 < 20 or ny1 - y0 < 20:
            return out, box
        moved = img.crop((x0, y0, nx1 - dx, ny1 - dy))
        out.paste(moved, (x0 + dx, y0 + dy))
        return out, (x0, y0, nx1, ny1)

    if kind == "clone":
        # 源区域太平坦的话，复制过去等于贴一块纯色，肉眼完全看不出来，退化成换色
        if float(np.asarray(patch.convert("L"), dtype=np.float32).std()) < 10:
            out.paste(shift_hue(patch, 120), (x0, y0))
            return out, box
        # 把一块内容复制到紧邻的空白处，视觉上"多出一件东西"
        dx, dy = x1 - x0 + 6, 0
        nx0, nx1 = x0 + dx, x1 + dx
        if nx1 > w:
            dx = -(x1 - x0 + 6)
            nx0, nx1 = x0 + dx, x1 + dx
            if nx0 < 0:
                return out, box
        if nx1 - nx0 < 20:
            return out, box
        ny0, ny1 = y0, y1
        out.paste(patch, (nx0, ny0))
        return out, (min(x0, nx0), ny0, max(x1, nx1), ny1)

    return out, box


def plan_regions(size, n, cols=4, rows=3, margin=0.04, rng=random, skin=None,
                 skin_ratio=0.25):
    """把画面切成网格，随机挑 n 个格子，在每格内部再随机取一小块

    skin 是肤色掩码，给定后会跳过皮肤占比过高的格子，避免把改动糊到脸上。
    """
    w, h = size
    cw, ch = w / cols, h / rows
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    rng.shuffle(cells)

    regions = []
    for r, c in cells:
        if len(regions) >= n:
            break
        cx0 = c * cw + cw * (margin + rng.random() * 0.12)
        cy0 = r * ch + ch * (margin + rng.random() * 0.12)
        pw, ph = cw * rng.uniform(0.4, 0.6), ch * rng.uniform(0.4, 0.6)
        x0, y0 = int(cx0), int(cy0)
        x1, y1 = int(min(cx0 + pw, (c + 1) * cw - 8)), int(min(cy0 + ph, (r + 1) * ch - 8))
        if x1 - x0 < 30 or y1 - y0 < 30:
            continue
        if skin is not None and skin[y0:y1, x0:x1].mean() > skin_ratio:
            continue
        regions.append((x0, y0, x1, y1))
    return regions


def draw_answer(base, regions, outline="#E24B4A", width=5):
    """答案图：在差异位置画红框并编号"""
    img = base.copy()
    draw = ImageDraw.Draw(img)
    for i, (x0, y0, x1, y1) in enumerate(regions, 1):
        pad = 6
        for _ in range(width):
            draw.rectangle(
                [x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=outline
            )
            pad += 1
        tx, ty = x0 - pad, y0 - pad
        draw.ellipse([tx - 26, ty - 26, tx + 4, ty + 4], fill=outline)
        draw.text((tx - 18, ty - 22), str(i), fill="#FFFFFF")
    return img


def side_by_side(left, right, gap=16, bg="#FFFFFF"):
    w, h = left.size
    canvas = Image.new("RGB", (w * 2 + gap, h), bg)
    canvas.paste(left, (0, 0))
    canvas.paste(right, (w + gap, 0))
    return canvas


def main():
    ap = argparse.ArgumentParser(description="橘猫找不同图片生成器")
    ap.add_argument("image", help="原始底图路径")
    ap.add_argument("-n", "--num", type=int, default=6, help="差异数量，默认 6")
    ap.add_argument("-t", "--types", default="hue,flip,nudge,rotate",
                    help="允许的改动类型，逗号分隔，可选：" + ",".join(ALL_TYPES))
    ap.add_argument("-s", "--seed", type=int, default=None, help="随机种子，便于复现")
    ap.add_argument("-o", "--output", default="spot_diff_out", help="输出目录")
    ap.add_argument("--cols", type=int, default=4, help="网格列数")
    ap.add_argument("--rows", type=int, default=3, help="网格行数")
    ap.add_argument("--avoid-skin", action="store_true",
                    help="人像模式：避开肤色区域，且人脸附近只用换色/明暗")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    ensure_dir(args.output)

    base = Image.open(args.image).convert("RGB")
    types = [t.strip() for t in args.types.split(",") if t.strip() in ALL_TYPES] or ["hue"]

    skin = skin_mask(base) if args.avoid_skin else None
    if skin is not None:
        print(f"人像模式：皮肤区域占画面 {skin.mean() * 100:.1f}%，已设为差异禁区")

    # 多取候选再截断，避免因为避开皮肤导致凑不够数量时反复重试
    regions = plan_regions(base.size, args.num * 3, cols=args.cols, rows=args.rows,
                           rng=rng, skin=skin)[: args.num]

    current = base
    final_boxes = []
    log_lines = []
    for idx, box in enumerate(regions, 1):
        kind = rng.choice(types)
        if skin is not None:
            x0, y0, x1, y1 = box
            pad = 25
            near_face = skin[max(0, y0 - pad):y1 + pad,
                             max(0, x0 - pad):x1 + pad].mean() > 0.02
            if near_face:
                kind = rng.choice(FACE_SAFE_TYPES)
        current, new_box = apply_diff(current, box, kind)
        final_boxes.append(new_box)
        x0, y0, x1, y1 = new_box
        log_lines.append(
            f"第 {idx} 处  类型={kind:<6} 位置=({x0}, {y0})-({x1}, {y1})"
        )

    stem = os.path.splitext(os.path.basename(args.image))[0]
    paths = {
        "左图(原图)": os.path.join(args.output, f"{stem}_left.png"),
        "右图(待找)": os.path.join(args.output, f"{stem}_right.png"),
        "答案图": os.path.join(args.output, f"{stem}_answer.png"),
        "对照图": os.path.join(args.output, f"{stem}_compare.png"),
        "差异清单": os.path.join(args.output, f"{stem}_differences.txt"),
    }

    answer = draw_answer(current, final_boxes)
    compare = side_by_side(base, current)

    base.save(paths["左图(原图)"])
    current.save(paths["右图(待找)"])
    answer.save(paths["答案图"])
    compare.save(paths["对照图"])
    with open(paths["差异清单"], "w", encoding="utf-8") as f:
        f.write(f"共 {len(final_boxes)} 处差异\n")
        f.write("\n".join(log_lines))
        f.write("\n")

    print("生成完成：")
    for k, v in paths.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
