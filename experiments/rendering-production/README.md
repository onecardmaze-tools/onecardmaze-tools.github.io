# 未合入的生产后端实验

这些补丁用于复查本次重写的候选设计，**不是生产依赖**。性能与舍弃原因见 [PERFORMANCE.md](../../PERFORMANCE.md)。

- `unified-cached.patch`：单 context + 缓存背景 FBO，每帧 blit。
- `unified-hybrid.patch`：变化时直绘背景，不变时懒建 FBO 并 blit。
- `interior-fast-path.patch`：卡片内部跳过边缘计算，保留纹理采样。

补丁相对本次生产重写的独立快照生成。应用时先把本仓库复制到独立目录，再 `patch -p1 --dry-run < ...` 检查；不要直接修改生产工作树。没有构建依赖；使用仓库 `tests/rendering-benchmark.cjs`，通过 `OCM_ROOT` 指向副本，且只运行一份 GPU 基准。

`check-interior-threshold.cjs` 在候选目录检查 uploaded float32 阈值；它只证明等价分支的充分条件，不证明 GPU 收益。其余候选只保留补丁和实测数据，不推荐继续使用。

检查阈值：`OCM_ROOT=/isolated/interior-candidate node experiments/rendering-production/check-interior-threshold.cjs`。
