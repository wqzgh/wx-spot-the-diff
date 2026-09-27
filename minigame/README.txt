微信小游戏 · 找不同
==================

更完整的项目介绍与文档见仓库根目录 README.md 与 docs/。

用微信开发者工具导入本目录即可运行（AppID 填你自己的）。

【日常工作流 —— 用 PC 端标注工具，不要再手工改 index.js】
  1. 双击 annotator/start-server.bat（或 start-server.py）
     浏览器会打开 http://127.0.0.1:8765/index.html
  2. 点顶部「选择游戏目录」，选中本目录（minigame）
  3. 左栏会列出所有关卡；点一条即可编辑：
     - 拖拽画圆标差异点，滚轮/滑块调半径
     - 点「校验」自动检查每个圈是否真有像素差异
  4. 改完点「保存到目录」：
     - 只写回改动的图片、levels/xx.json、levels/index.js
     - index.js 以目录现有内容为底合并，不会只剩当前一关

【目录结构】
  images/            每关两张图：{id}_1.jpg（原图）、{id}_2.jpg（改后图）
  levels/{id}.json   单关完整数据（含提示词、差异点描述）
  levels/index.js    关卡索引，小游戏运行时读这个
  js/                render 渲染层 / sound 音效 / store 存档 / anim 动画 / level 判定
  game.js            状态机与入口

【包体】
  主包上限 4MB；代码约 46KB，其余全是图片。
  当前每关约 220KB（长边 1000 / JPEG q82），主包约能放 18 关。
  超过后用分包（单包不限大小，总量 20MB），或直接改压缩规格。

【广告位】
  game.js 里 AD_UNIT_ID 换成你在流量主后台申请到的 ID：
  - 提示用完 → 看广告 +1 次提示
  - 时间到   → 看广告 +30 秒复活
