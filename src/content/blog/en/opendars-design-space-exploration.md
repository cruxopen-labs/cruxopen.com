---
title: "128 designs, 7 Pareto points, and a 361-LUT knife edge: calibrating openDARS"
description: "How a calibrated analytical model searches 128 hardware/mapping combinations in seconds, why its 0.30% training error still cannot rank the top two FPGA points, and why the next step is synthesis — not a cycle-accurate simulator."
date: 2026-11-14
author: Yuqi
tags: [openDARS, design-space exploration, FPGA, methodology]
---

[openTARS](https://github.com/cruxopen-labs/openTARS) v3.3 runs Qwen3.5-0.8B on a KV260 at 0.13 s/token. The interesting question is no longer whether the board can run a model. It is what to change next: wider VPU, more FDOT lanes, a bigger hold buffer, a different GEMV batch, an MXU, a faster clock, more DDR bandwidth — and which mapping to pair with it.

That question has a large, discrete answer space and a very expensive oracle. RTL simulation of one full model run is minutes to hours; the board cannot measure hardware that does not exist yet. So [openDARS](https://github.com/cruxopen-labs/openDARS) takes the third route: fit an analytical model to measurements that already exist, search the space in seconds, and then spend RTL and synthesis time only where the decision is actually close.

This post is about what that buys, where it stops, and the number that made me stop trusting the fastest point: **361 LUTs**.

## What openDARS actually does

The pipeline is deliberately boring:

1. Read the Hugging Face configs for Qwen3-0.6B, Qwen3.5-0.8B and Gemma3-1B.
2. Lower each model, shape only, into the ordered W8A8 descriptor queue openTARS would execute — GQA, rotary dimensions, the DeltaNet recurrence, split Gemma down projections, equal-block LM heads, aligned prefill chunks and tails.
3. Run the queue through a parameterized hardware and mapping model: GEMV width and batch, VPU/FDOT/SFU lanes, DDR bandwidth, write width, hold buffer, outstanding reads, queue depth, clock and optional MXU.
4. Predict cycles with a nonnegative per-class regression fitted on real openTARS counters, then estimate FPGA resources and power anchored at the v3.3/v3.4 baseline.
5. Search the discrete space with an exhaustive grid and a seeded NSGA-II, and keep every candidate, every per-model decode/prefill latency and every calibration error in JSON.

No checkpoints, no torch, no FPGA, and no RTL simulator in the inner loop. The full report takes about 70 seconds and 300 MiB of memory on the development machine.

## The model is not the point; the calibration is

An analytical model is only as good as the evidence behind it. The repository keeps 13 measurement snapshots copied byte-for-byte from openTARS, and the lowering is checked against 12 real descriptor queues with exact semantic field order. Gemma is never used in the fit. Neither are the baseline or repeat runs.

| Evidence | Result |
|---|---|
| Qwen training total cycles | **0.30%** MAPE, 0.74% worst |
| Gemma held-out | **4.20%** MAPE, 4.72% worst |
| Baseline / repeat / excluded | 6.34% worst |
| Qwen training per-class | 8.02% worst |
| Tests | 21 |
| Measurement snapshots | 13, byte-identical to openTARS |

That 0.30% is a fit, not a validation number. The number that matters for a new design is the held-out one: 4.20% on a model family the fit never saw, and 6.34% on the worst excluded run. It is good enough to rank configurations that differ by tens of percent. It is not good enough to rank configurations that differ by two.

## The frontier

The default space is 128 hardware/mapping combinations. The FPGA grid evaluates all of them, prunes 48 as resource-infeasible, and leaves 80 feasible designs. Seven are nondominated on latency, area and power:

| Point | Normalized latency | LUT fraction | Power (W) |
|---|---:|---:|---:|
| 1 (fastest) | 0.8599 | 0.9969 | 4.619 |
| 2 | 0.8793 | 0.9450 | 4.504 |
| 3 | 0.9436 | 0.8955 | 4.443 |
| 4 | 1.0412 | 0.8716 | 4.398 |
| 5 | 1.1732 | 0.8849 | 4.386 |
| 6 | 1.2375 | 0.8354 | 4.325 |
| 7 | 1.3351 | 0.8115 | 4.280 |

The fastest two are **2.27%** apart in latency, **5.21%** apart in area and **2.47%** apart in power. The fastest and third are 9.74% apart. Beyond that, the frontier is separated by 21–55% from the fastest point.

A seeded NSGA-II recovered all seven distinct exact-grid objective tuples in the same space. That is a good check on the search implementation, but it does not make the top of the frontier more certain.

<figure class="vchart" aria-label="Decision gap between the top two FPGA points compared with held-out model error">
<div class="vchart-row"><span class="vchart-k">1 vs 2</span><span class="vchart-bar" style="--w:35.8%"></span><span class="vchart-v">2.27%</span></div>
<div class="vchart-row"><span class="vchart-k">Gemma</span><span class="vchart-bar" style="--w:66.2%"></span><span class="vchart-v">4.20%</span></div>
<div class="vchart-row vchart-last"><span class="vchart-k">Worst</span><span class="vchart-bar" style="--w:100%"></span><span class="vchart-v">6.34%</span></div>
<figcaption>The gap between the top two FPGA points is smaller than the held-out model error. A better cycle model can resolve that gap; it cannot resolve the area ranking, which depends on PPA priors.</figcaption>
</figure>

## The 361-LUT knife edge

The fastest point uses 116,759 of the KV260's 117,120 LUTs. It has **361 LUTs of headroom — 0.31%**.

Its extra area over point 2 comes almost entirely from the hold-buffer slope, which is an engineering prior of 80 LUT/KiB, not a synthesized number. A slope error of **+5.9%** (80 → 84.8 LUT/KiB) makes the fastest point infeasible. A VPU slope error of **+6.2%** (1,450 → 1,540 LUT/lane) does the same. Either error is entirely plausible for a prior that has never been through synthesis.

So the fastest point is not a recommendation. It is a hypothesis about a slope. The report says this explicitly and recommends the 94.50% LUT point as the better first synthesis experiment, even though it is 2.27% slower in the model. A cycle-accurate latency model would not change that sentence. Only synthesis will.

This is the most useful thing the search produced: not “build the 0.8599 point,” but “the top of this frontier is a PPA calibration problem, so go calibrate PPA.”

## So why not just simulate?

A cycle-accurate simulator already exists. [openTARS](https://github.com/cruxopen-labs/openTARS) has a Verilator harness around the RTL core (`tars_mini/rtlsim.py`), with ideal or DRAMsim3 memory, the KV260 top and cycle counters. The question is not whether to build one; it is whether to put it in the search loop.

The arithmetic says no:

- The six default workloads total **337.4 M core cycles** and **59,436 descriptors**.
- One 128-point grid is **43.18 Gcycles** and **7.6 M descriptors**, before any rebuild or model-image export.
- At 1 MHz simulated and 32 workers, the pure simulation is about **22 minutes**. At 100 kHz it is 3.75 hours; at 10 kHz it is 37.5 hours. Those are throughput scenarios, not measurements.
- The 32 distinct hardware points each need a parameterized RTL build, and the model image is about 1.5 GB.

The deeper problem is coverage. The RTL can run chunking and head-skipping because they change the queue. It cannot run `fusion`, `gqa_reuse` or the Block DeltaNet schedule, because those are analytical traffic hypotheses, not executable openTARS queues. A full RTL sweep would validate a subset of the search space, and it would still leave area, power and timing to synthesis.

So the recommendation in the [cycle-accuracy assessment](https://github.com/cruxopen-labs/openDARS/blob/main/docs/cycle_accuracy_assessment.md) is a two-stage search: keep the analytical grid as the screen, then run RTL simulation only on the two to five candidates whose latency gap is inside the model's uncertainty band and whose mechanisms the RTL actually implements. Synthesize the shortlist. That is cheaper and more informative than simulating 128 designs.

## What I would do next

1. **Synthesize the two top FPGA points.** Report actual LUT/FF/DSP/BRAM, Fmax and power. This resolves the 0.31% headroom question and calibrates the hold-buffer and VPU slopes.
2. **Run targeted RTL microbenchmarks.** Measure VPU lanes, FDOT, hold buffer, GEMV epilogue and outstanding reads against the analytical slopes. Update the priors once, and all 128 points improve.
3. **Keep the two-stage search.** Analytical screen, RTL and synthesis for the shortlist. Add a descriptor-level trace model only if the design space grows concurrency knobs that the serialized model cannot rank.
4. **Do not build a new full cycle-accurate model from scratch.** The existing RTL simulator is already the ground truth for latency. Building another one duplicates it and still needs calibration for anything that is not in RTL.

## Reproduce it

Everything is in [openDARS](https://github.com/cruxopen-labs/openDARS) under Apache-2.0:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
pytest -q
dars report --out reports
```

The [generated report](https://github.com/cruxopen-labs/openDARS/blob/main/reports/report.md) has every candidate, every per-model latency and every calibration error. The [cycle-accuracy assessment](https://github.com/cruxopen-labs/openDARS/blob/main/docs/cycle_accuracy_assessment.md) has the cost/benefit argument in full. `tools/decision_margins.py` prints the frontier gaps, the LUT headroom and the simulation budget used above.

If you are choosing the next hardware point for an edge NPU — or you have a different answer to the cycle-accuracy question — I would like to hear it: [hello@cruxopen.com](mailto:hello@cruxopen.com).
