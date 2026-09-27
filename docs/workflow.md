# 端到端工作流

从一张底图到微信开发者工具可玩，推荐按下面顺序操作。

## 总览

```
底图 ──► spot_diff_maker（或外部改图）
          │
          ▼
     左图 + 右图 ──►（可选）spot_diff_verify 自动找差异
          │
          ▼
  放入 minigame/images/   命名：{id}_1.jpg / {id}_2.jpg
          │
          ▼
  annotator 标注差异圆 ──► 保存 levels/{id}.json + index.js
          │
          ▼
  （可选）python sync_levels.py 压缩图片并重建 index.js
          │
          ▼
  微信开发者工具打开 minigame/
```

## 1. 准备左右图

### 方式 A：脚本生成（推荐，像素可控）

```bash
python spot_diff_maker.py 你的底图.jpg -n 5 -o out_dir --avoid-skin
```

输出包括：

- `{stem}_left.png`：原图
- `{stem}_right.png`：改后图
- `{stem}_answer.png`：标出差异框的答案图
- `{stem}_differences.txt`：清单

将左右图复制到 `minigame/images/`，分别命名为例如 `06_1.jpg`、`06_2.jpg`（可用 JPEG，注意主包包体）。

### 方式 B：已有两张图

若差异来自 AI 或其他工具，建议先跑校验：

```bash
python spot_diff_verify.py 原图.jpg 改后图.jpg -o verify_out --export-json minigame/levels/06.json --level-id 06
```

脚本会检查「全图差异占比」：过高说明两张图整体不一致，标注结果不可信，应重出图。

## 2. 用标注工具标点

1. 运行 `annotator/start-server.bat`（或 `start-server.py`）
2. 打开 http://127.0.0.1:8765/index.html
3. 「选择游戏目录」→ 选中本仓库的 `minigame`
4. 左栏点关卡；画布上拖拽画圆，滚轮/滑块调半径
5. 点「校验」：自动对比两图像素，确认圈内确有差异
6. 「保存到目录」：写回改动的图片、`levels/xx.json`、`levels/index.js`（以目录现有内容为底合并，不会只剩当前一关）

也可先手写/导出 JSON 到 `minigame/levels/{id}.json`，再在标注工具里微调。

## 3. 同步与压缩（可选）

标注工具保存时一般会更新索引。若你只改了 JSON/图片、或需要统一压缩规格：

```bash
python sync_levels.py
# 或指定目录
python sync_levels.py --game path/to/minigame
```

脚本会：

- 扫描 `levels/*.json`
- 配对 `images/{id}_1` / `{id}_2`
- 将差异坐标归一化
- 超出体积预算时压成 JPEG
- 重写 `levels/index.js`

默认：长边 ≤ 1000、JPEG 质量 82、单关两图合计约 600KB 预算。

## 4. 微信开发者工具预览

1. 新建 / 导入小游戏项目，目录指向 `minigame/`
2. 填入自己的 AppID（公开仓库里是占位符）
3. 编译预览；真机调试前确认图片与关卡已同步

包体与广告配置见 [minigame.md](minigame.md)。

## 注意事项

- **不要手改** `levels/index.js`（末尾逗号等问题会导致标注工具读索引失败）
- 主包上限约 **4MB**；图片是大头，超限请用分包或调低 `--max-edge` / `--quality`
- 人像底图生成时加 `--avoid-skin`，减少改到脸上
