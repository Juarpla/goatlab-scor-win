# Inventario y dirección del montaje

La fuente de verdad es `src/lib/montage-experiment.json`, sincronizada a `lib/` del skill.
`clips: 4` fija el objetivo de producción en Actions y la comprobación del banco completo.
La dirección editorial se controla por separado: `mode: freedom` conserva libertad
creativa en la presentación, transiciones, efectos y edición de fotos y clips, que
son la base visual del montaje. Los gráficos apoyan la narración. La dirección
inyectada por `media-policy.js` define selección de recursos y alternativas ante
ausencias; [creative.md](creative.md) adapta los estilos a esa dirección.
`clips-first` conserva una prueba opcional de preferencia por los clips dentro de
esa misma dirección; `matches` limita la prueba a IDs explícitos, o null a todos.
Ambos modos mantienen el mismo inventario.

## Cambiar la dirección

Para conservar libertad de edición sin la preferencia experimental por clips,
ejecutar desde el repositorio:

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
