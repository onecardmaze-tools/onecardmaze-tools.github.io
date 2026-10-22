# 生产渲染后端重写与验收

日期：2026-10-19（America/Los_Angeles，数据目录按 UTC 为 2026-10-20）。对照版本：`f49fc0d83998fde4916f1881a66d5e6b7b74bd13`。

生产入口已使用 **按卡片 WebGL 背景 + 保留 GPU 几何 + 解析抗锯齿前景**。没有降低 DPR、图片分辨率、路线采样精度或动画刷新率；没有引入第三方运行时。业务、路线几何、正反面映射、会话格式和回放状态机保持原实现。

原来持续约 9–30 FPS 的主要瓶颈已消除。真实状态机的三个 30 秒样本接近 60 Hz，CPU 中位耗时为 1.2–1.8 ms；**仍有偶发掉帧，不能把结果表述为三项全程零掉帧、稳定保证 60 FPS，更不能声称数百 FPS 或已证实低功耗。** 下文保留较差的复测，未筛掉异常帧。

最初的根因分析、SVG/PixiJS/WebGPU 等方案取舍见 [调查报告](RENDERING-INVESTIGATION.md)。更早的 Canvas 优化记录见 [历史报告](PERFORMANCE-HISTORY.md)。这些历史实现已由本次后端替换。

## 生产改动

### 背景

原 shader 对每个设备像素反算相机、搜索最多 18 个卡片槽。现在每张卡片只提交一个 quad，相机和 UV 在顶点阶段处理；接缝、亮度和边缘 ramp 的常量在 CPU 上预计算，保留原纹理采样与视觉公式。

背景独立保留，只有图片、相机、旋转、缩放或卡片显示参数变化才重画。如果保守几何检查证明所有屏幕像素均被不透明卡片覆盖，省略被完全遮住的背景渐晕 pass 并关闭多余混合。存在空洞、渐隐、外边缘或精度不足时回到完整绘制路径。保留独立背景，避免仅前景更新时重复绘制约 898 万像素。

### 前景与抗锯齿

[`gpu-renderer.js`](gpu-renderer.js) 替代全屏 Canvas2D 动态层及巨大历史位图；只保留两个视口大小的画布。路线是 model-space VBO，旋转/平移/缩放和线宽通过 uniform 改变；历史 prefix 与活动 tail 分开缓存，行走不再使整幅历史位图重画。

前景 framebuffer 使用单采样，`antialias:false`；线条自身仍有抗锯齿：

1. 每个线段只覆盖紧贴描边的 quad；fragment shader 计算设备像素距离与约一个像素的解析覆盖率。
2. 同一次 stroke 的 depth prepass 对相交线段取最大覆盖率；第二遍用 depth/stencil 只混合一次，避免半透明交叉、圆头和圆角变深。
3. 不同 stroke 仍按原绘制顺序 source-over。虚线、裁剪、焦点框、进行中的白色轨迹和前后向部分回放沿用相同语义。
4. 小标记、箭头和文字使用局部原生 Canvas 光栅结果并缓存为小纹理，保留字体基线、圆弧、线宽与透明边缘。没有把巨型历史 Canvas 上传为纹理。

这解决了原型中整屏 MSAA 的高开销，不能等同于“关闭抗锯齿”。它是应用需要的 Canvas 风格接口，并非通用 Canvas API 实现。

### 生命周期和资源边界

- 保留按需 RAF 调度、静止休眠、隐藏页面暂停和 HUD 节流。
- 路径缓存最多 256 个 path、每个最多 8 个样式，并有 8 MiB VBO 字节预算；淘汰发生在完整 stroke 两遍结束之后。
- 小形状栅格缓存最多 256 项 / 16 MiB；纹理缓存最多 512 项 / 24 MiB，淘汰释放 GPU texture。DPR 改变清除旧缩放缓存。
- 资源预算是应用缓存上限，不是浏览器总显存；画布、depth/stencil、图片 atlas、交换缓冲和驱动内部资源另计。不能把移除 61 MiB 历史颜色表面当作已测显存净减少值。
- WebGL2 优先；WebGL1 使用 `EXT_frag_depth`。前景初始化不支持时替换为原生 Canvas2D 兼容路径，其性能不在本机 GPU 验收结论内。
- 两个 context 分别处理 loss/restore，重建 shader、buffer、纹理和必要的缓存；丢失期间不调用失效 GL 对象。恢复后使用同一应用引用继续绘制。
- 修复同尺寸 `resize()` 仍会清空 canvas backing buffer、但背景缓存 key 未失效的问题。

