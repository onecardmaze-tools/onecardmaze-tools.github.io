# 渲染性能调查与候选方案实测

日期：2026-10-19（America/Los_Angeles）；基线：`f49fc0d83998fde4916f1881a66d5e6b7b74bd13`。

> 本文保留最初调查时的结果和决策依据。后续生产渲染后端已经替换；当前实现、画质回归与长时间验收见 [PERFORMANCE.md](PERFORMANCE.md)。下文的“原型”“尚未实现”和限制均指调查阶段，不能套用于当前生产版本。

调查阶段交付包含根因分析、可重建的渲染原型、基准脚本及原始数据。该阶段尚未替换生产后端，关闭抗锯齿仅作为诊断，不作为等画质修复。

## 已确认的原因

### 1. 行走让“静态历史”每帧全部失效

`recordPosition()` → `invalidateReplay()` → `S.traceVersion++` → `drawStaticTrace()` 的缓存 key 改变 → 整幅 `clearRect()` 和历史轨迹重绘。`prefixCache` 原本只保留几何，不能免除历史位图重绘。

相同 48 顶点路线，120 个测量帧中，行走恰好触发 **120 次历史画布清空**。同步 CPU 提交中位数只有 **0.9 ms**，但 RAF 间隔中位数 **115.8 ms**。旋转的历史清空为 0 次，回放在同一条 leg 内也为 0 次。这足以排除“只有几十条线，所以渲染工作必定很少”的推断：异步栅格化及图层处理没有包含在同步 `render()` 计时里。

### 2. 背景是按屏幕像素查找卡片，而不是按卡片绘制

原片元 shader 对每个设备像素反算世界坐标、查最多 18 个卡片槽，再计算 UV、边缘、接缝、亮度。旋转时整屏执行。

实测背景 GPU 时间中位数约 **14.0 ms**。改为一个渐晕背景 pass，加每卡 quad，将卡片选择与相机变换移到顶点阶段后，降至约 **8.0 ms**（约 43% 减少）。这是真实 GPU timer 数据，不是 JavaScript 计时，也没有降低 DPR。

但仅改背景，行走仍约 102 ms，回放仍约 33 ms；这不是完整修复。

### 3. 多张巨型表面造成与对象数量无关的成本

1504×1492 CSS px、DPR 2 时：

| 表面 | 像素 | 单份 RGBA 大小 |
|---|---:|---:|
| WebGL stage | 3008×2984 = 8,975,872 | 34.24 MiB |
| 每帧清空的 Canvas2D replayLayer | 同上 | 34.24 MiB |
| CSS 变换的历史 traceLayer | 3380×4732 = 15,994,160 | 61.01 MiB |
| 合计 | 33,945,904 | **129.49 MiB** |

这些只是逻辑颜色表面，不是实际显存占用；未包括缓冲、MSAA、驱动内部资源。不能把这些数字直接乘 FPS 就当作已测内存带宽。

`drawReplayLayer()` 每帧清空整屏，重画所有箭头、小 chevron、标记与玩家；即使静态轨迹复用了，动态层仍有大面积失效。逐层消融显示背景单独和前景单独都接近 60Hz，而一起绘制会明显掉帧。没有采集 Chrome compositor trace，因此这里确认的是整个异步渲染路径的成本，不能进一步精确声称是 CPU raster、上传或 compositor 中的哪一项占了多少毫秒。

### 4. GPU 重写必须避免两种新瓶颈

第一版机械式 Canvas→WebGL 适配器每帧重新生成和上传三角形，CPU 中位数约 **13 ms**。稳定路径改为 model-space VBO、相机改 uniform 后，旋转 CPU 降到约 **3 ms**；历史 prefix 与活动 tail 保持独立后，行走 CPU 又从约 **8.7 ms 降到 4.7 ms**。

但在同一台机器上，保留 VBO 的全屏 MSAA 前景 GPU 时间仍约 **12.3 ms**。仅关闭前景 MSAA 后约 **4.4 ms**，旋转 RAF 中位数约 **16.7 ms**。关闭描边 stencil 没有带来改善。此差异指向 MSAA 路径的额外成本；它包含多采样栅格与相关处理，不能仅凭 timer 把全部差额归给 resolve。

更激进的“合成单个 WebGL context”实测反而约 **50 ms/帧**，GPU 总时间约 **43–44 ms**：这个原型让背景也进入全屏 MSAA，而且为了覆盖上一帧前景，每帧重画原本可复用的背景。**画布数量减少本身不是优化目标，减少实际工作量才是。**

### 5. 本轮不应优先继续微调的部分

原调度器已按需绘制，静止后没有 app RAF；HUD 限制到 10Hz。当前证据不支持以 DOM 状态文字更新、游戏逻辑、更多 worker 或简单换库为首要修复方向。

