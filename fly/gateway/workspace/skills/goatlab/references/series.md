# Operación por Telegram

Ejecuta la herramienta una vez por mensaje recibido. `chat` es el chat actual;
`event` es el `message_id` original de Telegram, estable al repetir una llamada.
Si hay varios audios en un turno, procésalos en orden de llegada, uno por llamada.

1. `/start` de Telegram: el webhook cancela la serie y sus trabajos anteriores,
   renueva el acceso web y envía la bienvenida con `⚽ Goatlab`. El agente no
   ejecuta herramientas ni repite la bienvenida por ese comando.
2. `/goatlab`: `list --chat=<chat>`. La herramienta actualiza los datos una vez y
   conserva la lista mostrada. Presenta número, encuentro, competición y hora;
   si falla o está vacía, informa el error y termina ese paso. Sin botones.
3. Número elegido: `select --chat=<chat> --number=<n>`. Los JSON de Scripts, Image Prompts, Video Prompts y Motion Prompts se consultan
   desde goatlab.win y se guardan con la serie. La generación queda programada. Envía las diez narraciones devueltas, literalmente, en 2–3 mensajes
   de hasta 3500 caracteres. Encabeza con «Lee y graba en orden, uno tras otro,
   sin esperar. Manda los 10 audios. Graba hasta 45 segundos por audio.» Después: «📸 Estoy preparando imágenes y clips con Agnes en
   segundo plano. Ya puedes mandar los audios; te aviso cuando estén o si hay un error.»
   Si `missingCategories` no está vacío, informa cuáles faltan y que el montaje
   utilizará el material disponible.
4. Audio: el webhook ejecuta `receive` usando el chat, file_id y message_id
   originales. No vuelvas a encolarlo desde el agente. Para una instalación sin
   webhook, usa `receive --chat=<chat> --audio=<file_id> --event=<message_id>`
   solo con identificadores originales de Telegram.
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