## 可比条件

所有 GPU 测量由主进程串行运行；子代理在独立目录准备代码，未同时运行 GPU 实验。每次服务使用随机 localhost 端口，Chrome 使用独立临时 profile，脚本在 `finally` 关闭进程与服务。测试使用合成图片和路线，不读取用户保存的数据。

| 项目 | 条件 |
|---|---|
| 环境 | macOS 26.6.2、Chrome 155、ANGLE Metal、Intel UHD Graphics 630 |
| 视口 | 1504 × 1492 CSS px，DPR 2 |
| 实际画布 | 3008 × 2984，8,975,872 设备像素；浏览器视口仿真 |
| 场景 | 两张 750 × 1050 合成图，48 初始顶点 / 47 原始线段，9 张显示卡片 |
| 投影后几何 | 235 条线段，28 个 canonical stamps、28 个 chevrons，再投影到卡片 |
| 缩放 | 0.888095238095238 |
| 测量 | 500 ms settle，20 warmup，15 × 120 measured frames，每项约 30 秒 |
| 循环 | 每 120 帧复位以保持元素数有界；复位开销计入总体 RAF，并单列报告 |

同条件渲染对照保留原始 rotate / walk / replay 轨迹：直接改变旋转、延伸水平尾点、在同一 compact leg 内移动回放 cursor。另加真实状态机驱动：原生 RAF 回调内同步调用生产 `update(1/60)` 和 `render()`；旋转有 easing，行走由 `tap()` 驱动并包含跟随相机和卡片亮度更新，回放由 `play(1)` 驱动并包含 spin 事件。后者仍用相同初始几何、图片、DPR 和视口，但运动路径不同，**不与原始对照混作同一 workload**。

真实状态机测试暂停应用自身 RAF，避免重复调度；没有复现外层 `frame()` 的 HUD 节流更新，使用固定模拟步长（掉帧会放慢模拟时间）。完整应用的调度休眠、输入/会话/回放行为另有功能回归。机器外部负载、温度和 GPU 时钟未锁定，不能将小差异当作可靠性能排名。

## 性能结果

### 原始同条件绘制对照

单位为毫秒。基线是 120 帧；新后端是两轮各 1800 帧，表格给出两轮范围，不把时长不同的样本视为统计配对。

| workload | 基线 RAF 中位数 | 新后端 RAF 中位数 | 新后端 RAF P95 | 新后端 CPU 中位数 | 新后端 >25 ms 间隔 / 1800 |
|---|---:|---:|---:|---:|---:|
| 旋转 | 31.9 | 16.7 | 17.4 | 1.1–1.2 | 6 / 8 |
| 行走 | 115.8 | 16.6–16.7 | 17.4 | 1.4–1.5 | 0 / 0 |
| 回放 | 32.9 | 16.6–16.7 | 17.4 | 0.9–1.0 | 0 / 0 |

数据：[基线](benchmarks/rendering-2026-10-20/baseline.json)、[新后端两轮](benchmarks/rendering-production-2026-10-20/long-run.json)。原版行走 120/120 次历史画布清空，生产 GPU 版本已无该历史画布。GPU timer 中旋转背景约 7.0–7.3 ms，前景约 5.9–6.2 ms；这两个 context 的 query 不是可相加的关键路径耗时。行走/回放背景不变时不提交背景 draw；GPU timer 有探测开销。

### 真实状态机和浏览器呈现

下表关闭 GPU timer，分别连续测量 1800 帧，使用 Chrome trace 配对呈现反馈。`1000 / 平均 RAF 间隔` 是回调速率，不冒充已呈现 FPS。帧是否遗漏由右列的独立呈现计数判断。

| workload | CPU 中位数 / P95 | RAF P95 / P99 | 平均回调速率 | 最长 RAF 间隔 | 丢失呈现帧 / 预期帧 |
|---|---:|---:|---:|---:|---:|
| 旋转 | 1.2 / 1.7 ms | 17.5 / 17.6 ms | 59.87 Hz | 50.2 ms | 4 / 1803（0.22%） |
| 行走 | 1.8 / 2.6 ms | 17.5 / 17.6 ms | 59.90 Hz | 49.5 ms | 4 / 1803（0.22%） |
| 回放（含 spin） | 1.4 / 2.0 ms | 17.3 / 17.5 ms | 60.00 Hz | 17.9 ms | 0 / 1799 |

