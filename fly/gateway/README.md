# Arranque del Gateway

La purga automática de conversaciones a las 72 horas se documenta en [retención del estado](RETENTION.md).

Fly conecta a Nginx en `0.0.0.0:3000`. OpenClaw escucha solo en
`127.0.0.1:3001`: esa separación es intencional porque la UI pasa por
`ui-access.mjs` en 4003. Los probes `/healthz` y `/startupz` pasan directamente
de Nginx a OpenClaw.

El log del 24 de octubre de 2026 muestra conexiones rechazadas mientras
OpenClaw inicializa SQLite en `/data`. No demuestra un puerto mal configurado,
una base corrupta ni un error fatal. El supervisor anterior podía permanecer
vivo indefinidamente sin que OpenClaw llegara a escuchar.

La inspección posterior de Fly sí confirmó un evento `oom_killed` a las
15:36 UTC del 24 de octubre, anterior al fragmento posterior de logs. La purga
reduce el estado que debe admitir SQLite; no demuestra por sí sola que nunca
volverá a producirse un pico de memoria.

`runtime.mjs` usa el launcher de la imagen `/app/openclaw.mjs` y espera un
`/startupz` exitoso antes de recuperar tareas e iniciar el reloj de inactividad.
El supervisor apaga la VM tras diez minutos sin interacción cuando no hay turnos
ni tareas pendientes. Fly permite cero máquinas encendidas y la vuelve a iniciar
al recibir una solicitud. Las conversaciones vencidas se purgan antes de abrir
el servicio en cada arranque; mientras está encendida también se purgan al vencer.
No interrumpe un arranque lento: `GOATLAB_GATEWAY_STARTUP_TIMEOUT_MS=0`
desactiva el plazo de reinicio. Solo debe activarse con un presupuesto medido.
La traza nativa identifica las fases del arranque. Fly comprueba
`/startupz` con un minuto de gracia (máximo aceptado por Fly); `/healthz` sigue disponible como probe
de vida. Un fallo de cualquier servicio sigue revocando el acceso web al
terminar el conjunto.

Validación local:

```sh
node --test tests/conversation-retention.test.js tests/gateway-runtime.test.js tests/ui-access.test.js tests/idle-safety.test.js
```

Desplegar desde la raíz del repositorio, con Fly autenticado:

```sh
fly deploy . --config fly/gateway/fly.toml --wait-timeout 6m
fly checks list -a goatlab-gateway
fly logs -a goatlab-gateway --no-tail
fly ssh console -a goatlab-gateway -C 'curl -fsS http://127.0.0.1:3001/startupz'
```

Buscar `[runtime] gateway startup complete` o las líneas periódicas
`[runtime] waiting for gateway`, junto con la última fase de
`[gateway] startup trace`. La corrección requiere comprobarse con el volumen
real después del despliegue; una prueba con estado vacío no reproduce su coste
de admisión SQLite.

Contrato de probes de la versión fijada:
[OpenClaw 2026.9.6](https://github.com/openclaw/openclaw/blob/v2026.9.6/docs/gateway/health.md).
