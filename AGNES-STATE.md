# Estado compartido de Agnes

La autoridad de admisión está en `app-states/goatlab/agnes-state.json`, mediante
la API S3 directa de R2. El bucket debe ser privado, Standard, con `r2.dev`
deshabilitado y sin dominio público. GoatLab reutiliza las credenciales S3 de media para este bucket privado. El cliente solo opera sobre ese objeto.
Actions consulta R2 directamente; esta persistencia no necesita encender Fly.

Cada POST requiere una reserva nueva confirmada por escritura condicional del
JSON. Un timeout del PUT nunca concede permiso. El mismo intento o slot ya
consumido conserva su bloqueo tras borrar SQLite, reiniciar o cambiar los
prompts. Un 429 demostrado sin identificador devuelve la reserva una vez;
un timeout, 5xx o resultado con identificador la conserva. La reserva usa su día
UTC original, aunque la descarga termine al día siguiente.

El adaptador Python llama al cliente Node mediante JSON por stdin/stdout.
SQLite es temporal y se reconstruye en cada corrida desde R2. La autoridad almacena hashes, identificadores
de recuperación, reservas y reclamaciones; los reportes públicos son proyecciones
saneadas. `public/data/agnes-quota.json` conserva máximos para observación y
nunca autoriza solicitudes ni reconstruye un registro perdido.

## Configuración

Configurar en ambos consumidores las mismas llaves existentes `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` y `R2_ACCOUNT_ID` (o `CLOUDFLARE_ACCOUNT_ID`), con acceso
al bucket público de media y al privado `app-states`. El bucket de estado y su
objeto siguen fijados independientemente de `R2_BUCKET`.

Los siguientes valores permiten una credencial separada opcional:

```text
R2_STATE_ACCOUNT_ID
R2_STATE_BUCKET=app-states
R2_STATE_KEY=goatlab/agnes-state.json
R2_STATE_ACCESS_KEY_ID
R2_STATE_SECRET_ACCESS_KEY
```

Guardar account ID y credenciales en secrets de Actions y Fly. Por decisión del
proyecto se comparten las llaves entre media y estado. Si se configura una pareja
`R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY`, ambos valores son obligatorios:
el cliente nunca mezcla una llave de esa pareja con otra de media. Los permisos
R2 se delimitan por bucket; una carpeta no restringe el token. Para otro proyecto
se emitirán otras llaves.

## Corte coordinado

1. Suspender productores antiguos de Actions y Fly y terminar trabajo activo.
2. Crear o verificar el bucket privado y el acceso con los secrets existentes.
3. Obtener una copia del SQLite de Fly y conservarla fuera de Git. Inventariar
   también artefactos y recursos existentes en R2 antes de habilitar generación.
4. Preparar el seed sin escribir R2:

   ```sh
   node scripts/bootstrap-agnes-state.mjs --sqlite=/ruta/agnes.sqlite --out=.cache/agnes-seed.json
   ```

   Se pueden repetir `--sqlite` y `--snapshot` para incluir evidencia adicional.
   La salida normal contiene solo cantidades. El seed privado conserva tareas
   conocidas y bloquea el resto de slots del conjunto legacy. Los totales del día
   de corte se conservan como estimación histórica; no bloquean solicitudes.

5. Con los secrets cargados en el entorno, crear explícitamente el registro:

   ```sh
   node fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs bootstrap < .cache/agnes-seed.json
   ```

   Usa `If-None-Match: *`. Si existe o la respuesta es incierta, detener el corte
   y leer/verificar el objeto existente. El runtime nunca crea un JSON vacío.

6. Ejecutar la prueba real de concurrencia en un objeto desechable:

   ```sh
   node scripts/check-agnes-r2-cas.mjs --run
   ```

   Debe confirmar un ganador y un HTTP 412 con el mismo ETag, y eliminar el
   objeto de ensayo. Ejecutar además las pruebas de admisión con ambos clientes.
7. Habilitar los productores nuevos solo después de verificar el registro y
   la coordinación. Conservar las copias de migración de forma privada.

La protección contra duplicados comienza en este corte. Una lista de resultados
exitosos no demuestra que un slot sin resultado esté disponible: una solicitud
aceptada cuyo identificador se perdió queda bloqueada y puede dejar el banco parcial.