数据：[真实状态机](benchmarks/rendering-production-2026-10-20/native-state-machine.json)、[呈现反馈](benchmarks/rendering-production-2026-10-20/native-presentation-summary.json)。相同驱动的 [空绘制对照](benchmarks/rendering-production-2026-10-20/native-empty-control.json) 1800 帧没有 >25 ms 回调间隔，因此不能简单把所有长帧归咎于测试环境。

原始绘制对照的单独 30 秒 trace 复测：

| 条件 | 旋转丢帧 / 预期 | 行走 | 回放 |
|---|---:|---:|---:|
| 开启 GPU timer | 1 / 1801 | 0 / 1798 | 0 / 1798 |
| 关闭 GPU timer | **27 / 1825（1.48%）** | 0 / 1798 | 0 / 1799 |

较差的关闭 timer 复测仍保留：[原始数据](benchmarks/rendering-production-2026-10-20/uninstrumented-run.json)、[呈现统计](benchmarks/rendering-production-2026-10-20/uninstrumented-presentation-summary.json)。开启 timer 的结果见 [数据](benchmarks/rendering-production-2026-10-20/presentation-run.json)、[统计](benchmarks/rendering-production-2026-10-20/presentation-summary.json)。因此当前结论是：**持续低帧率已修复，大部分帧达到 60 Hz 节奏，严格的三场景全程无掉帧验收尚未通过；旋转仍有帧预算余量不足和尾延迟风险。** 没有通过排除早期帧、复位帧或选择最好一轮来隐藏这些限制。

### 呈现统计方法

[`summarize-render-trace.py`](tests/summarize-render-trace.py) 仅配对 Chrome `FrameSequenceTrackerV3` 的 JSAnimation/RAF tracker，按各 tracker 差分累积 expected / dropped_v3 / dropped_v4，计入完整处于 OCM 测量 marks 内的区间。两个 tracker 互相重叠，不相加；V3/V4 均保留，表中采用 V3，不挑选更好看的 V4。

