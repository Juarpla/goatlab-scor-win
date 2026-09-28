# JS-ENGINES-RESEARCH.md

**¿Cuál es el motor JavaScript más rápido? ¿Se puede usar Rust de forma compatible con la ejecución de JavaScript?**
Fecha: 2026-09-27 · Alcance: V8, JavaScriptCore, SpiderMonkey, Hermes/Hermes V1, QuickJS y QuickJS-NG, GraalJS; experimentales con fuente primaria (Porffor, Boa, LibJS/Ladybird, Kiesel, Nova, Brimstone); runtimes (Node, Deno, Bun, workerd, React Native, LLRT, WinterJS); integraciones Rust ↔ JS.
Método: solo fuentes primarias (blogs y documentación de los motores, browserbench.org, repositorios oficiales, API de crates.io, datos crudos de los harnesses `test262.fyi` y `boa-dev/data`). Cada URL citada se abrió hoy. Los números de test262 y del benchmark nocturno de Boa se descargaron en JSON y se calcularon localmente.
Fuera del alcance: correr benchmarks propios, reseñas de terceros o listas de "el más rápido", rendimiento de WebAssembly como tal (solo se menciona cuando lo ejecuta un motor JS), elegir un motor para este repo.

**Marcas usadas**

| Marca | Significado |
|---|---|
| ✅ VERIFICADO (docs) | Página oficial o dato crudo del harness abierto el 2026-09-27 |
| 🟡 PROBABLE | Lo afirma el propio proyecto, pero no pude abrir la corrida del benchmark (autorreportado, máquina del proveedor) |
| ⚠️ NO COMPARABLE | Números de máquinas, versiones o suites distintas: **no se deben ordenar entre sí** |

---

## Respuesta directa

**No hay un único motor "más rápido": depende del régimen.** En throughput sostenido de código caliente y en benchmarks de navegador, lideran **V8** (Chrome, Node, Deno, Workers) y **JavaScriptCore** (Safari, Bun). El único récord entre navegadores publicado en 2026 lo firma Google: Chrome/V8 con **61 en Speedometer 3.1 y 469 en JetStream 3** en un MacBook Pro M5 (2026-06-04, autorreportado). Apple no publicó cifras de Safari 27 que lo contradigan y reporta un ~10 % de mejora en JetStream 3 entre Safari 26.0 y 26.4. En arranque y scripts cortos ganan los motores sin JIT diseñados para eso: **QuickJS/QuickJS-NG** (ciclo de vida de un runtime < 300 µs) y **Hermes V1** (bytecode precompilado, motor por defecto de React Native desde la 0.84). **Porffor** (compilación AOT) empata con V8 `--jitless` en el benchmark nocturno de Boa, pero cubre solo ~64 % de test262. En edge o serverless, los *isolates* de V8 (Workers) y QuickJS embebido en Rust (LLRT) atacan el arranque en frío con modelos distintos, y no hay una medición neutral que los compare.

**Sí: Rust y JavaScript se integran de forma madura, de cuatro maneras.** (1) Un programa Rust **embebe un motor** y ejecuta JS: `v8`/`deno_core` (V8), `rquickjs` (QuickJS-NG) o `mozjs` (SpiderMonkey, el que usa Servo). (2) **JS llama a Rust** mediante addons nativos: `napi-rs` o `neon` (Node-API, que también cargan Deno y Bun), FFI de Deno y Bun, u *ops* de `deno_core`. (3) **Rust compilado a WebAssembly** que ejecuta el motor JS (`wasm-bindgen`/`wasm-pack`); JetStream 3 ya incluye cargas Wasm generadas con Rust. (4) **Motores escritos en Rust**: Boa (95,6 % de test262, solo intérprete), Nova y Brimstone. Ninguno tiene JIT, así que quedan muy por detrás de V8 en velocidad. Además, varios runtimes de producción están escritos en Rust alrededor de un motor en C++: Deno (V8), Bun (JSC, según su README actual) y LLRT (QuickJS).

---

## 1. Motores comparados

