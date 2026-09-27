# Python 工具说明

依赖：`pip install -r requirements.txt`（`Pillow`、`numpy`）。

---

## spot_diff_maker.py — 差异图生成器

从**一张**底图出发，在若干局部区域施加可控改动，输出左右图与答案。除改动区域外两图像素一致，适合真人照片。

### 用法

```bash
python spot_diff_maker.py 输入图.jpg -n 6 -o 输出目录
```

### 常用参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `image` | （必填） | 原始底图路径 |
| `-n` / `--num` | `6` | 差异数量 |
| `-t` / `--types` | `hue,flip,nudge,rotate` | 允许的改动类型，逗号分隔 |
| `-s` / `--seed` | 无 | 随机种子，便于复现 |
| `-o` / `--output` | `spot_diff_out` | 输出目录 |
| `--cols` / `--rows` | `4` / `3` | 规划候选区域的网格 |
| `--avoid-skin` | 关 | 人像模式：皮肤区禁放差异；脸附近只用安全类型 |

### 改动类型（`--types`）

| 类型 | 难度 | 说明 |
|------|------|------|
| `hue` | 低 | 局部换色 |
| `flip` | 低 | 局部镜像 |
| `nudge` | 中 | 局部错位 |
| `rotate` | 中 | 局部旋转 90° |
| `tone` | 高 | 局部明暗 |
| `clone` | 高 | 局部复制（观感像「多了一个东西」） |

`--avoid-skin` 开启时，靠近人脸的区域只会使用 `hue` / `tone`。

### 输出文件

- `{stem}_left.png`：原图  
- `{stem}_right.png`：改后图  
- `{stem}_answer.png`：标框答案  
- `{stem}_compare.png`：左右对照  
- `{stem}_differences.txt`：差异清单  

---

## spot_diff_verify.py — 离线差异检测

对比原图与改后图，自动找出差异圆，可导出关卡 JSON 或直接写入小游戏目录。

### 用法

```bash
python spot_diff_verify.py 原图.png 改后图.png -o 输出目录
```

### 常用参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `original` / `modified` | （必填） | 原图、改后图 |
| `-o` / `--output` | `spot_diff_verify_out` | 输出目录 |
| `-p` / `--preset` | `auto` | `auto` / `low` / `mid` / `high` |
| `--threshold` | 自动 | 像素 RGB 欧氏距离阈值 |
| `--min-region` | 自动 | 差异区域最小像素数 |
| `--merge` | 自动 | 近邻区域合并距离 |
| `--min-area` | 自动 | 过大区域过滤（占短边比例） |
| `--min-count` | `1` | 少于此数会打印提示 |
| `--export-json` | 无 | 导出归一化关卡 JSON 路径 |
| `--emit-game` | 无 | 写入小游戏工程目录 |
| `--level-id` | 文件名 | 关卡 id |
| `--title` | `找不同` | 关卡标题 |
| `--time-limit` | `90` | 限时（秒） |
| `--max-edge` | `750` | 写入游戏时的长边上限 |

一般只需改 `-o`；复杂度过高时再手动调 `--threshold` / `--min-region`。

### 体检提示

运行时会打印「全图差异像素占比」：

- 正常：两图大体一致，局部有差异  
- 偏高 / 异常：可能是整幅重绘或压缩参数不一致，检测结果不可靠  

---

## sync_levels.py — 关卡同步

扫描 `minigame/levels/*.json`，配对图片，归一化坐标，可选压缩，并重写 `levels/index.js`。

### 用法

```bash
python sync_levels.py
python sync_levels.py --game 小游戏目录
```

### 参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--game` | 本仓库 `minigame` | 小游戏工程根目录 |
| `--max-edge` | `1000` | 图片长边上限 |
| `--quality` | `82` | JPEG 质量 |
| `--budget-kb` | `600` | 单关两图合计体积预算（KB），超出才压缩 |

### JSON 字段兼容

脚本会识别多种键名，例如：

- 图：`imageA` / `baseImage` / `image1` …
- 差异：`diffs` / `diffPoints` / `points` …
- 标题 / 时限：`title` / `levelName`，`timeLimit` / `time`

图片命名优先用 JSON 声明路径，否则猜 `{id}_1` / `{id}_2`（及常见后缀）。

### 注意

生成的 `index.js` **不要手改**；数组最后一项不能带尾随逗号（标注工具用 JSON 解析读索引）。
