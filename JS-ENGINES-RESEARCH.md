# JS-ENGINES-RESEARCH.md

**Which JavaScript engine is fastest? Can Rust be used in a way that is compatible with JavaScript execution?**
Date: 2026-09-27 · Scope: V8, JavaScriptCore, SpiderMonkey, Hermes/Hermes V1, QuickJS and QuickJS-NG, GraalJS; experimental engines with primary sources (Porffor, Boa, LibJS/Ladybird, Kiesel, Nova, Brimstone); runtimes (Node, Deno, Bun, workerd, React Native, LLRT, WinterJS); Rust ↔ JS integrations.
Method: primary sources only (engine blogs and documentation, browserbench.org, official repositories, crates.io API, raw data from the `test262.fyi` and `boa-dev/data` harnesses). Every URL cited was opened today. The test262 and Boa nightly benchmark numbers were downloaded as JSON and computed locally.
Out of scope: running our own benchmarks, third-party reviews or "fastest" lists, WebAssembly performance as such (only mentioned when a JS engine runs it), choosing an engine for this repo.

**Marks used**

| Mark | Meaning |
|---|---|
| ✅ VERIFIED (docs) | Official page or raw harness data opened on 2026-09-27 |
| 🟡 LIKELY | The project itself claims it, but I could not open the benchmark run (self-reported, vendor machine) |
| ⚠️ NOT COMPARABLE | Numbers from different machines, versions or suites: **they must not be ranked against each other** |

---

## Direct answer