## Recuperación

Estado ausente, incompatible, corrupto o inaccesible cierra nuevas generaciones.
Las tareas conocidas se recuperan mediante GET del mismo identificador, con
permisos de consulta de 60 segundos y `Retry-After` persistido. Los productores
renuevan actividad cada 30 segundos, con vencimiento de 120 segundos.

Para rollback, detener nuevas generaciones y conservar el JSON privado. Los
recursos publicados pueden seguir reutilizándose. Reparar y verificar la
autoridad antes de reactivar; nunca borrar el registro ni sustituirlo por cuota
vacía. Las reclamaciones de poda y subidas incompletas requieren confirmación,
manteniendo el recurso pendiente hasta verificar su publicación en R2.

Referencias: [compatibilidad S3](https://developers.cloudflare.com/r2/api/s3/api/),
[consistencia](https://developers.cloudflare.com/r2/reference/consistency/) y
[acceso público](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Operación de media

La actualización completa corre a la 01:05 Lima; los tres reintentos de media,
a las 02:15, 04:15 y 06:15. El refresh de marcadores conserva `17 */6` UTC.
Cada corrida dispone de 3.000.000 ms por defecto (`MEDIA_RUN_BUDGET_MS`) y cada
partido se limita además a kickoff + 24 h. `TOP_MAX_AGE_HOURS` vale siete por
defecto y acepta cero. `--match` omite sólo el candado de antigüedad.

`node scripts/check-media-complete.mjs` comprueba la evidencia pública sin
Agnes, descargas ni HEAD. Un banco v2 completo requiere cuatro fotos y dos clips
distintos, identidad, fingerprint y almacenamiento comprobado. Los modos manuales
pueden comprobar su subconjunto sin declarar completo un banco sin seis recursos.
El mantenimiento sigue corriendo aunque no queden partidos elegibles.

Actions continúa desde los objetos de `partidos/<id>/` y el JSON privado. Un
recurso está listo sólo tras verificar en R2 nombre, tamaño, checksum e identidad.
`completed` indica que Agnes terminó; `uploadClaim.confirmed` registra la publicación,
con `objectKey` y `sizeBytes`. Los registros anteriores se completan al verificar sus objetos.
Tras PUT se hace HEAD antes de confirmar el estado y eliminar los temporales del recurso.
Los manifiestos y referencias de clips incluyen únicamente recursos verificados.

Los nuevos intentos guardan `diagnostics` en el estado privado: hasta ocho eventos
compactos por intento y un contador de consultas. Se conserva creación, última
consulta, interrupción y publicación; mensajes de hasta 256 caracteres sin prompts,
binarios, credenciales ni URLs firmadas. Cada petición real aparece en logs con
método, etapa y HTTP; las consultas repetidas actualizan su último registro persistido.
Un fallo de diagnóstico no concede permisos, devuelve cuota ni repite POST.
El summary separa los seis recursos del historial de solicitudes, incluye éxitos,
reutilización R2 sin llamadas a Agnes e historial anterior con su corrida de origen.
Los intentos anteriores sin diagnóstico indican «detalle original no conservado»;
no se reconstruyen desde logs históricos.

Las tareas vigentes con `video_id` se consultan antes de crear otras, aunque estén
fuera del top; esta fase sólo recupera y publica, con hasta 60 segundos por partido
dentro del presupuesto global. GitHub conserva logs y reportes JSON, sin cachés ni
artifacts de media entre corridas. Si una generación consumida perdió el resultado
antes de llegar a R2 y no tiene un identificador recuperable, se informa del bloqueo
y se conserva su consumo. La limpieza local fallida no repite la generación.

La evidencia terminal en `finished-at.json` gobierna la poda de contenido. Los
marcadores, kickoff y primera detección deben ser válidos; la frontera exacta de
una hora conserva el partido. Una corrección a NS/LIVE/PST invalida el ancla.
Media reclama primero el cierre compartido y borra el prefijo R2 exacto, con `/`
final; sólo un éxito remoto confirmado autoriza el borrado local y su publicación.
Resultados y evaluación histórica quedan fuera de este mantenimiento.

## Identidad y nombres de publicación

Los IDs del proveedor (`fd-*`, `af-*`, `bz-*`) siguen identificando fixtures,
pero no son ubicaciones admitidas para nuevas generaciones o publicaciones.
El catálogo resuelve primero IDs de equipo del proveedor dentro de la competición;
los alias deben tener un único propietario. Una identidad ambigua detiene la
publicación hasta corregir el catálogo.

`ordinal` conserva la identidad de la posición interna y de las solicitudes anteriores; no limita el número acumulado de POST. El campo privado opcional
`publicationIndex` asigna mediante CAS una de las dos posiciones de publicación:
`clip-1.mp4` o `clip-2.mp4`. Los metadatos R2 `attemptordinal`, `attemptid` y
`publicationindex` permiten verificar ambos conceptos sin cambiar el banco público.
La asignación sobrevive a fallos de PUT, HEAD o reinicios y no consume cuota.

La migración manual `media-naming-migration` comparte exclusión con el workflow de
media. Un lease privado `maintenance` también bloquea reservas, consultas y
publicaciones de otros procesos. La migración copia y comprueba los bytes y
metadatos, cambia el estado por CAS y publica las referencias antes de retirar
los objetos originales. `generationMatchId` y `referenceHash` conservan la
identidad de las solicitudes originales; `publicationReferenceHash` registra la
referencia actual cuando cambia la URL. `previousObjectKey` permite retomar la
limpieza tras una interrupción. No se vuelven a solicitar recursos a Agnes ni se
reinician intentos, cuotas o diagnósticos.

## Reintentos por recurso y corrida

El estado privado admite versiones 1 y 2. La versión 2 conserva un único estado
operativo en `resources`: `pendiente`, `generando`, `publicando` o `listo`. Sólo
la verificación de R2 permite `listo`. Los estados de proveedor permanecen
como evidencia dentro de los intentos, junto con sus diagnósticos compactos.

Cada corrida concede hasta tres POST por cada imagen y por cada clip pendiente.
El contador sólo existe en memoria del productor; no se almacena un contador
acumulado en R2. El historial y los totales anteriores no se borran ni se reinician.
Los totales diarios son informativos: no hay un límite diario preventivo local.
Agnes decide la disponibilidad de cuota; sus respuestas se muestran con HTTP,
código y mensaje reales, sin inferir agotamiento diario a partir de un 402.
`renew-resource` archiva la identidad original antes de renovar una posición
verificada como ausente, mediante CAS; una tarea vigente con ID debe recuperarse.
Un 503 detiene ese recurso durante la corrida y permite continuar con los otros.
Otra corrida vuelve a disponer de tres intentos. GET, PUT y HEAD no gastan POST.

`pending`, `queued` e `in_progress` conservan el ID y se consultan con pausas de
15, 40 y 75 segundos, y después 90 segundos entre consultas; 429 respeta
Retry-After si exige una espera mayor. Las respuestas repetidas aparecen
en logs y se compactan en el estado. Los diagnósticos archivados se retienen
durante la ventana actual de siete días y siguen sujetos al límite de 900 KB.
Los temporales se eliminan tras publicación confirmada y al finalizar el job.

El reporte de ejecución distingue `complete`, `deferred` y `error`. Un 503/429
de la corrida actual, una tarea aceptada todavía activa o un clip bloqueado
por ella dejan recursos pendientes y código de salida 0. Los recursos siguen
requiriendo verificación R2 para contar como listos. Fallos de R2, identidad,
estado privado, HTTP 402/401 y causas no identificadas mantienen código 2;
tienen prioridad aunque existan otros recursos pospuestos. Un rechazo histórico
no justifica el resultado de la corrida actual. La publicación selectiva sigue
exigiendo bancos completos; no se publica un banco parcial por terminar en 0.

El ritmo efectivo de la clave TokenPlan es 80 creaciones/minuto para imágenes 2K
y una creación de vídeo cada 12,1 segundos (máximo cinco/minuto). Los antiguos
valores 12 y 30,1 segundos se migran mediante CAS sin reiniciar tareas, cuota
registrada ni fechas de Retry-After. Una admisión aplazada identifica el control
local, la próxima fecha permitida y la espera; no representa una respuesta HTTP.
Las omisiones de ritmo y las tareas vigentes se reportan como pendientes, con
código 0; un fallo real de R2 o del estado sigue produciendo código 2.
