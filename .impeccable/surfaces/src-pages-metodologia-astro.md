# Surface brief — Metodología

- **Target:** `src/pages/metodologia.astro`
- **Mode:** Read (el visitante entiende cómo se construye y evalúa el análisis) con un cierre Persuade (CTA a Encuentros).
- **Scope:** reescritura de la página dentro del mundo establecido (DESIGN.md); extensión del patrón `.story` de `partido/[id].astro`.

## Dirección (direction contract)

**THESIS:** La metodología no se lee, se recorre: cada capa del análisis (datos → IA → editor) se explica con una ilustración SVG que se dibuja mientras el lector avanza. Se rechaza la página estática de solo texto (la versión incumbente) y también el muro de tarjetas homogéneas.

**OWN-WORLD:** Paleta DESIGN.md (carbón #101412, superficie mate #181e1a, lima #c5ed74 como única señal, azul pizarra #8ca6bf como segunda serie). Barlow Condensed para capítulos y cifras grandes; Manrope para la lectura. Ilustraciones: diagramas vectoriales planos con linework de 1px y rellenos tonales — geometría SVG, no "ilustración pictórica". Mismo grid `.story` con stage sticky que la página de partido.

**STORY:** El visitante entiende las tres capas en orden, ve cómo se evalúa la estadística (gate de publicación, cifras reales de evaluation.json), entiende que la IA no es fuente de resultados, que los anuncios viven fuera del análisis y que no hay apuestas. Sale hacia Encuentros con el teléfono del producto a la vista.

**FIRST VIEWPORT:** Tesis "Los datos necesitan contexto." a la izquierda (Barlow 60px) con un pequeño diagrama de las tres capas (tres nodos conectados por una línea que se dibuja) a la derecha; debajo arranca el scrollytelling: notas a la izquierda, stage sticky a la derecha con la ilustración del capítulo 1 (curva de Poisson con barras que crecen).

**FORM:** Precisamente especificado por el usuario en grilling: patrón `.story` reutilizado, 3 capítulos + stage sticky con un SVG por capítulo, 3 unidades AdSense (tras cap. 1 horizontal, tras cap. 2 rectangular, final horizontal), teléfono SVG en stage cap. 2 y en el cierre, anchors `#datos-historicos` `#analisis-ia` `#criterio-editor` intactos, texto editable conservando todos los datos. Seed: n/a (solicitud estrecha, sin torneo de conceptos).

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Notas de contenido

- Mantener todas las afirmaciones del texto incumbente: proveedores, "no publicamos cifras inventadas", frecuencia ≠ probabilidad, Poisson + CatBoost + señales, pesos declarados, gate de publicación, cifras dinámicas de `evaluation.json`, limitaciones de la IA, ads separados, sin enlaces a apuestas.
- Añadir nota de no afiliación con Bzzoiro (PRODUCT.md la exige en metodología; hoy falta).
- Anclas de la home intactas (`index.astro` → guía).
- Ads: `src/config/ads.ts` con credenciales placeholder; sin credenciales, AdSlot muestra el espacio reservado existente. ads.txt placeholder en `public/`.

## Sin resolver

- Credenciales reales de AdSense (el usuario las pegará en `src/config/ads.ts`).
