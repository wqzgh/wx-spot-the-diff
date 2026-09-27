# 微信小游戏说明

工程目录：仓库内的 [`minigame/`](../minigame/)。

## 导入与运行

1. 打开微信开发者工具 → 小游戏 → 导入项目  
2. 目录选择本仓库的 `minigame/`  
3. AppID：填你在[微信公众平台](https://mp.weixin.qq.com/)申请的 AppID；本地调试可用游客 / 测试号  
4. 公开仓库中的 `project.config.json` 使用占位 AppID，**请换成你自己的**，勿把真实 AppID 误提交到公开仓库  

本目录已有一份简短操作备忘：[`minigame/README.txt`](../minigame/README.txt)。更完整流程见 [workflow.md](workflow.md)。

## 目录职责

| 路径 | 作用 |
|------|------|
| `game.js` | 入口与状态机（home → countdown → playing → result） |
| `js/render.js` | 渲染 |
| `js/level.js` | 读图与点击判定 |
| `js/sound.js` | 音效 |
| `js/store.js` | 本地存档 |
| `js/anim.js` | 飘字 / 粒子 |
| `levels/{id}.json` | 单关数据（标注工具读写） |
| `levels/index.js` | 运行时关卡列表（脚本/标注工具生成） |
| `images/` | `{id}_1` 原图、`{id}_2` 改后图 |

## 包体

- 主包上限约 **4MB**；代码很小，空间几乎都给图片  
- 参考规格：长边 1000、JPEG quality 82，单关约 220KB 量级时，主包大约能放十几关  
- 超限后：微信小游戏**分包**，或降低 `sync_levels.py` 的 `--max-edge` / `--quality`  

## 广告位

[`game.js`](../minigame/game.js) 顶部：

```js
const AD_UNIT_ID = 'adunit-xxxxxxxxxxxxxxxx';
```

在流量主后台申请激励视频广告位后替换。当前逻辑：

- 提示用完 → 看广告 +1 次提示  
- 时间到 → 看广告 +30 秒复活  

未配置真实广告位时，相关能力在真机上可能不可用，不影响本地主要玩法调试。

## 关卡 JSON 格式

示例见 `levels/01.json`：

```json
{
  "id": "01",
  "levelName": "成果展示",
  "baseImage": "01_1.jpg",
  "diffImage": "01_2.jpg",
  "totalDiffCount": 5,
  "diffPoints": [
    { "x": 0.2989, "y": 0.5302, "radius": 0.104, "desc": "" }
  ]
}
```

坐标约定（与 `sync_levels.py` / 运行时一致）：

- `x`、`y`：相对整图宽高的归一化圆心（0～1）  
- `radius`：相对**短边**的归一化半径  

也可用像素坐标写 JSON，再跑 `sync_levels.py` 转成归一化并写入 `index.js`。

## 玩法摘要

- 点击找到差异圆；点错扣分并扣时  
- 限时、提示次数可在关卡数据里配置（同步后进入 `index.js` 的 `timeLimit` / `hintLimit`）  
- 计分含基础分、连击、剩余时间与未用提示奖励  
- 静音与进度写入本地存档（`js/store.js`）
