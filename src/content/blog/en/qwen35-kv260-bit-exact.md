---
title: "Running Qwen3.5-0.8B bit-exact on a KV260: what an NPU learns from a $250 board"
description: "From 2.6 to 0.13 s/token on a $249 FPGA board, with every logit matching the golden model: why a GEMV is not a GEMM with M = 1, how a row interleave cost 2.7× read amplification, and why speculative decoding stays off at 0.97×."
date: 2026-11-07
author: Yuqi
tags: [openTARS, NPU, FPGA, LLM inference]
---

[openTARS](https://github.com/cruxopen-labs/openTARS) now runs Qwen3.5-0.8B on an AMD Kria KV260, a $249 FPGA starter kit, at **0.13 s/token**. At every decoding step, every logit on the board matches the golden model bit for bit. The first bitstream that ran the model correctly took 2.6 s per token. Eight versions on the board later, it is 20 times faster, and it never stopped being bit-exact.

This post is about what those eight versions taught me about NPU design. Very little of it is specific to FPGAs. Decode is a memory problem; the memory has to be measured, not assumed; and a speed-up counts only once it has been measured as well, including the one that did not pay.

| At a glance | |
|---|---|
| Board | AMD Kria KV260 (XCK26 FPGA, 4 GB DDR4), $249 list price |
| Model | Qwen3.5-0.8B: 18 Gated DeltaNet + 6 gated full-attention layers, INT8 W8A8, 887 MiB on the device |
| Core clock | 100 MHz |
| Decode | 13.2 M cycles = **0.13 s/token** on short contexts |
| Prefill | 0.089 s/token (20-token prompt, chunks of 4) |
| Correctness | every step's logits bit-exact against the golden model (`run.sh selftest`) |
| Area | 104,879 LUTs (89.6% of the XCK26) |

## What runs where

TARS-mini is the first end-to-end slice of the TARS NPU: one core that executes a queue of 512-bit descriptors. Its source of truth is a written contract. The contract's executable form is a Python golden model, and the golden model contains no microarchitecture at all: no array size, no buffer counts, no latencies. It specifies result bits, and the RTL has to reproduce them on every DRAM byte.

The core started life as an ASIC reference design, timed for 1 GHz pre-layout on the ASAP7 library. The first full FPGA synthesis needed 603,792 LUTs, 5.2 times what the XCK26 has. A vector datapath built for 1 GHz processes four elements a cycle with a complete fp32 pipeline in every slot: ten full activation units and about 115 floating-point adders. One buffer, synthesised as flip-flops because of its multi-port byte reads, cost 125k LUTs on its own. Sharing one special-function unit across the core, removing duplicated units and moving that buffer into LUTRAM brought the first board version to 100,434 LUTs. Every FPGA change sits behind `` `ifdef TM_FPGA ``, so the ASIC build's bits and cycle counts did not move.

On the board, the NPU executes all 2,730 descriptors of a decode step: 24 layers, the final norm and the tied output head over a 248,320-token vocabulary. The Arm cores do two things: look up the embedding and take the argmax. There is no kernel driver. The 1 GB model image sits in 512 hugepages of 2 MB, and their physical page numbers go into a page table inside the core.

## Lesson 1: the simulator was three times too optimistic

Version 1.0 passed everything on its first boot: 24 of 24 hardware tests, and 43 decoding steps across two prompts, all bit-exact. It took 261 M cycles a token, which is 2.6 s. Simulation with an ideal memory port had predicted 0.85 s.

The gap was the memory system. Real DDR latency is high, and the v1.0 AXI bridge sent every request as a single 16-byte beat. Version 1.1 merged consecutive reads into bursts of up to 16 beats, and AXI read transactions per token fell from 57 M to 18 M. The simulator called that 18% faster. On the board it was 2.9 times faster, because the simulator had underpriced fragmented requests.

So before widening anything, I built a separate bitstream that did nothing but measure the platform: four AXI traffic generators, one on each high-performance (HP) port, at 200, 250 and 333 MHz.

| Finding | Measured |
|---|---|
| A port's ceiling is 16 B × its clock | 3.2 GB/s at 200 MHz, 4.0 at 250, 5.2 at 333 |
| Each port handles about 70 M transactions a second | single-beat 16 B bursts reach only 1.15 GB/s |
| HP1 and HP2 share one DDR controller port | 8.3 GB/s between them |
| All four ports at once | 12.3–12.8 GB/s at 200–250 MHz, but 10.7 at 333 |
| Idle read latency | about 140–155 ns |

The plan for bandwidth fell out of that table: more ports in parallel, 250 MHz and long bursts, not a faster single port. Versions 3.0 and 3.2 are that table turned into hardware.

The other half of the fix was the model. A simulated memory with the board's measured behaviour (1.55 cycles a beat, against 1.58 measured on the board) made the predictions trustworthy again. Version 1.4 was predicted to be 15–20% faster and measured 18%.

> On a new platform, the first thing to build is the measurement. Calibrate the simulator against it before you trust a single projection.

## From 2.6 to 0.13 s/token

<figure class="vchart" aria-label="Decode time per token for each bitstream version">
<div class="vchart-row"><span class="vchart-k">v1.0</span><span class="vchart-bar" style="--w:100%"></span><span class="vchart-v">2.6 s</span></div>
<div class="vchart-row"><span class="vchart-k">v1.1</span><span class="vchart-bar" style="--w:34.6%"></span><span class="vchart-v">0.90 s</span></div>
<div class="vchart-row"><span class="vchart-k">v1.3</span><span class="vchart-bar" style="--w:28.1%"></span><span class="vchart-v">0.73 s</span></div>
<div class="vchart-row"><span class="vchart-k">v1.4</span><span class="vchart-bar" style="--w:23.1%"></span><span class="vchart-v">0.60 s</span></div>
<div class="vchart-row"><span class="vchart-k">v2.0</span><span class="vchart-bar" style="--w:13.8%"></span><span class="vchart-v">0.36 s</span></div>
<div class="vchart-row"><span class="vchart-k">v3.0</span><span class="vchart-bar" style="--w:8.1%"></span><span class="vchart-v">0.21 s</span></div>
<div class="vchart-row"><span class="vchart-k">v3.2</span><span class="vchart-bar" style="--w:6.2%"></span><span class="vchart-v">0.16 s</span></div>
<div class="vchart-row vchart-last"><span class="vchart-k">v3.3</span><span class="vchart-bar" style="--w:5%"></span><span class="vchart-v">0.13 s</span></div>
<figcaption>Qwen3.5-0.8B decode time per token, measured on the board at 100 MHz, same scale for every bar. Versions 1.2 and 3.1 existed only in simulation.</figcaption>
</figure>

| Version | Main change | Decode | Cycles / token | LUT |
|---|---|--:|--:|--:|
| v1.0 | single-beat 16 B bridge | 2.6 s | 261 M | 85.8% |
| v1.1 | read bursts; a read waits only for writes to the same address | 0.90 s | 90 M | 86.1% |
| v1.3 | per-stream burst gathering + reorder buffer; 128 reads in flight; batched GEMV | 0.73 s | 73 M | 87.5% |
| v1.4 | write bursts, byte-merged writes, 16 write bursts in flight | 0.60 s | 60 M | |
| v2.0 | 32 B read port; HP0 at 200 MHz; GEMV at 32 B a beat | 0.36 s | 36 M | 89.4% |
| v3.0 | 64 B read port across HP0 + HP3 at 250 MHz | 0.21 s | 21.0 M | 90.8% |
| v3.2 | no systolic array; 128 B read port across all four HP ports | 0.16 s | 15.7 M | 86.0% |
| v3.3 | attention dot products at 16 MACs a cycle | **0.13 s** | **13.2 M** | 89.6% |

Most of the twenty times came from the memory interface, not from arithmetic. A few steps deserve a closer look:

- **v1.2 was thrown away.** Longer bursts and more reads in flight, on their own, gained almost nothing in simulation. The calibrated model then showed where the time went: about a third of it was the DeltaNet state update, which read three interleaved streams at one beat per burst and was held to 0.33 beats a cycle by the HP port's limit on outstanding bursts.
- **v1.3 fixed that and exposed the next wall.** The bridge now gathers each of four interleaved streams into its own bursts (about 25 beats on average) and a reorder buffer in block RAM hands the data back in order. Decode improved by 19% against a predicted 29%, and the new performance counters said why: 16 M cycles a token spent waiting on writes.
- **v1.4 removed the write wait**, from 16 M to 0.15 M cycles, with write bursts and byte-merged 4-byte GEMV results.
- **v2.0 was slower at first.** A burst limit of 64 beats of 32 B used up all 128 read credits at once. With bursts capped at 16 beats, decode was 40% faster.
- **v3.2 deleted the systolic array.** That is the next lesson.

Every one of these versions went through the same gate before it replaced the default firmware, which is the last lesson.

## Lesson 2: a GEMV is not a GEMM with M = 1

In decode, every linear layer has M = 1: one token's activations times a weight matrix. TARS-mini's matrix unit is an R × C INT8 output-stationary systolic array. With one input row, it uses one row of the array: C multiply-accumulates a cycle, each weight byte used exactly once, so the weights stream at C bytes a cycle. On the 8 × 8 array that is 8 bytes a cycle, half of what the 16-byte read port and LPDDR4X deliver, and about 2.8 times slower than the DRAM roofline for the weights.

Making the array smarter does not help. Splitting K across its rows gains nothing in an output-stationary array, where a K step takes one cycle whichever row runs it, and a weight-stationary tile is bound by its own loading in the same way. So M = 1 GEMMs got their own path: for every 16-byte weight beat, 16 INT8 × INT8 products, two adder levels and an INT32 accumulator per output channel, with the epilogue on one lane when the channel ends.

That needed no contract change. The integer sum is exact, so any reduction order gives the same bits; the contract fixes the order only where it matters, in floating point. On the ASIC build with LPDDR4X behind the ports:

| One 0.8B decode layer, 8 × 8 array | Array | GEMV path | Speed-up |
|---|--:|--:|--:|
| DeltaNet layer | 4,613,690 cycles | 2,635,602 | 1.75× |
| Full-attention layer | 3,262,312 cycles | 1,531,270 | 2.13× |

With an ideal port, 99% of a decode step's cycles became read beats. That is the right place for decode to be: bound by the port, with the weights streaming at 75–78% of what the DRAM can deliver.

The FPGA took the conclusion further. A bigger array did not fit: even with every multiplier in a DSP block, a 16 × 8 array needed 133k LUTs (114% of the device), because the epilogue, the row-readout multiplexers and the loader tables all grow with R and C. Instead, prefill got a batched GEMV that reads each weight once and multiplies 16 weights by up to 8 tokens per beat. In an 8-token chunk that is 3.3 times faster per token than decode. Then v3.2 removed the systolic array altogether. Qwen has no convolutions, and every GEMM is a batch of GEMVs, so synthesis dropped from 101k to 89k LUTs and the space went into a wider read port.

The cost is generality. Convolutions and GEMMs with K above 4096 now return `E_OPCODE`, and the golden model has an explicit `gemv_only` configuration that says so. The rest of the contract did not change.

> For edge LLM decode, size the datapath in bytes per cycle from DRAM, not in TOPS. The unit that matters is the one that turns weight bytes into MACs at the port's rate.

On this FPGA, LUTs were the wall and DSP blocks were spare: v3.2 used 879 of 1,248. So the shapes worth building were the ones that read each weight once and put the multiplies in DSPs.

## Lesson 3: a DRAM model changes what is worth optimizing

Before any board existed, the ASIC build got a real memory behind its ports: LPDDR4X-4266 x32, simulated with DRAMsim3. Two things that had been invisible on the ideal port showed up at once.

The first was the loader's row interleave. It fetched 16 bytes of one row, then 16 bytes of the next, and so on. On an ideal port that order costs nothing. On LPDDR, each of those 16-byte reads is served by a 64-byte burst, and the measured read amplification on GEMM was **2.7×**. The fix was to take four consecutive 16-byte chunks of a row per visit, one burst, with eight chunk buffers to hold them.

The second was reads in flight. Little's law sizes them: about 100 ns of average latency times 17 GB/s is about 1.7 KB in flight, so 128 beats, not 32. With 32, the core was capped at roughly 5 GB/s.

The board then repeated the first lesson one level up. The v1.3 bottleneck, the DeltaNet state update reading three interleaved streams at one beat per burst, was the same mistake in a different place, and the fix had the same shape: gather each stream into its own bursts and reorder on chip.

A third finding looked like a memory problem and wasn't one. A 122-cycle GELU lane with only 64 output slots halved the activation's throughput. Under DRAM it showed up as a 17% regression, which the ideal-port numbers alone would have blamed on the memory.

> Interleave at burst granularity, not beat granularity, and size outstanding requests from the real memory's latency × bandwidth, measured.

## Lesson 4: the speed-up that didn't pay

Qwen3.5-0.8B ships with a multi-token prediction (MTP) head: one gated attention layer with 20 M parameters. It runs on the NPU as a draft model. Each round verifies [current token, draft] as one two-row chunk; a hit gives two tokens and a miss gives one. DeltaNet states are not snapshotted. The verify step's last token writes a second copy of the state, and a hit flips which copy is live, so a miss costs no copying. Greedy output is unchanged: the logits are bit-identical to plain decoding, checked on the board, and no RTL change was needed.

It is a correct, careful implementation. On this hardware it is also slower on average:

| Prompt type (`run.sh bench`, up to 96 tokens) | Draft hits | Plain | MTP | Speed-up |
|---|--:|--:|--:|--:|
| JSON list | 100% | 132.6 ms/token | 116.9 ms/token | 1.13× |
| Open question | 83% | 132.4 | 126.3 | 1.05× |
| Code edit | 85% | 133.1 | 128.1 | 1.04× |
| Rewrite | 75% | 133.4 | 135.7 | 0.98× |
| Advice | 68% | 132.4 | 138.5 | 0.96× |
| Translate | 66% | 133.3 | 143.9 | 0.93× |
| Summarize | 65% | 132.8 | 143.8 | 0.92× |
| Chinese chat | 58% | 132.3 | 145.4 | 0.91× |
| Story | 55% | 132.5 | 150.6 | 0.88× |
| **Mean** | | | | **0.97×** (wall clock 0.95×) |

The reason is the cost of a round, which is about 1.76 plain decoding steps. Speculative decoding pays when verifying two tokens costs about as much as decoding one, which is true for weight-bound linear layers: the weights are read once either way. It is not true for the rest of this model. Attention and the DeltaNet recurrence scale with the number of rows verified, and the draft also reads the 254 MB output head. A round yields 1 + p tokens at hit rate p, so it breaks even when 1 + p reaches 1.76: at about 77% draft hits. Only three of the nine prompt types clear that.

So MTP ships off by default, behind a flag, with the benchmark in the repository so anyone can rerun it. What would change the answer is a cheaper verify for the recurrence and attention rows, or a draft that does not read the full output head.

> Before promising a speculative-decoding speed-up, write down the cost of a round in plain steps and the hit rate that pays for it. Then measure the hit rate on real prompts.

## A hybrid model's quiet advantage: context length

The same bitstream also runs Qwen3-0.6B, 28 full-attention layers, with only the software lowering changed. It decodes faster on short contexts, at 0.07 s/token, because its image is smaller and it has no recurrent state to read and write. But watch what happens as the context grows (measured on the board, M cycles per token):

| Position | 16 | 64 | 128 | 192 | 250 |
|---|--:|--:|--:|--:|--:|
| Qwen3-0.6B (28 attention layers) | 6.71 | 7.31 | 8.12 | 8.91 | 9.51 |
| Qwen3.5-0.8B (6 attention layers) | 13.16 | 13.25 | 13.37 | 13.48 | 13.57 |

Qwen3 slows by 42% from position 16 to 250, Qwen3.5 by 3%. Only 6 of Qwen3.5's 24 layers read a growing KV cache; the other 18 carry a fixed-size state. For an edge NPU that has to plan its bandwidth, that flat line is worth more than a short-context benchmark.

## Lesson 5: bit-exact is what made the risky changes cheap

Sharing the special-function unit, rewriting the bridge, widening the read port three times and deleting the systolic array were all large, risky changes. They were cheap because the golden model contains no microarchitecture: each change could only move cycles, and a bit-for-bit comparison would catch anything else. Every version passed the same gate:

1. RTL change and lint.
2. Two RTL regressions of 416 tests each: the core testbench, and the full KV260 top with shuffled pages and random AXI latency.
3. A two-layer model at real dimensions on the board-like memory model: bit-exact, with its cycle count.
4. Vivado implementation and packaging.
5. On the board: hardware tests, a per-token self-test and a chunked self-test. Only after all of them passed did the new bitstream replace the default firmware, and the old one stayed on the board.

Passing tests prove little unless they can fail, so every new path got a planted bug. Bugs planted in the three new SFU ports broke 4, 2 and 23 tests; one inside the SFU was caught by 6,133 of 50,029 vectors. Earlier, mutation testing had found the one real RTL bug the tests missed: an output-queue credit computed by subtracting 3, which wraps for queues under four slots and had only ever been tested at 128.

To be precise about the limits: the full set of 141 RTL mutants has not been rerun since the FPGA changes; the new paths were checked with planted bugs instead. That is listed as unfinished in the project log.

## What a $250 board teaches an NPU architect

- **Measure the memory before designing the datapath.** The simulator was off by three times until it was calibrated against a bitstream that only measured bandwidth and latency.
- **Decode is a weight-streaming problem.** Count bytes per cycle from DRAM. A GEMV is not a GEMM with M = 1, and a bigger array does not fix it.
- **Interleave at burst granularity and size reads in flight with Little's law.** Both mistakes appeared twice, once on the ASIC model and once on the board.
- **Memories are most of the area.** One buffer was 125k LUTs. Write storage as single-write-port RAM from the start.
- **Speculation needs cheap verification.** Work out the break-even hit rate before building it, and publish the result when it doesn't pay.
- **Keep the contract free of microarchitecture.** That is what turned a model swap into a software change and eight bitstream versions into routine work.

## What's next

Decode is still bandwidth-bound. The next steps are INT4 weights, which need a new contract version; keeping the DeltaNet recurrence state on chip instead of sending it through DRAM every token; and wide reads for the element-wise operators, as v3.3 did for the attention dot products.

## Reproduce it

Everything is in the [openTARS repository](https://github.com/cruxopen-labs/openTARS) under Apache-2.0: the contract, golden model, RTL, Vivado build and board software. The full [project log](https://github.com/cruxopen-labs/openTARS/blob/main/docs/tars_kv260_history.html) (in Chinese) has every version and every bug.

```sh
# on a PC: build the board's model image from the Hugging Face checkpoint
python tools/export_kv260.py --ckpt <Qwen3.5-0.8B checkpoint>

# copy deploy/kv260/ to the KV260, then on the board
sudo ./setup.sh
sudo ./run.sh selftest   # every step's logits against the golden model
sudo ./run.sh chat
```

If you are working on edge inference silicon, or want to try this on your own board, I would like to hear from you at [hello@cruxopen.com](mailto:hello@cruxopen.com).