计数依据：[Chromium frame_sequence_metrics.cc](https://chromium.googlesource.com/chromium/src/+/HEAD/cc/metrics/frame_sequence_metrics.cc)、[Chromium jank tracing](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/speed/debug-janks.md)。解析器有独立累积计数、边界和无关 tracker 测试。

仓库保存未改写的相关原始 trace 事件子集 `*-presentation-events.json.gz`；可直接重新统计。完整 trace 的 SHA256、事件数和本机归档位置见 [manifest](benchmarks/rendering-production-2026-10-20/trace-manifest.json)。统计文件中的设备路径为本机原始记录，不是远程依赖。

## 功能与画质验收

[浏览器回归数据](benchmarks/rendering-production-2026-10-20/visual-regression.json) 在基线和生产版本上串行运行，包括：

- 11 个截图场景：未旋转/旋转、负坐标接缝、五种标记及中英文文字、放大/缩小、窗口 resize、正向/反向部分回放、context loss 前后。
- 完整正向/反向状态机各 355 ticks，分别覆盖四个事件并核对路线未变。
- 两个真实 GL context 依次 loss/restore；前后截图逐像素相同；恢复后连续两次同尺寸 resize 仍正常。
- 原生 `readPixels` 检查单次半透明 stroke 的交叉/线身/圆头 alpha 都为 128，第二次独立 stroke 后为 191，避免把交叠过暗当作可接受差异。
- 检测 252 个真实部分覆盖 AA 像素，`SAMPLES=0`、`antialias=false`；改变旋转/缩放/线宽不产生新的路径 buffer 上传。
- 稳定后无 pending app RAF，随后 500 ms 回调计数不增长；无页面异常和 GL error。

基线截图与生产截图的轻微模糊后平均通道差为 0.035–0.149 / 255；基线彩色墨迹在 2 设备像素容差内全部保留，标记和标签覆盖检查通过。缩小场景反向覆盖比较有一个新增墨迹像素超出容差（当前覆盖召回率 99.9975%）。**解析 AA 和 Canvas 光栅不是逐像素等价**；这些检查用于发现缺线、接缝断裂、标记错位、文字丢失和透明混合错误，不能替代所有设备/图像的视觉判断。

代表截图：[旋转](benchmarks/rendering-production-2026-10-20/visual/current-dense-rotation.png)、[标记与文字](benchmarks/rendering-production-2026-10-20/visual/current-markers-text.png)、[负坐标接缝](benchmarks/rendering-production-2026-10-20/visual/current-negative-seams.png)。

11 组 Node 检查通过，覆盖 ReplayCore、TraceRenderer、会话、调度、实际原生 Canvas 栅格、GPU 路径缓存、depth/stencil rollover、缓存预算/淘汰、裁剪、GL 失效资源、初始化回退和不透明背景覆盖证明。另有 Python trace 解析器检查。它们与真实浏览器检查互补，mock GL 通过不等于 GPU 性能通过。

## 未采用的追加方案

这些在独立副本中测试，未混入生产代码。

| 方案 | 实测 / 判断 | 决策 |
|---|---|---|
| 单 context + 背景 FBO 缓存、每帧 blit | 旋转平均 RAF 17.78 ms，P95 32.9 ms；增加整屏拷贝 | 不采用 |
| 单 context 混合：变化时直绘、静止时懒建背景 FBO | 30 秒旋转 12/1810 呈现帧丢失（0.66%）；CPU 约 1.0 ms；没有可靠优于双 context | 不以复杂缓存/上下文耦合换微小差异 |
| 预热背景 pipeline / 显式 flush | 复测仍有掉帧，未证实可靠提升 | 不采用 |
| 卡片内部像素跳过边缘 shader 计算 | CPU 等价检查通过；360 帧背景 GPU 6.79 ms，但 RAF P99 83.7 ms，收益不足、尾延迟差 | 不采用 |

较完整的合并 context 数据：[结果](benchmarks/rendering-production-2026-10-20/hybrid-long-run.json)、[呈现统计](benchmarks/rendering-production-2026-10-20/hybrid-presentation-summary.json)。其他候选测量和补丁保存在 `experiments/rendering-production/` 与本次 benchmarks 目录。小样本受机器状态影响，不把上述数据解释为任何方案普遍更慢的定理。

继续迁移 PixiJS 或 WebGPU 会新增 shader/资源恢复/兼容维护成本，当前证据未说明更换 API 本身能解决残余像素填充和呈现尾延迟。当前保留直接 WebGL 作为生产实现；若后续要求更严格的帧预算，应从目标硬件上的整帧 GPU/合成 trace 和像素工作量继续定位，不应默认降低画质或宣称换库必然提升。

## 重现命令

项目无构建依赖；以下测试使用外部 Node 20+、Playwright、Chrome、Python3 和可选 `@napi-rs/canvas`。依赖路径显式传入，不写入项目 `node_modules`。

```sh
CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas \
node --test tests/*.test.js tests/gpu*.cjs tests/background-coverage.test.cjs
python3 tests/trace-summary.test.py

# 基线目录可以用 git archive f49fc0d 解包，勿覆盖当前工作树。
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
OCM_BASELINE_ROOT=/isolated/baseline OCM_OUTPUT_DIR=/tmp/ocm-visual \
node tests/browser-regression.cjs

# 同原始运动条件的对照（可用 OCM_ROOT 指定独立版本）
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
OCM_GPU_TIMERS=0 OCM_MODES=full OCM_WORKLOADS=rotate,walk,replay \
OCM_CYCLES=15 OCM_OUTPUT=/tmp/ocm-render.json OCM_TRACE=/tmp/ocm-render \
node tests/rendering-benchmark.cjs

# 包含真实 update / 输入 / 回放状态机；GPU timer 默认关闭
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
OCM_NATIVE_DRIVER=1 OCM_MODES=full OCM_WORKLOADS=rotate,walk,replay \
OCM_CYCLES=15 OCM_OUTPUT=/tmp/ocm-native.json OCM_TRACE=/tmp/ocm-native \
node tests/rendering-benchmark.cjs
python3 tests/summarize-render-trace.py /tmp/ocm-native-0-*.json.gz
```

测量时只运行一份基准，保持浏览器前台，不同时跑功能截图、编译、其他 GPU 实验。额外成本必须单独测量：真实手机/Safari/Firefox、长期大型路线、功耗、温度和 60 Hz 以上吞吐均不在本次已验证范围内。
