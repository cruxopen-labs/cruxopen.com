---
title: "128 个设计、7 个 Pareto 点，和 361 个 LUT 的刀锋：标定 openDARS"
description: "一个标定过的分析模型如何在秒级搜索 128 种硬件/映射组合；为什么 0.30% 的训练误差仍然排不出前两名；以及为什么下一步是综合，而不是 cycle-accurate 仿真器。"
date: 2026-11-14
author: Yuqi
tags: [openDARS, 设计空间探索, FPGA, 方法论]
---

[openTARS](https://github.com/cruxopen-labs/openTARS) v3.3 已经在 KV260 上以 0.13 s/token 跑 Qwen3.5-0.8B。现在真正有趣的问题不再是“板子能不能跑模型”，而是下一步改什么：更宽的 VPU、更多 FDOT lane、更大的 hold buffer、不同的 GEMV batch、上 MXU、提高时钟、加 DDR 带宽——以及配哪一套 mapping。

这个问题的答案空间很大、离散，而且 oracle 非常贵。一次完整模型的 RTL 仿真要几分钟到几小时；板卡又测不了还不存在的硬件。所以 [openDARS](https://github.com/cruxopen-labs/openDARS) 走第三条路：用已经存在的测量拟合一个分析模型，在秒级搜索整个空间，然后只把 RTL 和综合时间花在真正接近的决策上。

这篇文章讲这条路买到了什么、在哪里停下，以及那个让我不再相信“最快点”的数字：**361 个 LUT**。

## openDARS 到底做了什么

流程故意做得很无聊：

1. 读 Qwen3-0.6B、Qwen3.5-0.8B、Gemma3-1B 的 Hugging Face 配置。
2. 只做 shape 层面的 lowering，变成 openTARS 会执行的有序 W8A8 描述符队列——GQA、旋转维度、DeltaNet 递推、Gemma 拆分的 down projection、等分 LM head、对齐的 prefill chunk 和尾部。
3. 让队列经过参数化硬件与 mapping 模型：GEMV 宽度和 batch、VPU/FDOT/SFU lane、DDR 带宽、写宽度、hold buffer、在途读、队列深度、时钟和可选 MXU。
4. 用在真实 openTARS 计数器上拟合的非负逐类回归预测周期，再以 v3.3/v3.4 基线为锚估算 FPGA 资源和功耗。
5. 用穷举网格和带种子的 NSGA-II 搜索离散空间，并把每个候选、每个模型的 decode/prefill 延迟和每个标定误差都留在 JSON 里。

没有 checkpoint、没有 torch、没有 FPGA，内循环里也没有 RTL 仿真器。完整报告在开发机上大约 70 秒、300 MiB 内存。

## 重点不是模型，而是标定

分析模型的上限由证据决定。仓库保留了 13 份从 openTARS 逐字节复制的测量快照，lowering 也与 12 条真实描述符队列逐项比对，语义字段顺序完全一致。Gemma 从未参与拟合，baseline 和 repeat 也没有。

| 证据 | 结果 |
|---|---|
| Qwen 训练集总周期 | **0.30%** MAPE，最差 0.74% |
| Gemma 留出 | **4.20%** MAPE，最差 4.72% |
| baseline / repeat / 排除项 | 最差 6.34% |
| Qwen 训练集逐类 | 最差 8.02% |
| 测试 | 21 项 |
| 测量快照 | 13 份，与 openTARS 逐字节一致 |

0.30% 是拟合值，不是验证值。对新设计真正有意义的是留出集：一个拟合从未见过的模型家族上 4.20%，最差排除项 6.34%。这足以区分差几十个百分点的配置，但不足以区分差两个百分点的配置。

## 前沿

默认空间有 128 种硬件/映射组合。FPGA 网格全部评估，其中 48 种因为资源不可行被剪掉，剩下 80 种可行设计。在延迟、面积和功耗三个目标上，有 7 个非支配点：

| 点 | 归一化延迟 | LUT 占比 | 功耗 (W) |
|---|---:|---:|---:|
| 1（最快） | 0.8599 | 0.9969 | 4.619 |
| 2 | 0.8793 | 0.9450 | 4.504 |
| 3 | 0.9436 | 0.8955 | 4.443 |
| 4 | 1.0412 | 0.8716 | 4.398 |
| 5 | 1.1732 | 0.8849 | 4.386 |
| 6 | 1.2375 | 0.8354 | 4.325 |
| 7 | 1.3351 | 0.8115 | 4.280 |

最快的前两名，延迟只差 **2.27%**，面积差 **5.21%**，功耗差 **2.47%。** 第一名和第三名差 9.74%。再往后，前沿与最快点的距离在 21–55% 之间。

带种子的 NSGA-II 在同一个空间里找回了全部 7 个不同的精确网格目标元组。这是对搜索实现的好检查，但不会让前沿顶部变得更确定。

<figure class="vchart" aria-label="前两名 FPGA 点的决策差距与留出集模型误差对比">
<div class="vchart-row"><span class="vchart-k">1 vs 2</span><span class="vchart-bar" style="--w:35.8%"></span><span class="vchart-v">2.27%</span></div>
<div class="vchart-row"><span class="vchart-k">Gemma</span><span class="vchart-bar" style="--w:66.2%"></span><span class="vchart-v">4.20%</span></div>
<div class="vchart-row vchart-last"><span class="vchart-k">最差</span><span class="vchart-bar" style="--w:100%"></span><span class="vchart-v">6.34%</span></div>
<figcaption>前两名 FPGA 点的差距小于留出集的模型误差。更好的 cycle 模型能分辨这个差距，但解决不了面积排序——面积排序依赖 PPA 先验。</figcaption>
</figure>

## 361 个 LUT 的刀锋

最快点用了 KV260 的 117,120 个 LUT 中的 116,759 个，只剩 **361 个 LUT 的余量，0.31%**。

它相对第二名的额外面积，几乎全部来自 hold buffer 的斜率。这个斜率是 80 LUT/KiB 的工程先验，不是综合出来的数字。斜率只要错 **+5.9%**（80 → 84.8 LUT/KiB），最快点就不可行；VPU 斜率错 **+6.2%**（1,450 → 1,540 LUT/lane），结果一样。对一个从未经过综合的先验来说，这两种误差都完全可能。

所以最快点不是建议，而是一个关于斜率的假设。报告明确写了这一点，并建议先把 94.50% LUT 的那个点拿去综合，即使模型里它慢 2.27%。cycle-accurate 延迟模型不会改变这句话，只有综合会。

这才是搜索最有用的产出：不是“去做 0.8599 那个点”，而是“这个前沿的顶部是 PPA 标定问题，先去标定 PPA”。

## 那为什么不直接仿真？

cycle-accurate 仿真器其实已经有了。[openTARS](https://github.com/cruxopen-labs/openTARS) 有一套 Verilator 包着 RTL 核心的 harness（`tars_mini/rtlsim.py`），支持理想内存或 DRAMsim3、KV260 顶层和周期计数器。问题不是要不要造一个，而是要不要把它放进搜索循环。

算术上不划算：

- 六个默认 workload 合计 **337.4 M 核心周期**、**59,436 个描述符**。
- 一个 128 点的网格就是 **43.18 G 周期**、**7.6 M 个描述符**，还不含重建和模型镜像导出。
- 按 1 MHz 仿真、32 个 worker，纯仿真约 **22 分钟**；100 kHz 是 3.75 小时，10 kHz 是 37.5 小时。这些是吞吐场景，不是实测。
- 32 个不同的硬件点各需要一套参数化 RTL 构建，模型镜像约 1.5 GB。

更深的问题是覆盖范围。RTL 能跑 chunk 和 skip-head，因为它们改变队列；但跑不了 `fusion`、`gqa_reuse` 和 Block DeltaNet 调度，因为那些是分析式的流量假设，不是 openTARS 可执行队列。全量 RTL sweep 只能验证搜索空间的一个子集，面积、功耗和时序仍然要交给综合。

所以 [cycle-accurate 评估](https://github.com/cruxopen-labs/openDARS/blob/main/docs/cycle_accuracy_assessment.md)给出的建议是两阶段搜索：分析式网格继续做筛选；只对延迟差距落在模型误差带内、且 RTL 真的实现了其机制的 2–5 个候选跑 RTL 仿真；再对短名单做综合。这比仿真 128 个设计更便宜，也更有信息量。

## 接下来我会做什么

1. **先综合最快的两个 FPGA 点。** 报出真实 LUT/FF/DSP/BRAM、Fmax 和功耗。这能回答 0.31% 余量的问题，也能标定 hold buffer 和 VPU 的斜率。
2. **做针对性的 RTL microbenchmark。** 用 RTL 测 VPU lane、FDOT、hold buffer、GEMV epilogue 和在途读，对上分析斜率。先验更新一次，128 个点全部受益。
3. **保留两阶段搜索。** 分析筛选，短名单才上 RTL 和综合。只有当设计空间扩展到串行模型排不出的并发参数时，才加 descriptor-level trace model。
4. **不要从零造一个新的完整 cycle-accurate 模型。** 现有 RTL 仿真已经是延迟的 ground truth；再造一个只是重复，而且任何不在 RTL 里的机制仍然要标定。

## 自己复现

所有内容都在 [openDARS](https://github.com/cruxopen-labs/openDARS) 里，采用 Apache-2.0：

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
pytest -q
dars report --out reports
```

[生成的报告](https://github.com/cruxopen-labs/openDARS/blob/main/reports/report.md)保留了每个候选、每个模型的延迟和每个标定误差。[cycle-accurate 评估](https://github.com/cruxopen-labs/openDARS/blob/main/docs/cycle_accuracy_assessment.md)有完整的成本/收益论证。`tools/decision_margins.py` 会打印上面用到的前沿间距、LUT 余量和仿真预算。

如果你也在为端侧 NPU 选下一个硬件点，或者对 cycle-accurate 这个问题有不同答案，欢迎写信到 [hello@cruxopen.com](mailto:hello@cruxopen.com)。