**There is no single "fastest" engine: it depends on the regime.** In sustained hot-code throughput and browser benchmarks, **V8** (Chrome, Node, Deno, Workers) and **JavaScriptCore** (Safari, Bun) lead. The only cross-browser record published in 2026 is from Google: Chrome/V8 with **61 on Speedometer 3.1 and 469 on JetStream 3** on a MacBook Pro M5 (2026-06-04, self-reported). Apple has not published Safari 27 figures that contradict it and reports about 10% improvement in JetStream 3 between Safari 26.0 and 26.4. For startup and short scripts, the non-JIT engines designed for that win: **QuickJS/QuickJS-NG** (runtime lifecycle < 300 µs) and **Hermes V1** (precompiled bytecode, React Native's default engine since 0.84). **Porffor** (AOT compilation) matches V8 `--jitless` in Boa's nightly benchmark, but covers only about 64% of test262. At the edge or in serverless, V8 isolates (Workers) and QuickJS embedded in Rust (LLRT) attack cold start with different models, and there is no neutral measurement comparing them.

**Yes: Rust and JavaScript integrate maturely, in four ways.** (1) A Rust program **embeds an engine** and runs JS: `v8`/`deno_core` (V8), `rquickjs` (QuickJS-NG) or `mozjs` (SpiderMonkey, used by Servo). (2) **JS calls Rust** through native addons: `napi-rs` or `neon` (Node-API, also loaded by Deno and Bun), Deno and Bun FFI, or `deno_core` *ops*. (3) **Rust compiled to WebAssembly** runs the JS engine (`wasm-bindgen`/`wasm-pack`); JetStream 3 already includes Wasm loads generated with Rust. (4) **Engines written in Rust**: Boa (95.6% of test262, interpreter only), Nova and Brimstone. None has a JIT, so they remain far behind V8 in speed. In addition, several production runtimes are written in Rust around a C++ engine: Deno (V8), Bun (JSC, according to its current README) and LLRT (QuickJS).

---

## 1. Compared engines

| Engine | Project / maintainer | Current execution tiers | JIT | test262 conformance (test262.fyi, 2026-09-27) | Where it is used (according to each runtime's docs) | Source |
|---|---|---|---|---|---|---|
| **V8** 15.6 | Google | Ignition (interpreter) → Sparkplug (baseline JIT) → Maglev (fast optimizing JIT) → Turbofan (peak JIT). Turbofan's JS backend already uses **Turboshaft** (CFG-like IR). Turbofan's frontend is being replaced by Maglev. ✅ VERIFIED (docs) | Yes, 3 tiers | 97.60% (98.25% with experimental flags) | Chrome, Node.js, Deno, Cloudflare Workers/workerd | [Maglev (2023-12)](https://v8.dev/blog/maglev), [Leaving the Sea of Nodes (2025-03)](https://v8.dev/blog/leaving-the-sea-of-nodes) |
| **JavaScriptCore** | Apple / WebKit | LLInt → Baseline JIT → DFG (low-latency optimizer) → FTL (high throughput). Wasm: IPInt → BBQ → OMG. ✅ VERIFIED (docs) | Yes, 3 tiers | 98.79% (98.90% exp.) | Safari, Bun | [docs.webkit.org JSC](https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html), [JetStream 3 in WebKit (2026-03-31)](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/) |
| **SpiderMonkey** 159 | Mozilla | C++ interpreter → Baseline Interpreter (with inline caches) → Baseline Compiler → **WarpMonkey** (replaces IonMonkey and reuses the Ion MIR/LIR backend). ✅ VERIFIED (docs) | Yes, 2 tiers | 98.45% (98.84% exp.) | Firefox, Servo (via `mozjs`), WinterJS (archived) | [firefox-source-docs SpiderMonkey](https://firefox-source-docs.mozilla.org/js/index.html) |
| **Hermes / Hermes V1** | Meta | AOT compilation to compact bytecode plus an interpreter. Hermes V1 **does not yet include** the JS-to-native compilation ("Static Hermes") or the JIT presented in 2023. ✅ VERIFIED (docs) | No | 41.81% (I did not verify which branch test262.fyi compiles) | React Native: Hermes V1 by default since RN 0.84 (2026-02-11) | [Hermes README](https://github.com/facebook/hermes), [RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82), [RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84) |
| **QuickJS** (Bellard) 2026-06-04 | Fabrice Bellard | Bytecode interpreter, reference-counting GC. "Almost complete ES2025", 367 KiB of x86 for a hello world, runtime lifecycle < 300 µs. ✅ VERIFIED (docs) | No | 82.13% (the project says "almost 100%" **of ES2025 features**: a different calculation basis) | LLRT (QuickJS) | [bellard.org/quickjs](https://bellard.org/quickjs/) |
| **QuickJS-NG** | Community (QuickJS fork) | Same as QuickJS. Focused on community development, testing, cross-platform support and ES features. ✅ VERIFIED (docs) | No | 83.51% | `rquickjs` (Rust) | [quickjs-ng.github.io](https://quickjs-ng.github.io/quickjs/), [repo](https://github.com/quickjs-ng/quickjs) |
| **GraalJS** | Oracle / GraalVM | Truffle with the Graal JIT. Standalone *Native* (fast startup, lower peak) or *JVM* (slow startup, higher peak). "Compatible with ECMAScript 2026". ✅ VERIFIED (docs) | Yes (Graal) | Not listed on test262.fyi | JVM (JSR 223, polyglot), Node-on-GraalVM | [GraalJS reference manual](https://www.graalvm.org/latest/reference-manual/js/) |
| **Porffor** alpha 9 | Oliver Medhurst (CanadaHonk) | 100% AOT: JS → IR → C → native binary or Wasm; "nothing interpreted or JIT". ✅ VERIFIED (docs) | No (AOT) | 63.84% | Experimental | [porffor.dev](https://porffor.dev/), [README](https://github.com/CanadaHonk/porffor) |
| **Boa** 0.22 | boa-dev | Lexer, parser and **interpreter** in pure Rust. ✅ VERIFIED (docs) | No | 95.58% | Embedded in Rust, Wasm playground | [Boa README](https://github.com/boa-dev/boa), [crates.io boa_engine](https://crates.io/crates/boa_engine) |
| **LibJS** (Ladybird) | Ladybird | Frontend (lexer, parser, AST, bytecode generator) **rewritten in Rust** and the only path since March 2026. AsmInt interpreter in hand-written assembly. There is no JS JIT; the Cranelift JIT is only for Wasm (I did not verify this in a primary source). ✅ VERIFIED (docs) | No (JS) | 97.68% | Ladybird browser (pre-alpha) | [Feb-2026 newsletter](https://ladybird.org/newsletter/2026-02-28/), [Adopting Rust](https://ladybird.org/posts/adopting-rust/), [Mar-2026 newsletter (commit)](https://github.com/LadybirdBrowser/ladybird.org/commit/8fd7179c1a0288ccc92f087a107bc8e06e39648f) |
| **Kiesel** 0.4.0-dev | Linus Groh | Its own bytecode VM, **written in Zig** (not Rust). ✅ VERIFIED (docs) | No | 94.37% | Learning project | [Kiesel README](https://codeberg.org/kiesel-js/kiesel) |
| **Nova** 1.0.0 | trynova | Rust, data-oriented design. "Interpreter performance is also a goal, but not yet a high priority". ✅ VERIFIED (docs) | No | ~80% (self-reported; not listed on test262.fyi) 🟡 LIKELY | Embedded in Rust | [trynova.dev](https://trynova.dev/), [README](https://github.com/trynova/nova) |
| **Brimstone** | Hans Halverson | Rust, bytecode VM inspired by Ignition, compacting GC. ">97% of the language in test262", "not production ready". ✅ VERIFIED (docs) | No | Self-reported 🟡 LIKELY | Experimental | [Brimstone README](https://github.com/Hans-Halverson/brimstone) |

Table notes:
- test262.fyi percentages are calculated over the suite total as that harness counts it (53,597 tests, revision `7ab7faf`, generated on 2026-09-27 03:02 UTC on "macOS 15.3.1 with M4"). It includes proposals that are not yet standardized, so it yields lower percentages than projects publishing "over ES20xx". ✅ VERIFIED (docs) — data: [data.test262.fyi/index.json](https://data.test262.fyi/index.json), [meta.json](https://data.test262.fyi/meta.json).
- Boa's latest report (v0.21, 2025-10-22) gave 94.12%; today test262.fyi shows 95.58% for commit `39cd112`. [Boa blog](https://boajs.dev/blog) ✅ VERIFIED (docs).

---

## 2. Benchmarks with a number, date and who measured it

### 2.1 What each suite measures

| Suite | What it measures | Maintainer | Note | Source |
|---|---|---|---|---|
| **Speedometer 3.1** (2025-03-31) | Responsiveness of real web apps (TodoMVC, editors, charts, news). Measures **the whole browser** (DOM, CSS, layout, paint), not just the JS engine | Apple, Google, Microsoft, Mozilla (open governance) | 3.1 fixes measurement bugs from 3.0 | [3.1 announcement](https://browserbench.org/announcements/speedometer3.1/) ✅ |
| **JetStream 3.0** (2026-03-31) | Compute-intensive JS and Wasm; 77 loads; score = geometric mean of first iteration, worst case and average (startup, *jank* and throughput). Also runs in shells such as `d8` | Apple, Google, Mozilla and others | **Not comparable** with JetStream 2. Wasm becomes 15 to 20% of the score (previously 7%), with C++, C#, Dart, Java, Kotlin and **Rust** toolchains | [Announcement](https://browserbench.org/announcements/jetstream3/), [In-depth](https://browserbench.org/JetStream3.0/in-depth.html), [Google](https://blog.google/chromium/jetstream-3-a-modern-benchmark-for-high-performance-compute-intensive-web-applications/) ✅ |
| **V8 Benchmark Suite v7** (Boa nightly) | Throughput of classic loads (Richards, DeltaBlue, Crypto, RayTrace, etc.) **without JIT** | boa-dev, on GitHub Actions `ubuntu-24.04`, daily cron | Useful for comparing interpreters with each other; does not measure startup | [boajs.dev/benchmarks](https://boajs.dev/benchmarks), [workflow](https://github.com/boa-dev/data/blob/main/.github/workflows/benchmark.yml) ✅ |
| **AreWeFastYet** | Firefox tracking against Chrome (Mozilla) | Mozilla | The page renders with JS; **I could not extract numbers** | [arewefastyet.com](https://arewefastyet.com/) |

### 2.2 Published numbers

| Regime | Engine / browser | Result | Date | Who measured it and where | Mark |
|---|---|---|---|---|---|
| (c) Browser | Chrome (V8 + Blink) | **Speedometer 3.1 = 61** ("double record across all browsers") | 2026-06-04 | Google, MacBook Pro M5, macOS 26.0.1 | ✅ VERIFIED (docs) the claim · 🟡 LIKELY the figure (self-reported) — [blog.google](https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/) |
| (a)+(c) JS/Wasm compute | Chrome (V8) | **JetStream 3 = 469** (+10% since January 2026) | 2026-06-04 | Google, same machine | ✅ claim · 🟡 figure |
| (c) Browser | Chrome | +22% on Speedometer 3.1 since August 2024 (the absolute figure, 52.35, only appears in a chart and in the press) | 2025-06-05 | Google, MacBook Pro M4, macOS 15 | ✅ the +22% · 🟡 the 52.35 — [blog.google](https://blog.google/chromium/chrome-achieves-highest-score-ever-on/) |
| (a)+(c) JS/Wasm compute | Safari (JSC) | ~10% improvement in JetStream 3 from Safari 26.0 to 26.4 (no absolute score) | 2026-03-31 | Apple / WebKit | ✅ VERIFIED (docs) — [webkit.org](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/) |
| (c) Browser | Safari 27 | **No Speedometer or JetStream figures** in the Safari 27 notes (2026-09-17) | — | — | ✅ VERIFIED (docs) the absence — [WebKit Features for Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) |
| (c) Browser | Firefox (SpiderMonkey) | **I found no figures published by Mozilla in 2025-2026** | — | — | — |
| V8 tiers (historical) | V8 | Turbofan: 4.35× on JetStream and >1.5× on Speedometer. Sparkplug: +45% over Ignition on JetStream. Maglev compiles ~10× slower than Sparkplug and ~10× faster than Turbofan | 2023-12 | Google, Chrome 117, MacBook Air M2 | ✅ VERIFIED (docs) — **2023 data** — [v8.dev/blog/maglev](https://v8.dev/blog/maglev) |
| V8 tiers | V8 Turboshaft | Compilation time **was halved** versus Sea of Nodes | 2025-03-25 | Google | ✅ VERIFIED (docs) — [v8.dev](https://v8.dev/blog/leaving-the-sea-of-nodes) |
| (b) Web startup | V8 | *Explicit Compile Hints* (Chrome 136): 17 of 20 pages improved, with -630 ms average parse and compile time on the main thread | 2025-04-29 | Google | ✅ VERIFIED (docs) — [v8.dev](https://v8.dev/blog/explicit-compile-hints) |

### 2.3 Non-JIT interpreters (V8 Benchmark Suite v7, Boa nightly)

Last run: **2026-09-27 05:09 UTC**, GitHub Actions `ubuntu-24.04`, all engines **in the same run** (so they are comparable with each other). Higher is better. ✅ VERIFIED (docs) — raw data: [boa-dev/data `bench/results/score.json`](https://github.com/boa-dev/data/tree/main/bench/results).

| Engine (mode) | Score | Relative to V8 `--jitless` |
|---|---|---|
| Porffor (AOT) | 2595 | 1.02× |
| V8 `d8 --jitless` (canary) | 2542 | 1.00× |
| QuickJS (Bellard, latest binary) | 1200 | 0.47× |
| SpiderMonkey `--no-jit-backend` | 768 | 0.30× |
| Kiesel | 381 | 0.15× |
| Duktape | 359 | 0.14× |
| **Boa** (Rust) | 211 | 0.08× |
| LibJS | no data (`null` in recent runs) | — |

This table measures throughput **without JIT**. With JIT, Porffor itself acknowledges that "Node and Bun are 13 to 17× faster" on this suite ([porffor.dev](https://porffor.dev/), 🟡 LIKELY, machine not declared).

### 2.4 Startup and serverless claims (self-reported)

| Claim | Who | Mark |
|---|---|---|
| QuickJS: "the full lifecycle of a runtime instance takes less than 300 µs". The 2026-06-04 release is "42% faster than the previous one on bench-v8" | Bellard | 🟡 LIKELY (no published run) — [bellard.org/quickjs](https://bellard.org/quickjs/) |
| LLRT: "up to more than 10× faster startup and up to 2× lower cost than other JS runtimes on AWS Lambda". It acknowledges notable disadvantages versus JIT runtimes for large data processing or millions of iterations | AWS Labs (**experimental** package) | 🟡 LIKELY — [LLRT README](https://github.com/awslabs/llrt) |
| Workers: "an isolate can start about a hundred times faster than a Node process in a container or VM" and uses an order of magnitude less memory at startup | Cloudflare | 🟡 LIKELY — [How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/) |
| Hermes V1 in the Expensify app: bundle load -3.2% (low-end Android) / -9% (iOS); total TTI -7.6% / -2.5% | Meta / React Native | 🟡 LIKELY — [RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82) |
| Porffor: 1,144 apps/GB versus 28 with Node containers; 2.6 MB binary versus 137 MB for Node | Porffor | 🟡 LIKELY — [porffor.dev](https://porffor.dev/) |
| GraalJS: "peak performance can match V8 on many benchmarks, but it usually takes longer to get there (*warmup*)" | Oracle | 🟡 LIKELY (no numbers) — [GraalJS manual](https://www.graalvm.org/latest/reference-manual/js/) |

⚠️ NOT COMPARABLE: Chrome's numbers (M5, macOS 26), Porffor's (machine not declared), Boa's nightly (GitHub Actions x86-64) and LLRT's (Lambda ARM 128 MB) must not be ranked against each other. Neither should V8's 2023 numbers be compared with 2026 numbers.

### 2.5 Leader by regime

| Regime | Leader (with caveat) | Who is close | Basis |
|---|---|---|---|
| **(a) Peak hot-code throughput** | **V8**: the only 2026 figure published on JetStream 3 (469, self-reported) | **JavaScriptCore**, which improved ~10% on JetStream 3 but without an absolute figure; **GraalJS** (JVM mode) after warmup, according to its own docs; SpiderMonkey without published figures | §2.2 |
| **(b) Startup / short scripts** | **QuickJS / QuickJS-NG** (< 300 µs per runtime, no JIT) and **Hermes V1** on mobile (AOT bytecode) | **Porffor** (AOT binary, roughly V8 `--jitless` in throughput, but with 64% of test262); V8 with compile hints and snapshots on the web | §2.3, §2.4 |
| **(c) Browser benchmarks** | **Chrome/V8**: 61 on Speedometer 3.1 and 469 on JetStream 3 (self-reported, M5) | **Safari/JSC** (Apple published no 2026 figures); **Firefox/SpiderMonkey** with no official data found | §2.2 |
| **(d) Edge / serverless cold start** | Depends on the model: **V8 isolates** (Workers) if the platform keeps the process alive and only creates isolates; **QuickJS in Rust (LLRT)** if every invocation starts a process | Porffor (AOT binary) if the code fits its coverage | §2.4 |

---

## 3. Rust × JavaScript integration map

Versions and dates taken from the crates.io API on 2026-09-27. ✅ VERIFIED (docs) unless stated otherwise.

| Approach | Crate / project | Direction | Engine underneath | Official URL | Maturity | Main limitation |
|---|---|---|---|---|---|---|
| Rust embeds V8 (low level) | `v8` (rusty_v8) **152.2.0**, 2026-08-20; README: V8 15.2.124.1 | Rust → JS | V8 (with JIT) | [github.com/denoland/rusty_v8](https://github.com/denoland/rusty_v8) | Production (Deno's base). Versions aligned with Chrome, a new one every 4 weeks | V8 has more than 600,000 lines of C++ and compiling it "usually takes 30 minutes". The API mirrors C++ (handles, scopes) |
| Rust embeds V8 (runtime) | `deno_core` **0.412.0**, 2026-09-16. Lives in `denoland/deno/libs/core`; the old repo was archived on 2026-02-27 | Rust ↔ JS | V8 | [deno_core README](https://github.com/denoland/deno/tree/main/libs/core) | Production (Deno CLI) | "Documentation is sparse for now". No TypeScript at this layer. The embedder owns the event loop (tokio, smol) |
| Rust exposes functions to V8 | Deno *ops* (`deno_core::extension!` + `deno_ops`) | JS → Rust | V8 | same README | Production | Tied to the `deno_core` API and versioning |
| Rust embeds QuickJS | `rquickjs` **0.14.0**, 2026-09-18 | Rust ↔ JS | **QuickJS-NG** (no JIT) | [github.com/DelSkayn/rquickjs](https://github.com/DelSkayn/rquickjs) | Stable. Integrates Promises with Rust futures | Interpreter: on V8 Bench v7, QuickJS scores 0.47× of V8 **without** JIT and far less than V8 with JIT (§2.3). Part of the README is outdated (mentions ES2020) |
| Rust embeds SpiderMonkey | `mozjs` **0.26.4**, 2026-09-25; still on mozilla-esr153 | Rust ↔ JS | SpiderMonkey (with JIT) | [github.com/servo/mozjs](https://github.com/servo/mozjs) | Proven in Servo | Heavy build (offers a precompiled archive with attestation). Low-level API over C++ JSAPI |
| JS engine in pure Rust | `boa_engine` **0.22.0**, 2026-08-28 | Rust ↔ JS | Boa (interpreter) | [github.com/boa-dev/boa](https://github.com/boa-dev/boa) | "Experimental" according to its README; 95.58% of test262 | **No JIT**: 211 versus 2542 for V8 `--jitless` (~12× slower) in the same run (§2.3) |
| JS engine in pure Rust | `nova_vm` **1.0.0**, 2026-03-15 | Rust ↔ JS | Nova (interpreter) | [trynova.dev](https://trynova.dev/) | "Ready for small-scale deployment"; ~80% of test262 🟡 LIKELY | Performance is not a priority yet |
| JS engine in pure Rust | Brimstone | Rust ↔ JS | Brimstone (bytecode VM) | [github.com/Hans-Halverson/brimstone](https://github.com/Hans-Halverson/brimstone) | "Not production ready"; >97% of the language 🟡 LIKELY | No SharedArrayBuffer or Atomics; GC in "very unsafe Rust" |
| JS (Node) calls Rust | `napi` / napi-rs **3.13.0**, 2026-09-22 (v3; requires Rust ≥ 1.88) | JS → Rust | The runtime's engine, via **Node-API** | [napi.rs](https://napi.rs/docs/introduction/getting-started) | Production. Precompiled packages per platform | Native binaries per target (OS, CPU, libc). Node-API provides ABI compatibility with later Node versions. Deno loads it ([Deno docs](https://docs.deno.com/runtime/fundamentals/ffi/)); Bun announces N-API support ([bun.com](https://bun.com/)) |
| JS (Node) calls Rust | `neon` **1.1.1**, 2025-12-05 (repo active in 2026-09) | JS → Rust | Node-API | [neon-rs.dev](https://neon-rs.dev/) | Stable | Same per-platform binary problem; releases are more spaced out than napi-rs |
| JS (Deno / Bun) calls Rust through FFI | `Deno.dlopen`, `bun:ffi` | JS → Rust (`cdylib` with C ABI) | V8 / JSC | [Deno FFI](https://docs.deno.com/runtime/fundamentals/ffi/), [bun.com](https://bun.com/) | Stable | Deno requires `--allow-ffi`: native code **leaves the sandbox** with the process permissions. C types only |
| Rust → WebAssembly run by the JS engine | `wasm-bindgen` **0.2.129**, 2026-09-25, and `wasm-pack` (now in the `wasm-bindgen` org, active) | JS ↔ Rust (via Wasm) | Any engine with Wasm (V8, JSC, SpiderMonkey) | [wasm-bindgen guide](https://wasm-bindgen.github.io/wasm-bindgen/) | Production. JetStream 3 includes Wasm loads compiled from Rust ([Google](https://blog.google/chromium/jetstream-3-a-modern-benchmark-for-high-performance-compute-intensive-web-applications/)) | Cost of crossing the JS↔Wasm boundary (V8 optimized it in 2026, according to [blog.google](https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/)). No direct DOM access: everything goes through bindings |
| JS inside a Wasm sandbox | `javy` **8.1.0**, 2026-07-30 (Bytecode Alliance) | Host (e.g. Wasmtime) → JS | QuickJS via `rquickjs`, compiled to Wasm | [github.com/bytecodealliance/javy](https://github.com/bytecodealliance/javy) | Stable | Modules of at least 869 KB with static linking (1-16 KB with dynamic linking). Interpreter inside Wasm: no JIT |
| JS runtimes written in Rust | **Deno** (V8 + Rust + Tokio); **Bun** (JSC; its README says "written in Rust" and GitHub reports Rust as the main language); **LLRT** (QuickJS, *experimental*); **WinterJS** (SpiderMonkey, **archived** on 2026-03-17) | Rust hosts JS | V8 / JSC / QuickJS / SpiderMonkey | [Deno](https://github.com/denoland/deno), [Bun](https://github.com/oven-sh/bun), [LLRT](https://github.com/awslabs/llrt), [WinterJS](https://github.com/wasmerio/winterjs) | Deno and Bun in production; LLRT experimental; WinterJS abandoned | The engine is still C++ (or QuickJS in C): Rust provides the runtime, not JS execution |
| Rust inside a C++ engine | Ladybird's LibJS: 100% Rust frontend (~25,000 lines, bytecode identical to the C++ pipeline across 52,898 test262 tests) | — | LibJS | [ladybird.org/posts/adopting-rust](https://ladybird.org/posts/adopting-rust/) | Pre-alpha | Shows that Rust can serve parts of an engine; execution remains in C++ and assembly |

**Performance summary versus V8/JSC (only what a primary source states):** if you embed V8 or SpiderMonkey from Rust, you get the same engine and the same JIT, so execution performance is the engine's. With QuickJS or QuickJS-NG, performance is interpreter-level: 0.47× of V8 **without JIT** in the table in §2.3. Pure-Rust engines (Boa) are around 0.08× of V8 without JIT. I found no primary sources measuring Nova or Brimstone against V8.

---

## 4. What to choose for each goal

| Goal | Recommendation | Why | Risk |
|---|---|---|---|
| **Maximum throughput** (server, long compute) | Node or Deno (V8), or Bun (JSC) | Engines with 3-tier JIT and the only 2026 JetStream 3 figures | Test with your own load: leaders change by suite and hardware |
| **Minimum startup / CLI / short functions** | QuickJS-NG (via `rquickjs`) or LLRT on Lambda; Hermes V1 for React Native | No JIT cost; < 300 µs per runtime (QuickJS) | Degrades in long loops (LLRT documents this). LLRT is experimental |
| **Embed JS in a Rust program** | Compatibility and speed: `deno_core` or `v8`. Small binary and simple build: `rquickjs`. All Rust without C/C++: `boa_engine` | V8 gives JIT and ~98% of test262; QuickJS-NG is small; Boa avoids C++ toolchains | V8: ~30 min build and a large binary. Boa: ~12× slower than V8 without JIT |
| **Call Rust from Node** | `napi-rs` (v3) | Node-API is ABI-stable, has a per-platform publishing CLI, and is also loaded by Deno and Bun | Binary matrix per target; packaging is more complex than pure JS |
| **Call Rust from the browser** | `wasm-bindgen` + `wasm-pack` | The only portable path to all browsers; Rust→Wasm is in JetStream 3 | JS↔Wasm boundary and DOM bindings |
| **Sandboxed plugins** (third-party code) | V8 isolates (Workers model) if you already use V8; Javy (JS→Wasm with QuickJS) on Wasmtime if you want Wasm-level isolation | Per-isolate or per-Wasm-instance memory isolation | Javy has no JIT. **Do not use FFI or native addons** for untrusted code (they leave the sandbox, according to Deno's docs) |

---

## 5. Sources (opened on 2026-09-27)

**Benchmarks and harnesses**
- https://browserbench.org/announcements/speedometer3.1/
- https://browserbench.org/Speedometer3.1/ (the page renders on the client; it does not expose results)
- https://browserbench.org/JetStream/ · https://browserbench.org/JetStream3.0/in-depth.html · https://browserbench.org/announcements/jetstream3/
- https://test262.fyi/ · https://data.test262.fyi/meta.json · https://data.test262.fyi/index.json
- https://boajs.dev/benchmarks · https://github.com/boa-dev/data (workflow `benchmark.yml`, `bench/results/score.json`)
- https://arewefastyet.com/ (client-rendered; no extractable numbers)

**V8 / Chrome**
- https://v8.dev/blog · https://v8.dev/blog/maglev · https://v8.dev/blog/leaving-the-sea-of-nodes · https://v8.dev/blog/explicit-compile-hints
- https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/
- https://blog.google/chromium/chrome-achieves-highest-score-ever-on/
- https://blog.google/chromium/jetstream-3-a-modern-benchmark-for-high-performance-compute-intensive-web-applications/

**JavaScriptCore / WebKit**
- https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html
- https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/
- https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- https://webkit.org/blog/

**SpiderMonkey**
- https://firefox-source-docs.mozilla.org/js/index.html · https://spidermonkey.dev/blog/

**Hermes / React Native**
- https://github.com/facebook/hermes (README)
- https://reactnative.dev/blog/2025/10/08/react-native-0.82 · https://reactnative.dev/blog/2026/02/11/react-native-0.84

**QuickJS, GraalJS and experimental engines**
- https://bellard.org/quickjs/ · https://github.com/quickjs-ng/quickjs · https://quickjs-ng.github.io/quickjs/
- https://www.graalvm.org/latest/reference-manual/js/
- https://porffor.dev/ · https://github.com/CanadaHonk/porffor
- https://github.com/boa-dev/boa · https://boajs.dev/blog
- https://ladybird.org/newsletter/2026-02-28/ · https://ladybird.org/posts/adopting-rust/ · https://github.com/LadybirdBrowser/ladybird.org/commit/8fd7179c1a0288ccc92f087a107bc8e06e39648f
- https://codeberg.org/kiesel-js/kiesel · https://trynova.dev/ · https://github.com/trynova/nova · https://github.com/Hans-Halverson/brimstone

**Runtimes**
- https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
- https://github.com/denoland/deno · https://docs.deno.com/runtime/fundamentals/ffi/
- https://github.com/oven-sh/bun · https://bun.com/
- https://github.com/cloudflare/workerd · https://developers.cloudflare.com/workers/reference/how-workers-works/
- https://github.com/awslabs/llrt · https://github.com/wasmerio/winterjs

**Rust × JS**
- https://github.com/denoland/rusty_v8 · https://github.com/denoland/deno/tree/main/libs/core · https://github.com/denoland/deno_core (archived)
- https://github.com/DelSkayn/rquickjs · https://github.com/servo/mozjs
- https://napi.rs/docs/introduction/getting-started · https://neon-rs.dev/
- https://wasm-bindgen.github.io/wasm-bindgen/ · https://github.com/wasm-bindgen/wasm-pack
- https://github.com/bytecodealliance/javy
- crates.io API (`https://crates.io/api/v1/crates/<name>`) for `boa_engine`, `v8`, `deno_core`, `rquickjs`, `mozjs`, `napi`, `neon`, `wasm-bindgen`, `javy`, `nova_vm`

---

## 6. What I could not verify

- **Safari/JSC 2026 figures** on Speedometer 3.1 or JetStream 3: Apple did not publish them in the Safari 27 notes or in the JetStream 3 post (only "~10% improvement").
- **Official Firefox/SpiderMonkey figures** on Speedometer 3.1 or JetStream 3, and AreWeFastYet data (the page requires JS).
- **The run behind Chrome's record** (61 / 469): it is self-reported and the machine belongs to Google.
- **The absolute figure 52.35 (Speedometer 3.1, 2025)**: Google's text only says +22%; the number appears in the chart and in secondary press.
- **"Static Hermes" performance numbers** in an official Meta source. RN 0.82 confirms it is not in Hermes V1.
- **Which Hermes branch** test262.fyi uses (41.81% may not reflect Hermes V1).
- **Porffor's benchmark machine**, the raw runs behind LLRT's "10× faster" and Workers' "100× faster".
- **Nova and Brimstone conformance** in an independent harness: neither appears on test262.fyi.
- **Ladybird's Wasm Cranelift JIT**: I only saw it in a search summary, not in the primary source.
- **The exact V8 version bundled with Node.js** at this date (I did not check it).