| Motor | Proyecto / quién lo mantiene | Tiers de ejecución vigentes | JIT | Conformidad test262 (test262.fyi, 2026-09-27) | Dónde se usa (según la doc de cada runtime) | Fuente |
|---|---|---|---|---|---|---|
| **V8** 15.6 | Google | Ignition (intérprete) → Sparkplug (JIT base) → Maglev (JIT optimizador rápido) → Turbofan (JIT pico). El backend JS de Turbofan ya usa **Turboshaft** (IR tipo CFG). El frontend de Turbofan se está reemplazando por Maglev. ✅ VERIFICADO (docs) | Sí, 3 niveles | 97,60 % (98,25 % con flags experimentales) | Chrome, Node.js, Deno, Cloudflare Workers/workerd | [Maglev (2023-12)](https://v8.dev/blog/maglev), [Leaving the Sea of Nodes (2025-03)](https://v8.dev/blog/leaving-the-sea-of-nodes) |
| **JavaScriptCore** | Apple / WebKit | LLInt → Baseline JIT → DFG (optimizador de baja latencia) → FTL (alto throughput). Wasm: IPInt → BBQ → OMG. ✅ VERIFICADO (docs) | Sí, 3 niveles | 98,79 % (98,90 % exp.) | Safari, Bun | [docs.webkit.org JSC](https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html), [JetStream 3 en WebKit (2026-03-31)](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/) |
| **SpiderMonkey** 159 | Mozilla | Intérprete C++ → Baseline Interpreter (con inline caches) → Baseline Compiler → **WarpMonkey** (reemplaza a IonMonkey y reutiliza el backend Ion MIR/LIR). ✅ VERIFICADO (docs) | Sí, 2 niveles | 98,45 % (98,84 % exp.) | Firefox, Servo (vía `mozjs`), WinterJS (archivado) | [firefox-source-docs SpiderMonkey](https://firefox-source-docs.mozilla.org/js/index.html) |
| **Hermes / Hermes V1** | Meta | Compilación AOT a bytecode compacto e intérprete. Hermes V1 **no incluye** todavía la compilación JS→nativo ("Static Hermes") ni el JIT presentados en 2023. ✅ VERIFICADO (docs) | No | 41,81 % (no verifiqué qué rama compila test262.fyi) | React Native: Hermes V1 por defecto desde RN 0.84 (2026-02-11) | [README Hermes](https://github.com/facebook/hermes), [RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82), [RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84) |
| **QuickJS** (Bellard) 2026-06-04 | Fabrice Bellard | Intérprete de bytecode, GC por conteo de referencias. "Casi completo ES2025", 367 KiB de x86 para un hello world, ciclo de vida del runtime < 300 µs. ✅ VERIFICADO (docs) | No | 82,13 % (el proyecto dice "casi 100 %" **de las features ES2025**: otra base de cálculo) | LLRT (QuickJS) | [bellard.org/quickjs](https://bellard.org/quickjs/) |
| **QuickJS-NG** | Comunidad (fork de QuickJS) | Igual que QuickJS. Enfocado en desarrollo comunitario, testing, multiplataforma y features ES. ✅ VERIFICADO (docs) | No | 83,51 % | `rquickjs` (Rust) | [quickjs-ng.github.io](https://quickjs-ng.github.io/quickjs/), [repo](https://github.com/quickjs-ng/quickjs) |
| **GraalJS** | Oracle / GraalVM | Truffle con el JIT Graal. Standalone *Native* (arranque rápido, pico menor) o *JVM* (arranque lento, pico mayor). "Compatible con ECMAScript 2026". ✅ VERIFICADO (docs) | Sí (Graal) | No figura en test262.fyi | JVM (JSR 223, polyglot), Node-on-GraalVM | [GraalJS reference manual](https://www.graalvm.org/latest/reference-manual/js/) |
| **Porffor** alpha 9 | Oliver Medhurst (CanadaHonk) | 100 % AOT: JS → IR → C → binario nativo o Wasm; "nada interpretado ni JIT". ✅ VERIFICADO (docs) | No (AOT) | 63,84 % | Experimental | [porffor.dev](https://porffor.dev/), [README](https://github.com/CanadaHonk/porffor) |
| **Boa** 0.22 | boa-dev | Lexer, parser e **intérprete** en Rust puro. ✅ VERIFICADO (docs) | No | 95,58 % | Embebido en Rust, playground Wasm | [README Boa](https://github.com/boa-dev/boa), [crates.io boa_engine](https://crates.io/crates/boa_engine) |
| **LibJS** (Ladybird) | Ladybird | Frontend (lexer, parser, AST, generador de bytecode) **reescrito en Rust** y único camino desde marzo de 2026. Intérprete AsmInt en ensamblador escrito a mano. No hay JIT de JS; el JIT Cranelift es solo para Wasm (no lo verifiqué en fuente primaria). ✅ VERIFICADO (docs) | No (JS) | 97,68 % | Navegador Ladybird (pre-alfa) | [Newsletter feb-2026](https://ladybird.org/newsletter/2026-02-28/), [Adopting Rust](https://ladybird.org/posts/adopting-rust/), [newsletter mar-2026 (commit)](https://github.com/LadybirdBrowser/ladybird.org/commit/8fd7179c1a0288ccc92f087a107bc8e06e39648f) |
| **Kiesel** 0.4.0-dev | Linus Groh | VM de bytecode propia, **escrito en Zig** (no en Rust). ✅ VERIFICADO (docs) | No | 94,37 % | Proyecto de aprendizaje | [README Kiesel](https://codeberg.org/kiesel-js/kiesel) |
| **Nova** 1.0.0 | trynova | Rust, diseño orientado a datos. "El rendimiento del intérprete también es un objetivo, pero aún no es alta prioridad". ✅ VERIFICADO (docs) | No | ~80 % (autorreportado; no figura en test262.fyi) 🟡 PROBABLE | Embebido en Rust | [trynova.dev](https://trynova.dev/), [README](https://github.com/trynova/nova) |
| **Brimstone** | Hans Halverson | Rust, VM de bytecode inspirada en Ignition, GC compactante. ">97 % del lenguaje en test262", "no listo para producción". ✅ VERIFICADO (docs) | No | Autorreportado 🟡 PROBABLE | Experimental | [README Brimstone](https://github.com/Hans-Halverson/brimstone) |

Notas de la tabla:
- Los porcentajes de test262.fyi están calculados sobre el total del suite tal como lo cuenta ese harness (53.597 tests, revisión `7ab7faf`, generado el 2026-09-27 03:02 UTC en "macOS 15.3.1 with M4"). Incluye propuestas todavía no estandarizadas, así que da porcentajes menores que los que publican los proyectos "sobre ES20xx". ✅ VERIFICADO (docs) — datos: [data.test262.fyi/index.json](https://data.test262.fyi/index.json), [meta.json](https://data.test262.fyi/meta.json).
- El último informe de Boa (v0.21, 2025-10-22) daba 94,12 %; hoy test262.fyi marca 95,58 % para el commit `39cd112`. [Blog Boa](https://boajs.dev/blog) ✅ VERIFICADO (docs).

---

## 2. Benchmarks con número, fecha y quién midió

### 2.1 Qué mide cada suite

| Suite | Qué mide | Quién la mantiene | Nota | Fuente |
|---|---|---|---|---|
| **Speedometer 3.1** (2025-03-31) | Responsividad de apps web reales (TodoMVC, editores, gráficos, noticias). Mide **el navegador entero** (DOM, CSS, layout, pintado), no solo el motor JS | Apple, Google, Microsoft, Mozilla (gobernanza abierta) | La 3.1 corrige errores de medición de la 3.0 | [Anuncio 3.1](https://browserbench.org/announcements/speedometer3.1/) ✅ |
| **JetStream 3.0** (2026-03-31) | JS y Wasm de cómputo intensivo; 77 cargas; puntaje = media geométrica de primera iteración, peor caso y promedio (arranque, *jank* y throughput). Corre también en shells como `d8` | Apple, Google, Mozilla y otros | **No comparable** con JetStream 2. Wasm pasa a ser el 15–20 % del puntaje (antes 7 %), con toolchains C++, C#, Dart, Java, Kotlin y **Rust** | [Anuncio](https://browserbench.org/announcements/jetstream3/), [In-depth](https://browserbench.org/JetStream3.0/in-depth.html), [Google](https://blog.google/chromium/jetstream-3-a-modern-benchmark-for-high-performance-compute-intensive-web-applications/) ✅ |
| **V8 Benchmark Suite v7** (nocturno de Boa) | Throughput de cargas clásicas (Richards, DeltaBlue, Crypto, RayTrace, etc.) **sin JIT** | boa-dev, en GitHub Actions `ubuntu-24.04`, cron diario | Útil para comparar intérpretes entre sí; no mide arranque | [boajs.dev/benchmarks](https://boajs.dev/benchmarks), [workflow](https://github.com/boa-dev/data/blob/main/.github/workflows/benchmark.yml) ✅ |
| **AreWeFastYet** | Seguimiento de Firefox frente a Chrome (Mozilla) | Mozilla | La página se renderiza con JS; **no pude extraer números** | [arewefastyet.com](https://arewefastyet.com/) |

### 2.2 Números publicados

| Régimen | Motor / navegador | Resultado | Fecha | Quién midió y dónde | Marca |
|---|---|---|---|---|---|
| (c) Navegador | Chrome (V8 + Blink) | **Speedometer 3.1 = 61** ("récord doble entre todos los navegadores") | 2026-06-04 | Google, MacBook Pro M5, macOS 26.0.1 | ✅ VERIFICADO (docs) la afirmación · 🟡 PROBABLE la cifra (autorreportada) — [blog.google](https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/) |
| (a)+(c) Cómputo JS/Wasm | Chrome (V8) | **JetStream 3 = 469** (+10 % desde enero de 2026) | 2026-06-04 | Google, misma máquina | ✅ afirmación · 🟡 cifra |
| (c) Navegador | Chrome | +22 % en Speedometer 3.1 desde agosto de 2024 (la cifra absoluta, 52,35, solo aparece en un gráfico y en prensa) | 2025-06-05 | Google, MacBook Pro M4, macOS 15 | ✅ el +22 % · 🟡 el 52,35 — [blog.google](https://blog.google/chromium/chrome-achieves-highest-score-ever-on/) |
| (a)+(c) Cómputo JS/Wasm | Safari (JSC) | ~10 % de mejora en JetStream 3 de Safari 26.0 a 26.4 (sin puntaje absoluto) | 2026-03-31 | Apple / WebKit | ✅ VERIFICADO (docs) — [webkit.org](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/) |
| (c) Navegador | Safari 27 | **Sin cifras de Speedometer ni JetStream** en las notas de Safari 27 (2026-09-17) | — | — | ✅ VERIFICADO (docs) la ausencia — [WebKit Features for Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) |
| (c) Navegador | Firefox (SpiderMonkey) | **No encontré cifras publicadas por Mozilla en 2025–2026** | — | — | — |
| Tiers V8 (histórico) | V8 | Turbofan: 4,35× en JetStream y >1,5× en Speedometer. Sparkplug: +45 % sobre Ignition en JetStream. Maglev compila ~10× más lento que Sparkplug y ~10× más rápido que Turbofan | 2023-12 | Google, Chrome 117, MacBook Air M2 | ✅ VERIFICADO (docs) — **dato de 2023** — [v8.dev/blog/maglev](https://v8.dev/blog/maglev) |
| Tiers V8 | V8 Turboshaft | El tiempo de compilación **se redujo a la mitad** frente a Sea of Nodes | 2025-03-25 | Google | ✅ VERIFICADO (docs) — [v8.dev](https://v8.dev/blog/leaving-the-sea-of-nodes) |
| (b) Arranque web | V8 | *Explicit Compile Hints* (Chrome 136): 17 de 20 páginas mejoraron, con −630 ms promedio de parseo y compilación en primer plano | 2025-04-29 | Google | ✅ VERIFICADO (docs) — [v8.dev](https://v8.dev/blog/explicit-compile-hints) |

### 2.3 Intérpretes sin JIT (V8 Benchmark Suite v7, nocturno de Boa)

Última corrida: **2026-09-27 05:09 UTC**, GitHub Actions `ubuntu-24.04`, todos los motores **en la misma corrida** (entre ellos sí son comparables). Mayor es mejor. ✅ VERIFICADO (docs) — datos crudos: [boa-dev/data `bench/results/score.json`](https://github.com/boa-dev/data/tree/main/bench/results).

| Motor (modo) | Puntaje | Relativo a V8 `--jitless` |
|---|---|---|
| Porffor (AOT) | 2595 | 1,02× |
| V8 `d8 --jitless` (canary) | 2542 | 1,00× |
| QuickJS (Bellard, último binario) | 1200 | 0,47× |
| SpiderMonkey `--no-jit-backend` | 768 | 0,30× |
| Kiesel | 381 | 0,15× |
| Duktape | 359 | 0,14× |
| **Boa** (Rust) | 211 | 0,08× |
| LibJS | sin dato (`null` en las últimas corridas) | — |

Esta tabla mide throughput **sin JIT**. Con JIT, el propio Porffor reconoce que "Node y Bun sacan de 13 a 17× más" en esta suite ([porffor.dev](https://porffor.dev/), 🟡 PROBABLE, máquina no declarada).

### 2.4 Afirmaciones de arranque y serverless (autorreportadas)

| Afirmación | Quién | Marca |
|---|---|---|
| QuickJS: "el ciclo de vida completo de una instancia de runtime tarda menos de 300 µs". La release 2026-06-04 es "42 % más rápida que la anterior en bench-v8" | Bellard | 🟡 PROBABLE (sin corrida publicada) — [bellard.org/quickjs](https://bellard.org/quickjs/) |
| LLRT: "hasta más de 10× de arranque más rápido y hasta 2× menos costo que otros runtimes JS en AWS Lambda". Admite desventajas notables frente a runtimes con JIT en procesamiento de datos grande o millones de iteraciones | AWS Labs (paquete **experimental**) | 🟡 PROBABLE — [README LLRT](https://github.com/awslabs/llrt) |
| Workers: "un isolate puede arrancar unas cien veces más rápido que un proceso Node en un contenedor o VM" y usa un orden de magnitud menos memoria al inicio | Cloudflare | 🟡 PROBABLE — [How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/) |
| Hermes V1 en la app de Expensify: carga de bundle −3,2 % (Android gama baja) / −9 % (iOS); TTI total −7,6 % / −2,5 % | Meta / React Native | 🟡 PROBABLE — [RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82) |
| Porffor: 1.144 apps/GB frente a 28 con contenedores Node; binario de 2,6 MB frente a 137 MB de Node | Porffor | 🟡 PROBABLE — [porffor.dev](https://porffor.dev/) |
| GraalJS: "el pico puede igualar a V8 en muchos benchmarks, pero suele tardar más en alcanzarlo (*warmup*)" | Oracle | 🟡 PROBABLE (sin números) — [GraalJS manual](https://www.graalvm.org/latest/reference-manual/js/) |

⚠️ NO COMPARABLE: las cifras de Chrome (M5, macOS 26), las de Porffor (máquina no declarada), las del nocturno de Boa (GitHub Actions x86-64) y las de LLRT (Lambda ARM 128 MB) no se deben ordenar entre sí. Tampoco se comparan las cifras de 2023 de V8 con las de 2026.

### 2.5 Líder por régimen

| Régimen | Líder (con matiz) | Quién está cerca | Base |
|---|---|---|---|
| **(a) Throughput pico en código caliente** | **V8**: única cifra 2026 publicada en JetStream 3 (469, autorreportada) | **JavaScriptCore**, que mejoró un ~10 % en JetStream 3 pero sin cifra absoluta; **GraalJS** (modo JVM) tras el warmup, según su propia doc; SpiderMonkey sin cifras publicadas | §2.2 |
| **(b) Arranque / scripts cortos** | **QuickJS / QuickJS-NG** (< 300 µs por runtime, sin JIT) y **Hermes V1** en móvil (bytecode AOT) | **Porffor** (binario AOT, ≈ V8 `--jitless` en throughput, pero con 64 % de test262); V8 con compile hints y snapshots en la web | §2.3, §2.4 |
| **(c) Benchmarks de navegador** | **Chrome/V8**: 61 en Speedometer 3.1 y 469 en JetStream 3 (autorreportados, M5) | **Safari/JSC** (Apple no publicó cifras 2026); **Firefox/SpiderMonkey** sin datos oficiales encontrados | §2.2 |
| **(d) Edge / serverless en frío** | Depende del modelo: **V8 isolates** (Workers) si la plataforma mantiene el proceso vivo y solo crea isolates; **QuickJS en Rust (LLRT)** si cada invocación arranca un proceso | Porffor (binario AOT) si el código cabe en su cobertura | §2.4 |

---

## 3. Mapa de integración Rust × JavaScript

Versiones y fechas tomadas de la API de crates.io el 2026-09-27. ✅ VERIFICADO (docs) salvo que se indique otra cosa.

| Enfoque | Crate / proyecto | Dirección | Motor debajo | URL oficial | Madurez | Limitación principal |
|---|---|---|---|---|---|---|
| Rust embebe V8 (bajo nivel) | `v8` (rusty_v8) **152.2.0**, 2026-08-20; README: V8 15.2.124.1 | Rust → JS | V8 (con JIT) | [github.com/denoland/rusty_v8](https://github.com/denoland/rusty_v8) | Producción (base de Deno). Versiones alineadas con Chrome, una nueva cada 4 semanas | V8 tiene más de 600.000 líneas de C++ y compilarlo "suele tardar 30 minutos". La API calca la de C++ (handles, scopes) |
| Rust embebe V8 (runtime) | `deno_core` **0.412.0**, 2026-09-16. Vive en `denoland/deno/libs/core`; el repo viejo se archivó el 2026-02-27 | Rust ↔ JS | V8 | [README deno_core](https://github.com/denoland/deno/tree/main/libs/core) | Producción (Deno CLI) | "La documentación es escasa por ahora". Sin TypeScript en esta capa. El bucle de eventos lo maneja quien embebe (tokio, smol) |
| Rust expone funciones a V8 | *Ops* de Deno (`deno_core::extension!` + `deno_ops`) | JS → Rust | V8 | mismo README | Producción | Atado a la API y al versionado de `deno_core` |
| Rust embebe QuickJS | `rquickjs` **0.14.0**, 2026-09-18 | Rust ↔ JS | **QuickJS-NG** (sin JIT) | [github.com/DelSkayn/rquickjs](https://github.com/DelSkayn/rquickjs) | Estable. Integra Promises con futures de Rust | Intérprete: en V8 Bench v7, QuickJS rinde 0,47× de V8 **sin** JIT y mucho menos que V8 con JIT (§2.3). Parte del README está desactualizada (menciona ES2020) |
| Rust embebe SpiderMonkey | `mozjs` **0.26.4**, 2026-09-25; sigue mozilla-esr153 | Rust ↔ JS | SpiderMonkey (con JIT) | [github.com/servo/mozjs](https://github.com/servo/mozjs) | Probado en Servo | Build pesado (ofrece archivo precompilado con atestación). API de bajo nivel sobre JSAPI de C++ |
| Motor JS en Rust puro | `boa_engine` **0.22.0**, 2026-08-28 | Rust ↔ JS | Boa (intérprete) | [github.com/boa-dev/boa](https://github.com/boa-dev/boa) | "Experimental" según su README; 95,58 % de test262 | **Sin JIT**: 211 frente a 2542 de V8 `--jitless` (≈ 12× más lento) en la misma corrida (§2.3) |
| Motor JS en Rust puro | `nova_vm` **1.0.0**, 2026-03-15 | Rust ↔ JS | Nova (intérprete) | [trynova.dev](https://trynova.dev/) | "Listo para despliegue a pequeña escala"; ~80 % de test262 🟡 PROBABLE | El rendimiento no es prioridad todavía |
| Motor JS en Rust puro | Brimstone | Rust ↔ JS | Brimstone (VM de bytecode) | [github.com/Hans-Halverson/brimstone](https://github.com/Hans-Halverson/brimstone) | "No listo para producción"; >97 % del lenguaje 🟡 PROBABLE | Sin SharedArrayBuffer ni Atomics; GC en "Rust muy unsafe" |
| JS (Node) llama a Rust | `napi` / napi-rs **3.13.0**, 2026-09-22 (v3; requiere Rust ≥ 1.88) | JS → Rust | El del runtime, vía **Node-API** | [napi.rs](https://napi.rs/docs/introduction/getting-started) | Producción. Paquetes precompilados por plataforma | Binarios nativos por target (OS, CPU, libc). Node-API da compatibilidad ABI hacia versiones posteriores de Node. Deno lo carga ([docs Deno](https://docs.deno.com/runtime/fundamentals/ffi/)); Bun anuncia soporte de N-API ([bun.com](https://bun.com/)) |
| JS (Node) llama a Rust | `neon` **1.1.1**, 2025-12-05 (repo activo en 2026-09) | JS → Rust | Node-API | [neon-rs.dev](https://neon-rs.dev/) | Estable | Mismo problema de binarios por plataforma; release más espaciadas que napi-rs |
| JS (Deno / Bun) llama a Rust por FFI | `Deno.dlopen`, `bun:ffi` | JS → Rust (`cdylib` con ABI C) | V8 / JSC | [Deno FFI](https://docs.deno.com/runtime/fundamentals/ffi/), [bun.com](https://bun.com/) | Estable | Deno exige `--allow-ffi`: el código nativo **sale del sandbox** con los permisos del proceso. Solo tipos C |
| Rust → WebAssembly ejecutado por el motor JS | `wasm-bindgen` **0.2.129**, 2026-09-25, y `wasm-pack` (ahora en la org `wasm-bindgen`, activo) | JS ↔ Rust (vía Wasm) | Cualquier motor con Wasm (V8, JSC, SpiderMonkey) | [Guía wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/) | Producción. JetStream 3 incluye cargas Wasm compiladas desde Rust ([Google](https://blog.google/chromium/jetstream-3-a-modern-benchmark-for-high-performance-compute-intensive-web-applications/)) | Costo de cruzar la frontera JS↔Wasm (V8 lo optimizó en 2026, según [blog.google](https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/)). Sin acceso directo al DOM: todo pasa por bindings |
| JS dentro de un sandbox Wasm | `javy` **8.1.0**, 2026-07-30 (Bytecode Alliance) | Host (p. ej. Wasmtime) → JS | QuickJS vía `rquickjs`, compilado a Wasm | [github.com/bytecodealliance/javy](https://github.com/bytecodealliance/javy) | Estable | Módulos de al menos 869 KB con enlace estático (1–16 KB con enlace dinámico). Intérprete dentro de Wasm: sin JIT |
| Runtimes JS escritos en Rust | **Deno** (V8 + Rust + Tokio); **Bun** (JSC; su README dice "written in Rust" y GitHub reporta Rust como lenguaje principal); **LLRT** (QuickJS, *experimental*); **WinterJS** (SpiderMonkey, **archivado** el 2026-03-17) | Rust hospeda JS | V8 / JSC / QuickJS / SpiderMonkey | [Deno](https://github.com/denoland/deno), [Bun](https://github.com/oven-sh/bun), [LLRT](https://github.com/awslabs/llrt), [WinterJS](https://github.com/wasmerio/winterjs) | Deno y Bun en producción; LLRT experimental; WinterJS abandonado | El motor sigue siendo C++ (o QuickJS en C): Rust aporta el runtime, no la ejecución JS |
| Rust dentro de un motor en C++ | LibJS de Ladybird: frontend 100 % Rust (~25.000 líneas, bytecode idéntico al pipeline C++ en 52.898 tests de test262) | — | LibJS | [ladybird.org/posts/adopting-rust](https://ladybird.org/posts/adopting-rust/) | Pre-alfa | Muestra que Rust sirve para partes de un motor; la ejecución sigue en C++ y ensamblador |

**Resumen de rendimiento frente a V8/JSC (solo lo que dice una fuente primaria):** si embebes V8 o SpiderMonkey desde Rust, obtienes el mismo motor y el mismo JIT, así que el rendimiento de ejecución es el del motor. Con QuickJS o QuickJS-NG, el rendimiento es de intérprete: 0,47× de V8 **sin JIT** en la tabla de §2.3. Los motores en Rust puro (Boa) están en torno a 0,08× de V8 sin JIT. No encontré fuentes primarias que midan Nova o Brimstone frente a V8.

---

## 4. Qué elegir según el objetivo

| Objetivo | Recomendación | Por qué | Riesgo |
|---|---|---|---|
| **Throughput máximo** (servidor, cómputo largo) | Node o Deno (V8), o Bun (JSC) | Motores con JIT de 3 niveles y las únicas cifras 2026 de JetStream 3 | Probar con tu propia carga: los líderes cambian por suite y hardware |
| **Arranque mínimo / CLI / funciones cortas** | QuickJS-NG (vía `rquickjs`) o LLRT en Lambda; Hermes V1 si es React Native | Sin costo de JIT; < 300 µs por runtime (QuickJS) | Se degrada en bucles largos (LLRT lo documenta). LLRT es experimental |
| **Embeber JS en un programa Rust** | Compatibilidad y velocidad: `deno_core` o `v8`. Binario pequeño y build simple: `rquickjs`. Todo en Rust sin C/C++: `boa_engine` | V8 da JIT y ~98 % de test262; QuickJS-NG es pequeño; Boa evita toolchains de C++ | V8: build de ~30 min y binario grande. Boa: ~12× más lento que V8 sin JIT |
| **Llamar a Rust desde Node** | `napi-rs` (v3) | Node-API estable en ABI, CLI de publicación por plataforma, también lo cargan Deno y Bun | Matriz de binarios por target; empaquetado más complejo que JS puro |
| **Llamar a Rust desde el navegador** | `wasm-bindgen` + `wasm-pack` | Único camino portable a todos los navegadores; Rust→Wasm está en JetStream 3 | Frontera JS↔Wasm y bindings al DOM |
| **Plugins en sandbox** (código de terceros) | Isolates de V8 (modelo Workers) si ya usas V8; Javy (JS→Wasm con QuickJS) sobre Wasmtime si quieres aislamiento por Wasm | Aislamiento de memoria por isolate o por instancia Wasm | Javy no tiene JIT. **No usar FFI ni addons nativos** para código no confiable (salen del sandbox, según la doc de Deno) |

---

## 5. Fuentes (abiertas el 2026-09-27)

**Benchmarks y harnesses**
- https://browserbench.org/announcements/speedometer3.1/
- https://browserbench.org/Speedometer3.1/ (la página se renderiza en el cliente; no expone resultados)
- https://browserbench.org/JetStream/ · https://browserbench.org/JetStream3.0/in-depth.html · https://browserbench.org/announcements/jetstream3/
- https://test262.fyi/ · https://data.test262.fyi/meta.json · https://data.test262.fyi/index.json
- https://boajs.dev/benchmarks · https://github.com/boa-dev/data (workflow `benchmark.yml`, `bench/results/score.json`)
- https://arewefastyet.com/ (renderizado en cliente; sin números extraíbles)

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

**QuickJS, GraalJS y experimentales**
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
- https://github.com/denoland/rusty_v8 · https://github.com/denoland/deno/tree/main/libs/core · https://github.com/denoland/deno_core (archivado)
- https://github.com/DelSkayn/rquickjs · https://github.com/servo/mozjs
- https://napi.rs/docs/introduction/getting-started · https://neon-rs.dev/
- https://wasm-bindgen.github.io/wasm-bindgen/ · https://github.com/wasm-bindgen/wasm-pack
- https://github.com/bytecodealliance/javy
- API de crates.io (`https://crates.io/api/v1/crates/<nombre>`) para `boa_engine`, `v8`, `deno_core`, `rquickjs`, `mozjs`, `napi`, `neon`, `wasm-bindgen`, `javy`, `nova_vm`

---

## 6. Lo que no pude verificar

- **Cifras de Safari/JSC en 2026** en Speedometer 3.1 o JetStream 3: Apple no las publicó en las notas de Safari 27 ni en el post de JetStream 3 (solo "~10 % de mejora").
- **Cifras oficiales de Firefox/SpiderMonkey** en Speedometer 3.1 o JetStream 3, y los datos de AreWeFastYet (la página requiere JS).
- **La corrida detrás del récord de Chrome** (61 / 469): es autorreportada y la máquina es de Google.
- **La cifra absoluta 52,35 (Speedometer 3.1, 2025)**: el texto de Google solo dice +22 %; el número aparece en el gráfico y en prensa secundaria.
- **Números de rendimiento de "Static Hermes"** en una fuente oficial de Meta. RN 0.82 confirma que no está en Hermes V1.
- **Qué rama de Hermes** usa test262.fyi (41,81 % puede no reflejar Hermes V1).
- **La máquina de los benchmarks de Porffor**, las corridas crudas del "10× más rápido" de LLRT y del "100× más rápido" de Workers.
- **Conformidad de Nova y Brimstone** en un harness independiente: ninguno aparece en test262.fyi.
- **El JIT Cranelift de Wasm en Ladybird**: solo lo vi en un resumen de búsqueda, no en la fuente primaria.
- **La versión exacta de V8 que trae Node.js** a esta fecha (no la consulté).
