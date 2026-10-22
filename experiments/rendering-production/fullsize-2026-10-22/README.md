# 2026-10-22 未合入候选

只用于隔离复查，不能直接套用生产工作树；没有运行依赖。先复制仓库到独立目录，`patch -p1 --dry-run`，性能测量只开一个实验。

- `geometry-partition.patch`：相对 `3d1c185`，背景分为内部/边缘绘制；半宽下没有可靠收益，未合入。
- `promoted-player.patch`：相对本轮生产 CSS，给原回放 dock 加 `will-change:transform`；全尺寸 20 秒仍有 5 个长间隔，未合入。
- `solid-progress.patch`：相对本轮生产 HTML/CSS，把原 range 渐变改为 clipped solid transform 填充；20 秒仍有 3 个长间隔，未合入，也未完成候选 UI 的跨浏览器/像素验收。

数据和状态以 [PERFORMANCE.md](../../../PERFORMANCE.md) 为准。两个 UI 候选不构成 UI 是停顿根因的证明。生产仍使用原 UI。
