# 2026-10-22 全尺寸证据

结论、可比条件、未解决的首次回放等待见 [PERFORMANCE.md](../../PERFORMANCE.md)。基线为 `3d1c1850e631369375e8bd5c0af4fdad7644f07a`。所有运行使用独立临时服务/profile，GPU 实验串行。

## 文件分组

- `paired-before.json` / `paired-after.json`：同一修正后的驱动，各场景10秒，3008×1492 CSS/DPR2，真实点击/按键、原调度器与HUD、录制转向回放、完整首轮交互、native window/drawingBuffer首尾审计。`paired-presentation.json` 含这六个样本及30秒重复回放的呈现计数。
- `fullsize-unified-events-interaction.json`：首次30秒长测，旋转/行走保持活动；回放单次完成后约16秒休眠。不能把休眠当作高FPS。`fullsize-unified-presentation.json` 是对应呈现结果。
- `replay-repeat.json`：补充30秒真实重复回放（点击Replay again），包括首轮长帧，非预热后筛选。
- `fullsize-ablation.json`：旧版3008×1492、240帧/项，空绘制、仅背景、仅前景、完整绘制。GPU timer开启；固定步长状态机驱动，不能与真实输入驱动混合。
- `fullsize-baseline-interaction.json`、`fullsize-retained-discard-interaction.json`、`fullsize-unified-direct-interaction.json`、`fullsize-highperf-interaction.json`：早期全尺寸10秒探索，plain replay 0.2×、初始follow=false，没有后续native window审计，均保留。前三个用Intel，最后明确请求高性能后实测为AMD。
- `fullsize-highperf-gpu.json` / `fullsize-unified-highperf-gpu.json`：AMD双context与单context，固定状态机驱动各360帧、GPU timer开启。单context是整帧query；双context的两个query不能相加成关键路径。
- `baseline-ablation.json`、`partition-candidate.json`、`retained-glyphs-candidate.json`：**1504×1492半宽探索**。用户纠正尺寸后不再作为全屏验收依据。
- `hidden-ui-ablation.json`：20秒探索，UI隐藏且Space启动，单次回放结束后休眠。输入和合成条件均不同，不能据此认定UI是根因。
- `rejected-promoted-ui.json` / `rejected-solid-progress.json`：完整UI实际点击的20秒候选测试，未显示可靠收益，未合入；不是候选UI画质/跨浏览器验收。
- `replay-stall-analysis.json` / `replay-deep-stall-analysis.json`：首轮回放的SwapBuffers、CoreAnimation/Metal等待证据与归因边界。
- `visual-regression.json`：11场景基线对照、恢复和真实WebGL抗锯齿检查结果。归档两张dense-rotation原始6016×2984 PNG；其他截图可用 `tests/browser-regression.cjs` 重新生成。
- `unit-tests.txt` / `ui-qa.txt`：完整必需回归结果。UI QA的SwiftShader只用于功能/布局，不进入硬件性能结论。

## 呈现 trace

`*-presentation.json.gz` 保留原trace的进程/线程metadata、FrameSequenceTrackerV3/Frame、测量marks及相关swap/Metal背压事件，**不是完整CPU/GPU profile**。过滤前后逐项断言tracker计数和droppedIntervals完全相同。`trace-manifest.json` 记录原完整trace哈希、大小、归档哈希及事件数。完整大trace与实验临时副本已清理；JSON中的 `/private/tmp/...` 和旧运行root是当时的来源信息，不是仍在运行的服务。

可独立复算：

```sh
python3 tests/summarize-render-trace.py benchmarks/rendering-2026-10-22/*-presentation.json.gz
```

RAF/JSAnimation tracker可能重叠，不相加。`passed:true` 只表示有效运行与功能断言通过；以具体长帧、呈现丢失和首次交互记录判断性能。
