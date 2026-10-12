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
   conocidas y bloquea el resto de slots del conjunto legacy. La cuota del día
   de corte queda cerrada; la capacidad nueva comienza el siguiente día UTC.

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
