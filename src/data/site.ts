// Single source for links and measured numbers.
// Every figure below is copied from a repository README; the `src` field says
// where, so it can be re-checked whenever a README changes. Do not add a number
// here that is not in the repo.

export const ORG = "https://github.com/cruxopen-labs";
export const EMAIL = "hello@cruxopen.com";

export const repos = {
  openTARS: `${ORG}/openTARS`,
  openISP: `${ORG}/openISP`,
} as const;

export const blob = (repo: keyof typeof repos, path: string, branch = repo === "openISP" ? "master" : "main") =>
  `${repos[repo]}/blob/${branch}/${path}`;

export type Fact = { value: string; unit?: string; src: string };

/** Hero strip: four measured results. */
export const heroFacts: Record<"tarsDecode" | "tarsExact" | "ispVideo" | "tarsMutants", Fact> = {
  tarsDecode: { value: "0.07", unit: "s/token", src: "openTARS README · Tested models (Qwen3-0.6B, KV260, 100 MHz)" },
  tarsExact: { value: "Bit-exact", unit: "every logit, on board", src: "openTARS README · run.sh selftest on the board" },
  ispVideo: { value: "4K30", unit: "on board", src: "openISP README · Hardware ISP on AMD Kria KV260" },
  tarsMutants: { value: "748", unit: "tests", src: "openTARS README · Run (pytest) + 141-mutant RTL mutation check" },
};

export const tars = {
  repo: repos.openTARS,
  demoVideo: blob("openTARS", "demo/Qwen3.5-0.8B-Demo.mp4"),
  history: blob("openTARS", "docs/tars_kv260_history.html"),
  board: "AMD Kria KV260 (XCK26)",
  clock: "100 MHz",
  lut: "90%",
  quant: "INT8 W8A8",
  models: [
    { name: "Qwen3.5-0.8B", arch: "18 Gated DeltaNet + 6 gated attention", decode: "0.13", image: "887 MiB" },
    { name: "Qwen3-0.6B", arch: "28 full attention (GQA 16/8)", decode: "0.07", image: "662 MiB" },
  ],
  speedupFromV1: { from: "2.6", to: "0.13" }, // s/token, Qwen3.5-0.8B, bitstream v1.0 -> v3.3
  tests: "748",
  mutants: "141",
  asic: "1 GHz pre-layout (ASAP7), every core path ≤ 650 ps",
  mtpMean: "0.97×",
  mtpBreakEven: "77%",
  stack: ["SystemVerilog", "Verilator", "DRAMsim3", "Vivado", "Yosys + ASAP7", "Python golden model"],
};

export const isp = {
  repo: repos.openISP,
  boardNotes: blob("openISP", "hw/kv260/README.md"),
  rtlDoc: blob("openISP", "docs/hw/rtl.md"),
  sensor: "onsemi AR1335",
  video: "1080p30 · 4K30",
  fps: "30.04 fps",
  clock: "200 MHz",
  ppc: "2 pixels/clock",
  lutOoc: "35% LUT (250 MHz OOC)",
  tests: "127",
  // RTL blocks in the order the README lists them, grouped by the domain they work in
  domains: [
    { name: "Bayer", blocks: ["DPC", "BLC", "AAF", "AWB", "CNF", "CFA"] },
    { name: "RGB", blocks: ["CCM", "Gamma", "CSC"] },
    { name: "YUV", blocks: ["NLM", "BNF", "EE", "FCS", "HSC", "BCC"] },
  ],
  stack: ["SystemVerilog (no HLS)", "Verilator / xsim", "V4L2 driver", "AE/AWB/AF firmware", "PC tuning tool"],
};

/** Engineering notes: each links to the real document in a repo. */
export const notes = [
  { id: "gemv", href: blob("openTARS", "docs/v04_contract.md"), repo: "openTARS" },
  { id: "dram", href: blob("openTARS", "docs/p8_dram_1ghz.md"), repo: "openTARS" },
  { id: "tie", href: `${repos.openTARS}#lessons-from-p2`, repo: "openTARS" },
  { id: "mtp", href: `${repos.openTARS}#speculative-decoding-mtp`, repo: "openTARS" },
] as const;
