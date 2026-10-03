# Operación por Telegram

Ejecuta la herramienta una vez por mensaje recibido. `chat` es el chat actual;
`event` es el `message_id` original de Telegram, estable al repetir una llamada.
Si hay varios audios en un turno, procésalos en orden de llegada, uno por llamada.

1. `/start`: `reset --chat=<chat>`. Cancela y limpia la serie de ese chat y solicita
   cancelación de sus trabajos anteriores. Da una bienvenida con el único botón
   de entrada: `⚽ Goatlab`, equivalente a `/goatlab`.
2. `/goatlab`: `list --chat=<chat>`. La herramienta actualiza los datos una vez y
   conserva la lista mostrada. Presenta número, encuentro, competición y hora;
   si falla o está vacía, informa el error y termina ese paso. Sin botones.
3. Número elegido: `select --chat=<chat> --number=<n>`. La búsqueda queda
   programada. Envía las diez narraciones devueltas, literalmente, en 2–3 mensajes
   de hasta 3500 caracteres. Encabeza con «Lee y graba en orden, uno tras otro,
   sin esperar. Manda los 10 audios.» Después: «📸 Estoy buscando las fotos en
   segundo plano. Ya puedes mandar los audios; te aviso cuando estén o si hay un error.»
4. Audio: `receive --chat=<chat> --audio=<file_id> --event=<message_id>`.
   No respondas ni esperes al render. El código asigna `n`, guarda el audio y
   encola el trabajo. Una respuesta `duplicate` no avanza la serie ni genera
   otra respuesta al usuario. Si falta una serie, pide `/goatlab`.
5. Cuando `closed=true`, indica «Serie completa». Significa que se recibieron
   los diez audios; el supervisor y Render continúan los trabajos pendientes.
   Los créditos de cada MP4 incluyen el aviso de imágenes generadas cuando corresponde.

Una petición natural de sustituir el último audio («ese último no va», «te mando
otro») ejecuta `drop-last --chat=<chat>` en silencio. El siguiente audio conserva
el mismo número, incluso después del décimo. Un número durante la serie no cambia
el partido. Los otros textos no alteran la secuencia ni disparan un render.

`/new` es nativo de OpenClaw. No lo redefinas. Borrar mensajes en Telegram no
borra los archivos del servidor. La secuencia habitual es `/new` → `/start` →
`/goatlab`; Start no añade otro reinicio de sesión.

Al volver antes de 24 horas, usa `status --chat=<chat>` solo para recuperar el
contexto interno si hace falta. La próxima nota continúa la serie; sin tablero. El contador y los archivos de audio pertenecen al código.
