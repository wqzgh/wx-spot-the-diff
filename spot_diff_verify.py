#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
找不同「差异检测器」——离线版

灵感来自 github.com/seehiong/prompt-to-puzzle 的 imageAnalysisService.ts，
把它的浏览器端 Canvas 算法移植成 Python，用于本地批量校验。

用途：你有两张图（原图 + AI 改过的图），本脚本自动找出所有差异位置，
画成答案图。不用管 AI 到底改了什么、改了几处，它都能帮你数出来。

用法：
    python spot_diff_verify.py 原图.png 改后图.png -o 输出目录

关键参数（一般不用管，脚本会按图像复杂度自动选档）：
    --threshold   像素 RGB 欧氏距离阈值，超过才算差异
    --min-region  差异区域最小像素数，越小越敏感
    --merge       两个区域间距小于此值就合并
    --min-area    按短边比例过滤过大的区域（防止半个屏幕都被算成一处）
"""

import argparse
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 三档自适应参数：低 / 中 / 高复杂度
# 依次为 模糊半径, 颜色阈值, 最小区域, 合并距离, 最小密度, 最大占短边比, 半径放大
PRESETS = {
    "low": dict(blur=1, threshold=40, min_region=150, merge=25, min_density=0.20,
                max_percent=0.40, radius_mul=1.30),
    "mid": dict(blur=2, threshold=55, min_region=250, merge=35, min_density=0.25,
                max_percent=0.35, radius_mul=1.20),
    "high": dict(blur=2, threshold=60, min_region=300, merge=45, min_density=0.28,
                 max_percent=0.30, radius_mul=1.15),
}

COMPLEXITY_LOW, COMPLEXITY_MID = 0.06, 0.15


def ensure_dir(path):
    if path and not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def complexity(gray):
    """边缘密度 = 图像复杂度的代理指标"""
    a = gray.astype(np.int16)
    core = a[1:-1, 1:-1]
    right = a[1:-1, 2:]
    bottom = a[2:, 1:-1]
    edge = ((np.abs(core - right) > 25) | (np.abs(core - bottom) > 25)).sum()
    return edge / (a.shape[0] * a.shape[1])


def pick_preset(score):
    if score < COMPLEXITY_LOW:
        return "low", PRESETS["low"]
    if score < COMPLEXITY_MID:
        return "mid", PRESETS["mid"]
    return "high", PRESETS["high"]


def connected_regions(mask):
    """8 邻域漫水填充，把差异像素聚成区域"""
    h, w = mask.shape
    visited = np.zeros((h, w), dtype=bool)
    regions = []
    ys, xs = np.nonzero(mask)

    for y0, xs0 in zip(ys, xs):
        if visited[y0, xs0]:
            continue
        queue = deque([(y0, xs0)])
        visited[y0, xs0] = True
        min_y = max_y = y0
        min_x = max_x = xs0
        size = 0

        while queue:
            y, x = queue.popleft()
            size += 1
            if y < min_y:
                min_y = y
            elif y > max_y:
                max_y = y
            if x < min_x:
                min_x = x
            elif x > max_x:
                max_x = x

            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    nx = x + dx
                    if nx < 0 or nx >= w:
                        continue
                    if mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))

        regions.append(dict(min_x=min_x, max_x=max_x, min_y=min_y,
                            max_y=max_y, size=size))
    return regions


def gap(r1, r2):
    dx = max(0, max(r1["min_x"], r2["min_x"]) - min(r1["max_x"], r2["max_x"]))
    dy = max(0, max(r1["min_y"], r2["min_y"]) - min(r1["max_y"], r2["max_y"]))
    return (dx * dx + dy * dy) ** 0.5


def merge_regions(regions, max_distance):
    regions = list(regions)
    merged = True
    while merged:
        merged = False
        i = 0
        while i < len(regions):
            j = i + 1
            while j < len(regions):
                if gap(regions[i], regions[j]) < max_distance:
                    a, b = regions[i], regions[j]
                    regions[i] = dict(
                        min_x=min(a["min_x"], b["min_x"]),
                        max_x=max(a["max_x"], b["max_x"]),
                        min_y=min(a["min_y"], b["min_y"]),
                        max_y=max(a["max_y"], b["max_y"]),
                        size=a["size"] + b["size"],
                    )
                    regions.pop(j)
                    merged = True
                else:
                    j += 1
            i += 1
    return regions


def find_differences(img_a, img_b, params):
    blur = params["blur"]
    # 必须用 int32：三个通道平方和最大 195075，int16 会溢出导致 sqrt 得到 nan
    a1 = np.asarray(img_a.filter(ImageFilter.GaussianBlur(blur)), dtype=np.int32)
    a2 = np.asarray(img_b.filter(ImageFilter.GaussianBlur(blur)), dtype=np.int32)

    dist = np.sqrt(((a1 - a2) ** 2).sum(axis=2))
    mask = dist > params["threshold"]
    if not mask.any():
        return []

    regions = connected_regions(mask)

    # 尺寸过滤 + 宽高比过滤 + 密度过滤
    kept = []
    for r in regions:
        if r["size"] < params["min_region"]:
            continue
        rw = r["max_x"] - r["min_x"] + 1
        rh = r["max_y"] - r["min_y"] + 1
        if rh == 0 or rw == 0:
            continue
        ar = rw / rh
        if not (0.1 < ar < 10):
            continue
        density = r["size"] / (rw * rh)
        very_large = r["size"] > params["min_region"] * 10
        if not very_large and density < params["min_density"]:
            continue
        kept.append(r)

    kept = merge_regions(kept, params["merge"])

    # 过滤掉覆盖过大面积的区域
    short_side = min(mask.shape)
    kept = [r for r in kept
            if (r["max_x"] - r["min_x"]) / short_side < params["max_percent"]
            and (r["max_y"] - r["min_y"]) / short_side < params["max_percent"]]

    # 转圆形热点并剔除重叠
    circles = []
    for r in kept:
        cx = (r["min_x"] + r["max_x"]) / 2
        cy = (r["min_y"] + r["max_y"]) / 2
        radius = max((r["max_x"] - r["min_x"]) / 2,
                     (r["max_y"] - r["min_y"]) / 2) * params["radius_mul"]
        circles.append(dict(x=cx, y=cy, r=radius, size=r["size"],
                            box=(r["min_x"], r["min_y"], r["max_x"], r["max_y"])))

    circles.sort(key=lambda c: c["r"], reverse=True)
    final = []
    for c in circles:
        if all((c["x"] - o["x"]) ** 2 + (c["y"] - o["y"]) ** 2 >= (c["r"] + o["r"]) ** 2
               for o in final):
            final.append(c)
    return final


def draw_answer(base, circles, outline="#E24B4A", width=5):
    img = base.copy()
    draw = ImageDraw.Draw(img)
    for i, c in enumerate(circles, 1):
        x0, y0, x1, y1 = c["box"]
        pad = 6
        for _ in range(width):
            draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=outline)
            pad += 1
        tx, ty = x0 - pad, y0 - pad
        draw.ellipse([tx - 26, ty - 26, tx + 4, ty + 4], fill=outline)
        draw.text((tx - 18, ty - 22), str(i), fill="#FFFFFF")
    return img


def global_diff_ratio(img_a, img_b, blur, threshold):
    """统计全图差异像素占比

    真人照片尤其需要这一步：如果两张图的压缩率、白平衡、尺寸来源不一致，
    会出现遍布全图的细微差异，此时检测出的"差异"全是噪声，题目根本没法玩。
    """
    a1 = np.asarray(img_a.filter(ImageFilter.GaussianBlur(blur)), dtype=np.int32)
    a2 = np.asarray(img_b.filter(ImageFilter.GaussianBlur(blur)), dtype=np.int32)
    dist = np.sqrt(((a1 - a2) ** 2).sum(axis=2))
    return float((dist > threshold).mean())


def build_level(size, circles, args, level_id):
    """坐标按图像宽高归一化，这样小游戏里任意屏幕尺寸都能还原位置"""
    w, h = size
    short = min(w, h)
    return {
        "id": level_id,
        "title": args.title,
        "imageA": f"images/{level_id}_a.png",
        "imageB": f"images/{level_id}_b.png",
        "diffs": [{"x": round(c["x"] / w, 4),
                   "y": round(c["y"] / h, 4),
                   "r": round(c["r"] / short, 4)} for c in circles],
        "timeLimit": args.time_limit,
        "hintLimit": 3,
    }


def emit_game(base, other, level, args, level_id):
    """产出一个可直接放进微信小游戏的关卡包：压缩后的两张图 + 关卡 JSON"""
    import json

    root = args.emit_game
    img_dir = os.path.join(root, "images")
    lvl_dir = os.path.join(root, "levels")
    ensure_dir(img_dir)
    ensure_dir(lvl_dir)

    total = 0

    def shrink(img, path):
        nonlocal total
        w, h = img.size
        scale = min(1.0, args.max_edge / max(w, h))
        if scale < 1.0:
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                             Image.Resampling.LANCZOS)
        img.save(path, optimize=True)
        total += os.path.getsize(path)

    shrink(base, os.path.join(root, level["imageA"]))
    shrink(other, os.path.join(root, level["imageB"]))

    json_path = os.path.join(lvl_dir, f"{level_id}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(level, f, ensure_ascii=False, indent=2)

    sync_index(root)

    print(f"  关卡包: {root}")
    print(f"  图片合计 {total / 1024:.0f} KB（微信小游戏主包上限 4MB，请留意）")
    return json_path


def sync_index(root):
    """扫描 levels/*.json，汇总成小游戏可直接 import 的 index.js

    小游戏里读不到本地 JSON 文件（没有 fs），所以关卡数据必须以 JS 模块形式提供。
    """
    import json

    lvl_dir = os.path.join(root, "levels")
    if not os.path.isdir(lvl_dir):
        return
    items = []
    for fn in sorted(os.listdir(lvl_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(lvl_dir, fn), encoding="utf-8") as f:
            items.append(json.load(f))

    body = ",\n".join(json.dumps(it, ensure_ascii=False, indent=2) for it in items)
    out = os.path.join(lvl_dir, "index.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// 由 spot_diff_verify.py 自动生成，请勿手改\n")
        f.write("export const LEVELS = [\n")
        f.write(body)
        f.write("\n];\n")
    print(f"  关卡索引: {out}（共 {len(items)} 关）")


def main():
    ap = argparse.ArgumentParser(description="找不同差异检测器")
    ap.add_argument("original", help="原图")
    ap.add_argument("modified", help="改后图")
    ap.add_argument("-o", "--output", default="spot_diff_verify_out", help="输出目录")
    ap.add_argument("-p", "--preset", choices=["auto"] + list(PRESETS), default="auto")
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--min-region", type=int, default=None)
    ap.add_argument("--merge", type=int, default=None)
    ap.add_argument("--min-area", type=float, default=None, help="最大区域占短边比例")
    ap.add_argument("--min-density", type=float, default=None,
                    help="区域内差异像素占比下限，漏检时调低它")
    ap.add_argument("--min-count", type=int, default=1,
                    help="少于这个数量就提示你可能该放宽阈值")
    ap.add_argument("--export-json", default=None, help="导出归一化坐标的关卡 JSON")
    ap.add_argument("--emit-game", default=None,
                    help="直接产出一个可放进微信小游戏的关卡包（含压缩后的图片）")
    ap.add_argument("--level-id", default=None, help="关卡 id，默认取文件名")
    ap.add_argument("--title", default="找不同", help="关卡标题")
    ap.add_argument("--time-limit", type=int, default=90, help="限时秒数")
    ap.add_argument("--max-edge", type=int, default=750,
                    help="关卡包内图片长边像素，越小包体越小")
    args = ap.parse_args()

    ensure_dir(args.output)

    base = Image.open(args.original).convert("RGB")
    other = Image.open(args.modified).convert("RGB")
    if other.size != base.size:
        print(f"尺寸不一致，已把改后图缩放到 {base.size}")
        other = other.resize(base.size, Image.Resampling.LANCZOS)

    score = complexity(np.asarray(base.convert("L")))
    name, params = pick_preset(score) if args.preset == "auto" else (
        args.preset, PRESETS[args.preset])
    params = dict(params)
    if args.threshold is not None:
        params["threshold"] = args.threshold
    if args.min_region is not None:
        params["min_region"] = args.min_region
    if args.merge is not None:
        params["merge"] = args.merge
    if args.min_area is not None:
        params["max_percent"] = args.min_area
    if args.min_density is not None:
        params["min_density"] = args.min_density

    print(f"图像复杂度 {score:.4f} -> 参数档位 {name}")
    print(f"  模糊={params['blur']} 阈值={params['threshold']} "
          f"最小区域={params['min_region']} 合并距离={params['merge']}")

    # 真人照片容易因压缩/白平衡/尺寸来源不同导致全图漂移，先体检一次
    ratio = global_diff_ratio(base, other, params["blur"], params["threshold"])
    flag = "正常" if ratio < 0.08 else ("偏高" if ratio < 0.15 else "异常")
    print(f"全图差异像素占比 {ratio * 100:.1f}% -> {flag}")
    if ratio >= 0.15:
        print("  警告：两张图整体不一致，大概率是 AI 整幅重绘、压缩率不同或尺寸来源不同。")
        print("  这种情况下找出的差异不可信，建议重新出图或统一导出参数。")

    circles = find_differences(base, other, params)
    circles.sort(key=lambda c: c["box"][1])

    stem = os.path.splitext(os.path.basename(args.original))[0]
    answer_path = os.path.join(args.output, f"{stem}_answer.png")
    list_path = os.path.join(args.output, f"{stem}_detected.txt")

    draw_answer(other, circles).save(answer_path)
    with open(list_path, "w", encoding="utf-8") as f:
        f.write(f"检测到 {len(circles)} 处差异（复杂度 {score:.4f}，档位 {name}）\n")
        for i, c in enumerate(circles, 1):
            x0, y0, x1, y1 = c["box"]
            f.write(f"第 {i} 处  框=({x0},{y0})-({x1},{y1})  "
                    f"中心=({int(c['x'])},{int(c['y'])})  "
                    f"半径={int(c['r'])}  差异像素={c['size']}\n")

    print(f"检测到 {len(circles)} 处差异")
    print(f"  答案图: {answer_path}")
    print(f"  位置清单: {list_path}")

    level_id = args.level_id or stem
    if args.export_json or args.emit_game:
        level = build_level(base.size, circles, args, level_id)
        import json

        if args.export_json:
            with open(args.export_json, "w", encoding="utf-8") as f:
                json.dump(level, f, ensure_ascii=False, indent=2)
            print(f"  关卡 JSON: {args.export_json}")
        if args.emit_game:
            emit_game(base, other, level, args, level_id)

    if len(circles) < args.min_count:
        print(f"提示：只找到 {len(circles)} 处，少于预期的 {args.min_count} 处，"
              f"试试降低 --threshold 或 --min-region")


if __name__ == "__main__":
    main()
