# 微信小游戏 · 找不同

一套面向微信小游戏的「找不同」制作与运行工具链：用 Python 生成/校验差异图，用浏览器标注关卡，再导入微信开发者工具直接玩。

> 口语里常叫「小程序」，本仓库工程类型是 **微信小游戏**（`compileType: game`）。请用开发者工具以「小游戏」方式打开 `minigame/` 目录。

## 功能亮点

- **像素级可控出图**：`spot_diff_maker.py` 只改局部区域，避免整图 AI 重绘导致的漂移
- **离线差异检测**：`spot_diff_verify.py` 自动找出两张图的差异位置并导出关卡 JSON
- **可视化标注**：`annotator/` 拖拽画圈、一键校验、写回 `levels/`
- **小游戏可玩**：计时、提示、连击、复活广告位、本地存档

## 目录结构

```
.
├── minigame/          # 微信小游戏工程（用开发者工具打开此目录）
├── annotator/         # PC 端关卡标注工具（浏览器）
├── spot_diff_maker.py # 从一张底图生成左右图与答案
├── spot_diff_verify.py# 对比两张图，检测差异并可选导出关卡
├── sync_levels.py     # 同步 levels/*.json → levels/index.js
├── docs/              # 详细文档
└── requirements.txt
```

## 快速开始

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

需要 Python 3.8+，依赖 `Pillow`、`numpy`。

### 2. 启动标注工具

```bash
# Windows 可双击
annotator/start-server.bat

# 或
python annotator/start-server.py
```

浏览器打开 http://127.0.0.1:8765/index.html ，顶部「选择游戏目录」选中 `minigame/`，即可编辑关卡。

### 3. 运行小游戏

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，目录选 `minigame/`
3. AppID 填你自己的（测试可用游客模式）

## 日常工作流（推荐）

1. （可选）用脚本生成或校验差异图 → 放到 `minigame/images/`
2. 打开标注工具，拖拽画圈标记差异点，点「校验」确认
3. 「保存到目录」写回 `levels/*.json` 与 `levels/index.js`
4. 在微信开发者工具里预览 / 真机调试

> 不要手工改 `levels/index.js`；以标注工具保存或 `sync_levels.py` 为准。

更完整的步骤见 [端到端工作流](docs/workflow.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/workflow.md](docs/workflow.md) | 从出图到上线的完整流程 |
| [docs/tools.md](docs/tools.md) | 三个 Python 脚本的参数说明 |
| [docs/minigame.md](docs/minigame.md) | 小游戏导入、包体、广告位、关卡格式 |

## License

本项目代码按仓库现状提供，可按需自行修改与发布。使用微信开放平台能力时请遵守其相关规范。
