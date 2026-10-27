# Prueba de clips como base visual

La fuente de verdad es `src/lib/montage-experiment.json`, sincronizada a `lib/` del skill.
`mode: clips-first` pide tres clips por partido y prioriza su uso en la autoría.
`matches` limita la prueba a una lista explícita de IDs; null abarca todos los partidos.
Fuera de la lista se conserva freedom. La primera activación solo incluye Levante–Atlético.

La prioridad es editorial, sin porcentaje mínimo ni obligación de usar los tres clips.
Imágenes y gráficos complementan la narración. Si faltan clips se usan imágenes y gráficos;
si falta todo el banco se permite un montaje con gráficos. Cada autoría registra el modo y
los clips utilizados en notes. La revisión visual sigue siendo orientativa.

## Volver a libertad completa

Ante «vuelve al modo de libertad completa», ejecutar desde el repositorio:

```sh
node scripts/set-montage-mode.mjs freedom
node scripts/sync-goatlab-skill.mjs --check
```

Publicar el commit y desplegar Gateway con su revisión; Actions toma el ajuste del repositorio.
Esto restaura la instrucción libre anterior y el objetivo de dos clips para nuevas generaciones.
Conserva el tercer clip, los bancos existentes, tareas aceptadas, hashes y la autoridad privada R2.
Los montajes entregados y las composiciones ya aceptadas permanecen intactos; el cambio aplica
al siguiente turno de autoría. La lectura admite hasta tres recursos verificados en ambos modos.
Para reactivar sobre la misma lista usar `node scripts/set-montage-mode.mjs clips-first`.

## Validación y ampliación

Antes de ampliar matches: pruebas de admisión de tres clips, publicación sin regenerar los dos
anteriores, lectura del tercero con checksum y vuelta a freedom. Ejecutar `3-media-creation`
con el ID del partido piloto y modo `clips-only`; comprobar cuatro fotos y tres clips distintos,
HEAD/GET R2, dimensiones, duración y banco completo. Ampliar después la lista a los partidos
actuales y ejecutar el mismo workflow en clips-only. Un resultado deferred no demuestra un
banco completo: verificar cada manifiesto y recursos pendientes antes de informar disponibilidad.
