# Caducidad fija de conversaciones

La política es 72 horas desde la creación de la conversación, incluidas la
principal, las archivadas y sus generaciones anteriores. La actividad, los
resets, el archivado y los reinicios no renuevan el plazo. Las bifurcaciones y
subsesiones que copian contexto heredan el plazo más antiguo. Después de una
purga, el mismo destino de Telegram/UI crea una sesión nueva.

## Implementación

`start.sh` ejecuta `retention-supervisor.mjs`. Antes de abrir el servicio, el
supervisor ejecuta una purga offline. Mientras funciona, consulta el siguiente
vencimiento cada 30 segundos y programa el cierre antes del plazo: concede hasta
25 segundos para terminar y mata el grupo de procesos completo si es necesario.
Solo después de detener los escritores y alcanzar el vencimiento purga y vuelve
a arrancar. Un turno activo también puede interrumpirse al vencer la conversación.
La indisponibilidad habitual de este ciclo incluye hasta 30 segundos previos al
vencimiento, más la purga y el arranque de OpenClaw.

`conversation-retention.mjs` está adaptado a OpenClaw **2026.9.6, esquema 23**:

- Usa el nacimiento nativo, la primera transcripción y un registro persistente
  sincronizado a disco; nunca `updated_at` ni el mtime del archivo.
- Descubre todos los agentes del volumen, también retirados. Incluye ventanas
  anteriores, archivos SQLite de respaldo/reparación y transcripciones JSONL,
  `.reset`, `.deleted` y comprimidas, incluidas las copias frías por hash.
- Elimina nodos, ventanas, transcripciones, archivos y referencias de historial
  en la base compartida. Las claves foráneas eliminan entradas pendientes,
  participantes, tarjetas y artefactos asociados.
- Vacía cachés y memoria derivada para cubrir paráfrasis antiguas sin procedencia
  completa. Elimina `MEMORY.md`, `memory.md` y archivos de `memory/` de los
  workspaces gestionados. La búsqueda entre conversaciones, el plugin de memoria
  y el guardado automático antes de compactar están desactivados.
- Usa `secure_delete`, checkpoint del WAL, `VACUUM` y comprobación de claves
  foráneas. No crea un respaldo del contenido que se está eliminando.
- Conserva configuración, credenciales, OAuth, dispositivos emparejados, skills
  y las bases independientes de GoatLab. Los videos publicados y los archivos de
  trabajo del flujo de videos tienen su propio mantenimiento.
- Una interrupción conserva los nacimientos por sesión hasta completar el borrado
  de archivos; volver a intentarlo no concede otras 72 horas. Un esquema
  incompatible, una base ocupada o un fallo de purga bloquean el arranque.

La purga requiere propiedad exclusiva. En Linux comprueba que otros procesos del
usuario del runtime no mantengan abiertos los archivos nativos. No debe invocarse
manualmente con el Gateway en ejecución. La vista previa es de solo lectura:

```sh
node /home/node/conversation-retention.mjs --dry-run
```

Para mantener el supervisor en ejecución, el apagado por inactividad está
**desactivado** y Fly mantiene una VM encendida. Esto aumenta el tiempo facturado
respecto al apagado tras diez minutos. Si la máquina se detiene manualmente o hay
una avería, no puede borrar físicamente datos mientras está apagada; la purga
previa al siguiente arranque impide servir el historial vencido.

Los trabajos programados del modelo están desactivados (`cron.enabled=false`).
La cola de render y su mantenimiento operativo siguen siendo independientes.

## Copias externas y límites

Se desactivaron los snapshots automáticos del volumen en Fly. Los snapshots
anteriores (cinco, creados entre el 20 y el 24 de octubre de 2026) conservan
su retención original de cinco días; el último vence el **29 de octubre de 2026,
03:56:52 de Lima**: cambiar la retención
no la modifica retroactivamente y la API pública no ofrece borrado individual.
Por tanto, **hasta que caduquen esos snapshots antiguos no se puede afirmar que
no queda ninguna copia de respaldo en Fly**. Restaurarlos no permite servir
conversaciones caducadas: el supervisor vuelve a purgar antes de abrir el servicio.

Esta política controla el historial y las copias nativas de esta instalación.
No borra mensajes de la cuenta de Telegram, datos retenidos por los proveedores
del modelo, exportaciones manuales fuera del estado gestionado ni copias que un
operador cree posteriormente. El borrado lógico y la compactación no son una
promesa de sobrescritura forense de bloques físicos del proveedor.

## Validación

```sh
node --test tests/conversation-retention.test.js tests/gateway-runtime.test.js tests/ui-access.test.js tests/idle-safety.test.js
```

La fixture SQL reproduce el esquema oficial. Las pruebas cubren el límite exacto,
actividad reciente, archivos fríos y de borrado, generaciones, bifurcaciones,
memoria/índices, credenciales/configuración, reintentos tras interrupción y un
escritor real que ignora SIGTERM durante el vencimiento.

## Referencias

- [Esquema y almacenamiento nativo](https://github.com/openclaw/openclaw/blob/v2026.9.6/src/state/openclaw-agent-schema.ts).
- [Mantenimiento nativo](https://github.com/openclaw/openclaw/blob/v2026.9.6/docs/reference/session-management-compaction/maintenance.md).
- [Snapshots de Fly](https://docs.fly.io/volumes/snapshots).
- [API de Fly Machines](https://docs.machines.dev/).

## Despliegue verificado — 24 de octubre de 2026

Imagen `deployment-01M5QMNFFYRHSH6VZZJKV3MJWX`, máquina `8576142b2037e8`.
Fly confirmó el despliegue y su check `/startupz` en estado `passing`; el puerto
local 3001 y la ruta pública devolvieron `ok:true, status:started`. Después de
la purga, la vista previa devolvió cero conversaciones/generaciones vencidas.
Las bases de main y director quedaron en 4.2 y 7.3 MiB, respectivamente, sin
errores de claves foráneas. Las huellas de seis almacenes/archivos de credenciales
y la lista de secrets de Fly permanecieron idénticas antes y después.

La CI incluye un job Node 24 para las pruebas del Gateway, como requiere la
imagen fijada. El job web conserva Node 22 y omite únicamente esta suite nativa.
