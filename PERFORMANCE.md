# 全尺寸渲染：2026-10-22

本轮以 `3d1c185` 为基线。**实际内容区是 3008 × 1492 CSS px，DPR 2，GPU drawing buffer 为 6016 × 2984（17,951,744 像素）**。此前 1504 × 1492 的半宽测试不能证明该尺寸的性能；[上一轮报告](PERFORMANCE-2026-10-20.md)仅作历史记录。

生产实现现在使用 **单个不透明 WebGL2 画布、保留几何、解析抗锯齿、桌面高性能 GPU 请求**。大屏持续约 30 FPS 的问题已经显著改善；但仍测到首次回放的呈现等待，**不能声称三个操作全程零掉帧，也没有证实数百 FPS 或近零功耗**。本报告保留所有较差复测，不以预热后数据替换首轮交互。

## 根因与证据

1. 本机同时有 Intel UHD 630 和 AMD Radeon Pro 5500M。原 `powerPreference:"default"` 实际选择 Intel；不是图片、点和线数量很多，而是两张高分辨率画布的绘制、附件及合成开销。在全尺寸旧版消融中，空绘制稳定 60 Hz；单独背景、单独前景的 RAF 中位数均为 16.7 ms，合起来为 33.3 ms，CPU 中位耗时仍只有约 2 ms。[消融原始数据](benchmarks/rendering-2026-10-22/fullsize-ablation.json)
2. 仅复用更多几何、丢弃临时附件，或仅合并 context，仍不足以使该 Intel 全尺寸路径稳定 60 Hz。明确请求高性能 GPU 后，实际 renderer 变为 Radeon，旋转和行走短测已经没有 >25 ms 间隔。这不是浏览器启动参数强制切卡，生产代码使用相同 WebGL context 属性。该属性是提示，浏览器可以不采纳，单 GPU 设备也不会因此获得另一块 GPU。[WebGL 规范](https://registry.khronos.org/webgl/specs/latest/1.0/)、[MDN 属性说明](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)
3. 相机运动还会反复重建方向 chevron 和焦点矩形的等价几何。现已保留模型坐标路径，使用相机矩阵绘制，按几何而不是每帧版本失效；保守剔除完全离屏的 glyph 组。此项有明确的上传复用测试，但不把全部 FPS 提升归因于缓存。
4. 剩余的首次回放停顿有下游呈现证据：一轮 `SwapBuffers` wall time 197.422 ms、thread CPU 4.464 ms；另一轮 `CALayerTreeCoordinator::ApplyBackpressure` wall time 129.025 ms，其中 Metal 等待累计 128.813 ms、thread CPU 1.489 ms。没有对应的长 JS/UI Paint 任务。这定位了直接等待点，**仍不能排除之前的 GPU 工作、驱动或系统合成造成队列积压，也不能简单称为“机器卡”或已修复**。[第一轮分析](benchmarks/rendering-2026-10-22/replay-stall-analysis.json)、[深入分析](benchmarks/rendering-2026-10-22/replay-deep-stall-analysis.json)

## 最终生产方案

- WebGL2 背景和前景共享 `stage` 的 opaque context，旧 `replayLayer` 不申请 context、不参与合成。每个活动帧直接绘背景，再绘解析前景，没有全屏 FBO 缓存或 blit。少一个整屏 RGBA8 表面，其单缓冲理论大小约 **68.5 MiB**；不是实测浏览器显存净减少值，交换缓冲、驱动资源和 depth/stencil 另计。
- 背景与前景使用独立 VAO，阶段边界明确恢复 framebuffer、blend、depth/stencil、scissor、color mask。共享前景的 clear 只清 depth/stencil，保留已绘背景；帧末只 invalidate 临时 depth/stencil，保留颜色。没有降低 DPR、采样密度、图片尺寸或刷新率，没有启用整屏 MSAA，也没有关闭线条解析抗锯齿。
- 桌面请求 `high-performance`；原有小触屏设备的 `low-power` 策略保留；独立前景回退继承相同选择。高性能 GPU 可能增加整机耗电，尤其双 GPU 笔记本，**本次未测功耗**。静止时应用仍无持续 RAF，不等于独显已经休眠。
- WebGL1 或共享初始化失败保留双画布兼容路径，缺少解析渲染能力时保留 Canvas2D fallback。上下文丢失后重建各自资源，不替换承载输入的共享 stage。兼容路径不在本机高性能 GPU 验收结论内。
- Chevron 缓存按实际 face/position/direction/both/zoom 更新；旋转、平移不重建路径。大焦点矩形最多缓存 64 项；原 VBO、栅格和纹理预算继续生效。回放、路线、卡片、标记、撤销和 UI 布局保持原行为。
- 导出的环境诊断增加实际 GPU renderer、请求的 power preference、共享 context 状态和 drawing buffer 尺寸，方便核实真实用户环境。

## 候选方案与取舍

| 方案 | 实测或预期收益 | 成本、风险与结论 |
|---|---|---|
| 仅保留更多几何、帧末 discard | 降低重复上传；Intel 全尺寸仍有大量长帧 | 成本小，保留；不是主要 FPS 修复 |
| 将背景拆成内部/边缘几何 | 半宽实测未显示可靠收益 | 增加 draw/state 和阈值证明成本；未合入，也不把半宽结果当作全宽结果 |
| 仅合并 context，仍用 Intel | 全尺寸旋转 RAF 均值 28.7 ms，未到 60 Hz | 仅合并不够；颜色合成舍入、GL 状态和恢复需回归 |
| 桌面请求高性能 GPU，仍用双画布 | 本机实际切到 Radeon；三项短测大幅改善 | 成本低，但保留大透明画布，可能增加电源开销 |
| **单 WebGL2 context + 高性能请求 + 保留几何** | 三项 GPU 整帧中位数约 6.6–7.5 ms；省掉一张全屏合成表面 | **采用**。不增加依赖，已有全尺寸画质和生命周期验证；每个活动帧重画背景是权衡，空闲仍休眠 |
| 给回放 dock 单独合成层 | 20 秒回放仍有 5 个 >25 ms 间隔，最长 83.3 ms | 未显示可靠改善，未合入 |
| 纯色 transform 进度条替换渐变 | 20 秒回放仍有 3 个 >25 ms 间隔，最长 466.7 ms | 未显示可靠改善，未合入；没有证实渐变是根因 |
| SVG / 通用图形库 | 当前全尺寸未重新实现；早期 SVG 实验并不优于 GPU 路径 | 大量迁移/回归；通用库还违反无第三方运行依赖的约束。历史结果见[调查](RENDERING-INVESTIGATION.md)，不混作本轮数据 |
| WebGPU 重写 | 可表达同样保留几何和附件 discard，但没有本轮可比实测支持更高帧率 | 管线、文字、裁剪、loss/restore、兼容回退迁移成本高；不会自动解决 GPU 选择和 macOS 呈现等待，暂不推荐 |

独立候选补丁见 [实验说明](experiments/rendering-production/fullsize-2026-10-22/README.md)。保留证据，不把未采纳候选混入生产代码。

## 可复现的测量条件

所有自有 GPU 实验串行运行，子代理仅在各自临时目录准备代码或离线分析。每次用随机 localhost 端口和独立 Chrome 临时 profile，结束关闭自有浏览器与服务。没有关闭用户或其他线程的 Chrome，也不能证明整台机器的外部负载、温度和 GPU 频率完全固定。

| 项目 | 条件 |
|---|---|
| 主机 | macOS，Intel UHD 630 + Radeon Pro 5500M，Chrome 156 / ANGLE Metal |
| 内容区 | **3008 × 1492 CSS px，DPR 2**；两个字段和实际 GPU buffer 均校验 |
| GPU buffer | **6016 × 2984**；共享实现只有一个底层 canvas/context |
| 场景 | 两面各 750 × 1050 合成图，9 张显示卡片；48 初始点、47 原始线段、235 投影线段，28 canonical stamps / chevrons |
| 缩放 | 0.888095238095238；不动态降画质 |
| 输入 | 可见 Chrome：E 键旋转、地图实际点击行走、点击 Replay；运行原生产 RAF、update、render、HUD，不替换调度器 |
| 回放 | 1×，在原路线 11/23/35 顶点录制转向；检查真实 spin 阶段完成和图像转动；后续长测点击 Replay again 重复，不写 cursor 驱动动画 |
| 路线变化 | 旋转/回放必须保持原路线；10 秒行走从 49 到 61 点，30 秒到 85 点，保留真实录制开销 |
| 可见性 | 首尾核对 CSS/visual viewport、native Chrome window bounds、drawingBuffer、GL attributes；测量期间 blur/hidden/resize 即失败 |
| 限制 | screen 可被浏览器仿真；窗口审计不证明 OS 级完全无遮挡。Chrome 呈现反馈另计；本 fixture 不跨卡片边界，翻面功能由回归测试覆盖 |

`tests/interaction-performance.cjs` 保留原始帧、首次输入延迟、连续 RAF 和正常休眠间隙。CPU 统计包含 frame 内 HUD，但输入处理在 frame 外；input-to-frame-end 不是实际显示延迟。`passed:true` 表示测试有效、功能断言通过，**不是 60 FPS 达标标志**。

## 相同条件前后对照：每项 10 秒

首轮交互和长帧均计入，双方都启用 Chrome presentation trace，未启用 GPU timer。`>25ms` 只是便于统计的连续 RAF 长间隔阈值，不能代替呈现计数。

| 操作 | 旧版 RAF 中位 / P95 | 新版 RAF 中位 / P95 | 旧 / 新 >25ms 间隔 | 旧 / 新 CPU 中位 | 旧 / 新呈现丢帧 |
|---|---:|---:|---:|---:|---:|
| 旋转 | 32.9 / 83.4 ms | 16.7 / 18.0 ms | 152 / 0 | 2.2 / 1.0 ms | 354/588 → 0/598 |
| 行走 | 17.2 / 50.7 ms | 16.6 / 18.1 ms | 108 / 0 | 2.6 / 1.5 ms | 147/547 → 2/576 |
| 回放含转向 | 31.7 / 66.2 ms | 16.6 / 18.1 ms | 166 / 2 | 2.4 / 1.1 ms | 271/587 → 5/592 |

[旧版](benchmarks/rendering-2026-10-22/paired-before.json)、[新版](benchmarks/rendering-2026-10-22/paired-after.json)、[呈现反馈](benchmarks/rendering-2026-10-22/paired-presentation.json)。旧版此轮比早前短测更差，因此同时保留[早前全尺寸基线](benchmarks/rendering-2026-10-22/fullsize-baseline-interaction.json)：旋转 RAF 中位 33.3 ms、均值 33.17 ms；不能只选最差旧版样本夸大收益。

## 30 秒验证与未解决的短暂停顿

| 操作 | CPU 中位 / P95 | RAF P95 / 最大值 | >25ms 间隔 | 呈现丢帧 / 预期 |
|---|---:|---:|---:|---:|
| 旋转 | 1.0 / 1.4 ms | 18.0 / 18.7 ms | 0 | 0 / 1796 |
| 行走 | 1.6 / 2.2 ms | 18.0 / 18.7 ms | 0 | 2 / 1727（0.12%） |
| 重复回放，含三次转向 | 1.0 / 1.5 ms | 18.0 / 101.3 ms | 2 | 6 / 1771（0.34%） |

[旋转/行走原始长测](benchmarks/rendering-2026-10-22/fullsize-unified-events-interaction.json)、[回放重复长测](benchmarks/rendering-2026-10-22/replay-repeat.json)、[第一轮呈现](benchmarks/rendering-2026-10-22/fullsize-unified-presentation.json)。第一轮回放仅播放一遍，活动约 14 秒后休眠，另有 10/838 呈现丢帧、最大 168.6 ms；因此补了真实重复回放，未把休眠时间算作高帧率。第二轮 101.3 ms 长帧在首次回放开始约 0.44 秒处，另有一次 33.8 ms 长帧。两轮均保留。

单 context GPU timer 的三项中位数分别为 **7.46 / 6.61 / 7.33 ms**，来自独立的 360 帧真实状态机驱动测试，非上述完整 UI trace 的同一次测量。旧双 context 的两个 timer scope 不能相加当作关键路径。[GPU 原始数据](benchmarks/rendering-2026-10-22/fullsize-unified-highperf-gpu.json)

新实现的持续帧率接近 60 Hz，已经不再是全尺寸普遍约 30 Hz 的状态；但首次回放的浏览器/Metal 呈现等待仍未完全消除。不能把 RAF 接近 60、CPU 低，或一次零长帧样本当作全程稳定呈现的证明。

## 画质、功能与复现

- 全尺寸 11 个场景对照（旋转、负坐标/接缝、标记文字、缩放、部分回放及恢复）通过；平均模糊色差不超过 0.157/255，墨迹覆盖 recall 100%。共享合成的舍入与不同 GPU 会造成极小像素差，不声称逐字节完全一致。
- 上下文恢复前后截图完全相同；实际 WebGL readPixels 验证无 MSAA、解析 AA 边缘、相交线段只混合一次，以及旋转/线宽改变不重复上传 VBO。[视觉报告](benchmarks/rendering-2026-10-22/visual-regression.json)、[旧版截图](benchmarks/rendering-2026-10-22/baseline-dense-rotation.png)、[新版截图](benchmarks/rendering-2026-10-22/current-dense-rotation.png)
- 所有 `tests/*.test.js`、`tests/*.test.cjs` 通过，包括共享 VAO/状态、失败回退、loss/restore、附件丢弃顺序、缓存预算、AA 几何、路线/会话/翻面/撤销。Canvas2D 单元适配器显式走独立层；共享 GPU 另外由真实浏览器验证。
- `tests/ui-states.cjs` 通过六种尺寸全部模式，已检查手机、横屏和桌面截图；没有布局或操作文案改动。[测试记录](benchmarks/rendering-2026-10-22/unit-tests.txt)、[UI 记录](benchmarks/rendering-2026-10-22/ui-qa.txt)

```sh
# 外部测试依赖：Playwright、@napi-rs/canvas；不进入产品运行时，无构建步骤。
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
export CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas
export NODE_PATH=/absolute/path/to/node_modules
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for t in tests/*.test.js tests/*.test.cjs; do node "$t" || exit 1; done
node tests/ui-states.cjs
OCM_SECONDS=30 OCM_TRACE=/tmp/ocm-trace OCM_OUTPUT=/tmp/ocm-run.json node tests/interaction-performance.cjs
python3 tests/summarize-render-trace.py /tmp/ocm-trace-*.json.gz
```

默认尺寸现为 3008 × 1492、DPR 2。`OCM_WIDTH/HEIGHT/DPR` 可显式覆盖；对比双方必须相同。GPU timer 的合成场景使用 `tests/rendering-benchmark.cjs`，`OCM_NATIVE_DRIVER=1 OCM_GPU_TIMERS=1`，不与真实 UI 驱动混作同一指标。数据说明、筛选后的可复算呈现 trace 和原完整 trace 哈希见[证据目录](benchmarks/rendering-2026-10-22/README.md)。
