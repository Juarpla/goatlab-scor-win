# Validación de la base audiovisual

Fecha: 5 de octubre de 2026. OpenClaw 2026.9.6; protocolo Gateway 4.

- Gateway: máquina existente `8576142b2037e8`, shared CPU 2, 2048 MB,
  volumen `goatlab_state` conservado. Render: máquina existente `8de394be031738`,
  shared CPU 2, 4096 MB. No se crearon aplicaciones, volúmenes ni planes.
- Autoarranque HTTP activado por decisión del propietario. Telegram entrega
  directamente a `https://goatlab-gateway.fly.dev/telegram-webhook`.
  Cloudflare no participa en Telegram: receptor retirado, secretos retirados,
  credencial exclusiva de Fly revocada. El Worker del sitio conserva su función.
- UI nativa validada en Fly con un proxy de prueba local y bienvenida simulada:
  login POST, cookie segura, identidad de dispositivo firmada, protocolo/build
  instalado, `chat.history` y `chat.abort`, rechazo de `config.set` por falta de
  administración, encabezados de identidad falsificados, revocación de cookies y
  conexión WebSocket al renovar. Ningún mensaje de prueba se envió a Telegram.
- La cadena real de apagado se ejercitó con una copia temporal y relojes
  acelerados: revocación, suspensión nativa y stop de Fly confirmados; máquina
  detenida con autoarranque activado y webhook directo conservado. Los intervalos
  de producción permanecen en diez minutos. Esta prueba no modifica la imagen.
- La página pública `/access` devuelve 200; webhook sin secreto devuelve 401.
  La prueba no ejecuta turnos de modelo ni generación Agnes de pago o gratuita.
- Suspensión nativa real: cero trabajos activos, estado `ready`; recuperación
  `gateway.suspend.resume` comprobada. El supervisor usa este contrato por RPC
  local y protege trabajos del workflow antes de solicitar el stop de Fly.
- Browser headless probado por RPC, navegación y snapshot de texto; cierre final.
  Dos mediciones sin CLI adicional: picos de 1258 y 1211 MiB; en la segunda,
  navegación y texto de `https://docs.openclaw.ai/web` confirmados, con 773 MiB
  disponibles durante navegación. Es una prueba de una página, no una garantía para sitios arbitrarios.
  Mantener una investigación a la vez y cerrar al terminar; no ampliar RAM.
- 311 pruebas Node y 38 Python pasan, junto al build de Astro y la sincronización
  del skill. Las suites automatizadas cubren duplicados de `/start`, códigos/cookies/socket
  revocados, arranque sin credenciales web, reintentos de bienvenida, origen,
  aislamiento del proxy, actividad real frente a consultas/pings, admisión de
  trabajos y exclusión de fotografías externas en bancos nuevos y reutilizados.

Comandos locales: `pnpm test`, `python3 -m unittest discover -s tests/pipeline -v`,
`node scripts/sync-goatlab-skill.mjs --check`, `pnpm run build`, `git diff --check`.
Las pruebas de servicios usan mocks; no mandar pruebas al chat real.

El smoke Docker amd64 en Mac falló por `openat2: Function not implemented` en la
emulación. El arranque Linux nativo en Fly pasó las migraciones y la comprobación
real de integridad. No se desactivaron protecciones de filesystem para sortearlo.

Recuperación: la imagen anterior de Gateway es
`registry.fly.io/goatlab-gateway@sha256:002c94dde011c22b714eae5073b4f6571a4238c141e54f2c1ff7a6ae0d722f3f`.
Restaurarla revierte también sus capacidades y reglas anteriores; revisar la
compatibilidad con Render antes de reanudar producción. Mantener volumen y webhook
actual. Para limitar solo browser, deshabilitar `browser.enabled` y reiniciar.