## 测试条件和读数含义

- 本机 macOS，32GB RAM；实际 Chrome GPU renderer：`ANGLE (Intel, ANGLE Metal Renderer: Intel(R) UHD Graphics 630, Unspecified Version)`。机器另有 AMD GPU，本轮记录到的渲染器是 Intel。
- Chrome 155，独立临时 profile、可见前台页面。没有连接用户现有浏览器 profile，没有导入私人图片或路线。
- 主要对照：1504×1492 CSS px，DPR 2，stage backing 3008×2984（约 898 万像素），zoom 0.888095238095238。是浏览器 viewport 仿真，不是宣称接入了该物理分辨率显示器。
- 两张 750×1050 合成图片；48 顶点、47 原始线段；9 张显示卡片，投影后 235 条线段；28 个 canonical 方向 stamps、28 个 canonical chevrons，再按正反面投影和屏幕范围裁剪。**48 顶点不是 48 个最终绘制对象。** 这是可复现 fixture，不冒充用户私人真实路线。
- 每组重新加载；500ms settle；20 warmup + 120 measured frames。每个候选独立目录、服务随机独立端口；全部 GPU 测量由主代理串行执行，子代理只写独立副本。
- rotate：140 帧覆盖约半圈；walk：固定相机下沿同一卡片水平延伸端点；replay：固定相机下在一个 compact leg 内移动 cursor。不是完整跨边界、旋转事件和长期回放覆盖。
- CPU 时间包含本次场景变化与同步 render 提交；RAF 是相邻回调时间差，不是确认已呈现 FPS。Chrome/显示器通常约 60Hz，因此不能用 RAF 直接验证 300 FPS 的吞吐。
- `EXT_disjoint_timer_query_webgl2` 只量 stage；后续 `overlayGpuMs` 单独量 WebGL1 前景。在 unified 版本，stage timer 已包含全部 GPU 绘制。**不同 context 的计时不是严格可加的墙钟时间。** 无结果/disjoint 用 null 或空样本标示，不能当 0 成本。
- walk/replay 中背景不变化，stage 的 GPU 0ms 是“没有背景 draw”，不是整帧 GPU 零耗时。
- 每帧查询结果在循环后读取，不用 `gl.finish()` 强制同步；可用样本数记录在 JSON。timer 仍有探测开销。
- 未测瓦数、温度、时钟锁定、真实 present timestamps，也未验证 Safari/Firefox/手机。结果只能说明这台设备、此 workload。几组测量没有随机交错，不能把小差别解读成可靠排名。

## 实测汇总

下表为 RAF 间隔中位数 / P95（毫秒，越低越好；约 16.7ms 对应 60Hz 回调节奏）。数据由脚本从 JSON 生成。

| 版本 | 旋转 | 行走 | 回放 |
|---|---:|---:|---:|
| [当前版本](benchmarks/rendering-2026-10-20/baseline.json) | 31.9 / 34.6 | 115.8 / 118.7 | 32.9 / 34.8 |
| [仅按卡片背景](benchmarks/rendering-2026-10-20/tiles.json) | 17.1 / 33.9 | 101.9 / 118.5 | 32.6 / 35.1 |
| [SVG 前景](benchmarks/rendering-2026-10-20/svg.json) | 84.2 / 101.1 | 34.6 / 82.0 | 17.0 / 34.6 |
| [按卡片背景＋SVG](benchmarks/rendering-2026-10-20/combined-svg.json) | 98.9 / 116.8 | 34.4 / 68.1 | 17.0 / 34.2 |
| [即时 WebGL 前景](benchmarks/rendering-2026-10-20/gpu.json) | 33.9 / 50.8 | 17.6 / 34.1 | 31.8 / 34.7 |
| [按卡片背景＋即时 WebGL](benchmarks/rendering-2026-10-20/combined-gpu.json) | 33.1 / 35.1 | 17.5 / 34.6 | 17.3 / 34.5 |
| [按卡片背景＋保留 VBO](benchmarks/rendering-2026-10-20/combined-retained.json) | 33.2 / 34.4 | 17.1 / 34.0 | 17.0 / 33.6 |
| [再分离 prefix/tail](benchmarks/rendering-2026-10-20/combined-prefix.json) | 33.2 / 49.4 | 17.1 / 33.9 | 16.9 / 33.6 |
| [单 context＋全屏 MSAA](benchmarks/rendering-2026-10-20/combined-unified.json) | 50.1 / 66.6 | 50.1 / 66.9 | 50.1 / 67.1 |
| [关闭前景 MSAA（诊断），重复第 2 轮](benchmarks/rendering-2026-10-20/no-msaa-repeat.json) | 16.7 / 18.2 | 16.6 / 18.1 | 16.6 / 18.1 |

