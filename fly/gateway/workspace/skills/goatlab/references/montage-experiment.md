# Inventario y dirección del montaje

La fuente de verdad es `src/lib/montage-experiment.json`, sincronizada a `lib/` del skill.
`clips: 4` fija el objetivo de producción en Actions y la comprobación del banco completo.
La dirección editorial se controla por separado: `mode: freedom` devuelve la libertad
completa para elegir fotos, clips o gráficos, sin cuotas ni prioridad obligatoria.
`clips-first` conserva una prueba opcional de prioridad editorial; `matches` limita esa
prioridad a IDs explícitos, o null a todos. Ambos modos mantienen el mismo inventario.

## Cambiar la dirección

Ante «vuelve al modo de libertad completa», ejecutar desde el repositorio:

```sh
node scripts/set-montage-mode.mjs freedom
node scripts/sync-goatlab-skill.mjs --check
```

Publicar el commit y desplegar Gateway con su revisión; Actions toma el ajuste del repositorio.
El cambio aplica al siguiente turno de autoría y conserva el objetivo de cuatro clips,
los bancos existentes, tareas aceptadas, hashes y la autoridad privada R2.
Los montajes entregados y las composiciones ya aceptadas permanecen intactos.
Para reactivar la prioridad sobre la misma lista usar `node scripts/set-montage-mode.mjs clips-first`.

## Validación del banco

Comprobar admisión y publicación de cuatro clips, lectura del cuarto con checksum y
libertad editorial. `3-media-creation` con modo `clips-only` reutiliza los recursos
confirmados y genera solo los que faltan. Un banco con dos o tres clips se usa como
parcial hasta completar los cuatro. Un resultado deferred no demuestra un banco completo:
verificar cada manifiesto y sus recursos pendientes antes de informar disponibilidad.
