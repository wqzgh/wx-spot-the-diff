#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把「两张图 + 差异点 JSON」打包成一个单文件 HTML，浏览器直接打开就能玩。

图片以 base64 内嵌，所以双击本地文件也能跑，不需要起服务器。

用法：
    python build_html.py 图A 图B 差异点.json -o 输出.html --title "关卡名"

差异点 JSON 支持这些常见写法，会自动归一化：
    {"diffs": [{"x": 0.31, "y": 0.42, "r": 0.05}]}          归一化圆心半径
    {"diffs": [{"x": 320, "y": 260, "r": 40}]}               像素圆心半径
    {"diffs": [{"x": 300, "y": 240, "w": 60, "h": 50}]}      像素矩形左上角
    {"diffs": [{"left": .., "top": .., "width": .., "height": ..}]}
    [{"x": .., "y": ..}, ...]                                 顶层就是数组也行
"""

import argparse
import base64
import json
import os

from PIL import Image

TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "playable_template.html")


def normalize_diffs(raw, w, h):
    """把各种写法的差异点统一成归一化圆：x/y 除以宽高，r 除以短边"""
    if isinstance(raw, dict):
        items = None
        for key in ("diffs", "differences", "diffPoints", "points", "spots", "data"):
            if key in raw:
                items = raw[key]
                break
        if items is None:
            items = [raw]
    else:
        items = raw

    short = min(w, h)
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        x = first(it, ("x", "cx", "centerX", "left", "l"))
        y = first(it, ("y", "cy", "centerY", "top", "t"))
        if x is None or y is None:
            continue
        r = first(it, ("r", "radius", "rad"))
        bw = first(it, ("w", "width"))
        bh = first(it, ("h", "height"))

        if r is not None:
            if x > 1.5:
                x /= w
            if y > 1.5:
                y /= h
            if r > 1.5:
                r /= short
        elif bw is not None and bh is not None:
            # 矩形写法：左上角 -> 中心，宽高 -> 半径
            if x > 1.5:
                x = (x + bw / 2) / w
                y = (y + bh / 2) / h
                r = max(bw, bh) / 2 / short
            else:
                x = x + bw / 2
                y = y + bh / 2
                r = max(bw, bh) / 2
        else:
            r = 0.04
        out.append({"x": round(float(x), 5), "y": round(float(y), 5),
                    "r": round(float(r), 5)})
    return out


def first(d, keys):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def to_data_url(path, max_edge=None):
    """图片转 base64；给定 max_edge 时先缩放并转 JPEG，控制 HTML 体积"""
    if max_edge:
        import io

        im = Image.open(path)
        if im.mode != "RGB":
            im = im.convert("RGB")
        scale = min(1.0, max_edge / max(im.size))
        if scale < 1.0:
            im = im.resize((max(1, int(im.width * scale)),
                            max(1, int(im.height * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=85, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    ext = os.path.splitext(path)[1].lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp"}.get(ext, "image/png")
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("ascii")


def main():
    ap = argparse.ArgumentParser(description="生成单文件 HTML 找不同游戏")
    ap.add_argument("image_a", help="原图")
    ap.add_argument("image_b", help="改后图")
    ap.add_argument("diffs", help="差异点 JSON")
    ap.add_argument("-o", "--output", default="playable.html")
    ap.add_argument("--title", default="找不同")
    ap.add_argument("--time", type=int, default=None, help="限时秒数")
    ap.add_argument("--hints", type=int, default=None, help="提示次数")
    ap.add_argument("--max-edge", type=int, default=None,
                    help="内嵌图片长边像素上限，控制 HTML 体积")
    ap.add_argument("--reveal", action="store_true",
                    help="核对模式：打开就把所有差异圈显示出来，不计时，用于校准坐标")
    args = ap.parse_args()

    img_a = Image.open(args.image_a)
    img_b = Image.open(args.image_b)
    with open(args.diffs, encoding="utf-8") as f:
        raw = json.load(f)

    w, h = img_a.size
    diffs = normalize_diffs(raw, w, h)
    if not diffs:
        raise SystemExit("没有解析出任何差异点，请检查 JSON 格式")

    def pick(*keys, default=None):
        for k in keys:
            if isinstance(raw, dict) and raw.get(k) is not None:
                return raw[k]
        return default

    time_limit = args.time or pick("timeLimit", "time", default=90)
    hints = args.hints or pick("hintLimit", "hints", default=3)
    title = args.title if args.title != "找不同" else pick(
        "title", "levelName", "name", default="找不同")

    level = {"title": title, "diffs": diffs,
             "timeLimit": int(time_limit), "hintLimit": int(hints),
             "reveal": bool(args.reveal)}

    with open(TEMPLATE_PATH, encoding="utf-8") as f:
        html = f.read()
    html = html.replace("__LEVEL__", json.dumps(level, ensure_ascii=False))
    html = html.replace("__IMG_A__", to_data_url(args.image_a, args.max_edge))
    html = html.replace("__IMG_B__", to_data_url(args.image_b, args.max_edge))

    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)

    kb = os.path.getsize(args.output) / 1024
    print(f"生成 {args.output}（{kb:.0f} KB）")
    print(f"  关卡：{title}，{len(diffs)} 处差异，限时 {time_limit}s，提示 {hints} 次")
    print(f"  图尺寸 {w}x{h}，差异点已归一化")


if __name__ == "__main__":
    main()