关闭 MSAA 的两轮三场景重复中位数均为 16.6–16.7ms，P95 为 18.1–18.5ms；第一轮旋转仍有一个 34.2ms 最大间隔，第二轮旋转最大 18.7ms。它证明了优化方向，不能被描述为所有场景永不掉帧或等画质完成。

早期消融的完整数值见 `benchmarks/rendering-2026-10-20/initial-ablation.json`：空 RAF 16.7/18.1；原版首尾重复 32.1/34.6 与 32.2/34.5；仅背景 16.8/18.0；无背景 16.6/18.1；隐藏并停止动态 overlay 17.3/34.1；隐藏并停止静态历史 16.7/33.6。部分工作省掉后恢复节奏，说明原方案缺少帧预算余量；不能把各组中位数相减当作各层的准确耗时。

## 候选方案、成本和风险

以下工期为熟悉代码的开发者的工程估计，不是测量值；包含常见回归处理，不含全面设备验收。

| 方案 | 性能收益判断 | 迁移成本 | 主要风险与结论 |
|---|---|---|---|
| Canvas2D 局部修补：历史/活动端点分层、dirty bounds、只在变化时更新 glyph | 能消除 120/120 次历史重画，行走应明显改善；未独立实现和测量此完整组合，不能给倍数保证 | 约 1–3 天 | 旋转、缩放和箭头移动仍可产生大面积失效；适合短期过渡，达不到低成本高帧率的架构保证 |
| 按卡片 WebGL quad 替换背景 shader | 已测 GPU 约 14→8ms | 约 0.5–1 天 | 保留色彩/接缝，但 blend 量化、卡边覆盖需视觉核验；只能作为基础改造 |
| SVG retained 前景 | 本 fixture 行走/回放有改善，但旋转 84–99ms，明显比原版差 | 约 2–4 天 | SVG 变换和复杂描边仍触发昂贵绘制；本项目不推荐作为主路线 |
| 直接把全部 Canvas 命令转为 WebGL | 行走改善，但产生约 13ms CPU，旋转仍失败 | 约 3–5 天 | 每帧 tessellation、bufferData、碎片 draw；不推荐机械移植 |
| **保留 GPU 几何 + 按卡片背景 + 局部/解析抗锯齿** | 已验证 VBO、prefix/tail 和 shader 分别消除相应重复工作；关闭 MSAA 的诊断显示可接近 60Hz，但等画质 AA 方案尚需验证 | 约 5–10 天 | AA 边缘、半透明交叉、纹理缓存、context restore 必须完成。**推荐主路线**，保留现有业务/几何模型，只换渲染后端 |
| 单 WebGL context、整屏 MSAA | 本次原型退化到约 50ms，GPU 43–44ms | 在 GPU 重写上增加约 1–3 天 | 背景被迫重复绘制和多采样；不要把“单画布”当硬性目标。可评估静态背景 FBO 与选择性 AA，但本轮未实现 |
| PixiJS 等成熟 2D 引擎 | 可以实现 retained geometry、sprite atlas 与批处理；本轮未跑 PixiJS，**没有其 FPS 数据** | 约 4–8 天 | 库默认 ticker、Graphics 重建、mask/filter/MSAA 仍可能重现瓶颈；需自定义接缝和线条视觉。维护成本优先时可采用，但收益来自管线设计而非库名 |
| WebGPU 完全重写 | 可以实现同样的管线；目前没有证据说明 API 切换能消除表面带宽、MSAA 和错误失效 | 约 8–15 天 | WGSL、device loss、兼容/回退与双后端维护。当前 draw/compute 规模没有显示必须使用 WebGPU；本轮未跑 WebGPU，不报虚构倍数 |
| OffscreenCanvas + worker | 隔离主线程计算，可能改善输入响应 | 约 2–4 天 | 不消除 GPU 填充、多采样、巨大表面或错误历史重绘；当前非首选，未跑独立 worker 实验 |

PixiJS 官方说明引擎可用 WebGL/WebGPU，并明确指出 WebGPU 不自动保证所有场景更快：[架构](https://pixijs.com/8.x/guides/concepts/architecture)、[v8 说明](https://pixijs.com/blog/pixi-v8-launches)。WebGPU 的环境条件和设备模型见 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)。这些是技术取舍的依据，不是本项目的测量结果。

## 推荐实施边界与验收

推荐重写**绘制后端**，保留 `ReplayCore`、canonical face/row 映射、路线编译、会话格式、输入和回放状态机。

1. 背景改为按卡片 quad，保留按需更新。不要因为合并 context 而无条件重画静态背景。
2. 静态历史保留 model-space VBO；活动 tail 单独更新。相机运动只改 uniform；颜色、线宽、箭头屏幕尺寸不能被世界矩阵错误缩放。
3. 小图标与文字使用有上限的 atlas/缓存，批处理；不要将 1600 万像素历史 Canvas 上传成纹理作为所谓 GPU 重写。
4. 抗锯齿预算独立设计：优先验证局部或解析覆盖；如果需要 MSAA，用选择性小 render target/明确预算，而非给所有高清像素默认加 MSAA。解析 AA 是否满足本项目透明交叠与圆角语义，需要实验，尚无本轮实测承诺。
5. 保留当前 idle sleep、visibility suspend。GL 资源在 context restore 后全部重建；处理文字缓存、VBO 和 atlas 的回收。
6. 对颜色交叠顺序、跨卡接缝、奇偶行镜像、四向旋转、负坐标、前后向部分回放、事件预览、markers/labels 和缩放做视觉回归。当前原型只作初步截图检查，不能替代这些验收。

建议验收门槛：目标设备上同画质、同分辨率三类 workload 连续测至少 30 秒；RAF P95 接近一帧且无持续隔帧，配对确认 presented frame trace；稳定状态零 app RAF；CPU 和 GPU 都给 16.7ms 留明显余量。低功耗必须另测设备能耗，不从短时 FPS 推断。

“数百 FPS”适合作为离屏渲染吞吐的另一个目标，不能直接当 60Hz 显示器上的 RAF 目标。[requestAnimationFrame 文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)说明其通常随显示刷新率运行。这里 898 万像素和集成 GPU 已测的 GPU 时间也不支持“只凭对象数就保证数百 FPS”；正确验收应先规定分辨率、画质、GPU 和测量方式。

## 重现

无需安装项目依赖。基准需要外部已安装的 Playwright 和 Chrome；环境路径通过变量传入。脚本启动只监听本机的随机端口服务与独立临时 Chrome profile，`finally` 关闭它们。

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
OCM_MODES=full OCM_WORKLOADS=rotate,walk,replay \
OCM_OUTPUT=/tmp/ocm-baseline.json \
node tests/rendering-benchmark.cjs

python3 experiments/rendering/materialize.py combined-prefix /tmp/ocm-prefix
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
OCM_ROOT=/tmp/ocm-prefix OCM_MODES=full OCM_WORKLOADS=rotate,walk,replay \
OCM_OUTPUT=/tmp/ocm-prefix.json \
node tests/rendering-benchmark.cjs
```

`materialize.py` 固定从上述基线 commit 重建独立副本，拒绝覆盖已有目录。可选 `tiles`、`svg`、`gpu`、`retained`、`prefix`、`unified`，以及各前景方案的 `combined-` 版本（加上 tile shader）。`no-msaa` 和 `no-stencil` 是明确不等画质的诊断版本。

`OCM_WIDTH`、`OCM_HEIGHT`、`OCM_DPR`、`OCM_FRAMES`、`OCM_ROUNDS` 可配置；默认值对应上面的主要对照。`OCM_MODES=empty,full,no-overlay,no-static,no-stamps,no-art,art-only,full` 用于原版消融。消融靠服务器只在响应中注入 hook，不改磁盘原文件；**这些 hooks 针对原版结构，候选版本只应使用 `full`，不要把候选上的未适配消融当有效结果。**

原型适配器不是通用 Canvas API 实现。已知缺项包括部分 line join/cap、近似文字基线、受限 clip、GPU overlay context restore、文字缓存上限；原型也没有完整 marker/事件/移动端验收。第三版通过不可变子 path 复用历史，这一假设仅适用于当前应用的构建方式。

## 视觉与静态验证

在 1000×900 CSS px、DPR2、非对称正反面合成图片上检查了 0°、约21.2°、90°和负坐标视图。原版、tile shader、保留VBO前景均无页面异常或WebGL错误（错误码0）；轨迹、方向图标与卡片位置在代表性截图中一致。仅背景改造的截图差值平均每通道为0.005–0.023/255，没有像素超过8/255的最大通道差值，见[数值](benchmarks/rendering-2026-10-20/visual-diff.json)。这只覆盖三个姿态，不等于逐像素等价或完整功能验收。

代表截图：[原版](benchmarks/rendering-2026-10-20/visual/baseline-rotate.png)、[GPU前景候选](benchmarks/rendering-2026-10-20/visual/retained-rotate.png)。GPU版的描边抗锯齿与文字基线仍有适配器差异；关闭MSAA版没有通过等画质验收。

现有四组自动化检查 `replay.test.js`、`trace.test.js`、`session.test.js`、`performance.test.js` 全部通过；基准和各适配器通过语法检查。八个代表原型已从固定基线及提交在本仓库的补丁重建，并逐字节核对与实际测量副本一致。所有本轮 Chrome 实例通过 finally 关闭，临时服务已停止，独立实验目录已删除；原始 JSON、必要补丁/适配器和代表性截图保留在仓库。
