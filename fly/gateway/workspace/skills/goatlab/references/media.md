# Medios y reintentos

El banco pertenece al partido y reúne cuatro imágenes y dos clips Agnes, reutilizables
entre audios y chats. El montaje puede continuar con recursos parciales y gráficos.
Las fotos externas se filtran. Los prompts publicados de imagen/vídeo deben coincidir
con ID, equipos traducidos, competición y kickoff; motion inválido usa `editingFacts`.
El top debe ser válido y tener como máximo siete horas. Una petición manual omite
solamente su antigüedad y conserva el límite kickoff + 24 h.

## Admisión y recuperación

La autoridad es el JSON privado `app-states/goatlab/agnes-state.json` en R2. SQLite
es caché. Cada POST requiere una reserva nueva confirmada con CAS. Los slots
partido/tipo/ordinal conservan identidad y consumo tras un reinicio o cambio de prompt.
Estado ausente/corrupto/offline cierra nuevas solicitudes; los recursos ya guardados
siguen reutilizándose. Los scripts aplican estos controles, sin intervención del agente.

Un 429 probado sin identificador devuelve cuota una sola vez y guarda `Retry-After`.
Un 429 con ID, respuesta ilegible, transporte, timeout o 5xx conserva la reserva.
Un vídeo con identificador se recupera mediante GET de ese mismo ID, con permisos
compartidos de 60 s. La ventana de recuperación ante errores es de 60 s por corrida;
la siguiente corrida puede retomar GET. Un resultado incierto sin ID queda bloqueado.
Las respuestas de imagen guardadas localmente se recuperan con la misma identidad,
sin otro POST. La pérdida del resultado puede dejar el banco parcial.

Image Flash usa 2K 9:16, doce inicios/minuto y una solicitud simultánea. Video Flash
usa 720×1280, seis segundos, un inicio cada 30 s y una tarea simultánea. El techo
operativo diario es 4.000 imágenes y 360 segundos reservados, contado en el día UTC
de la reserva. Cada vídeo dispone de cinco ordinales; un fallo terminal confirmado
permite avanzar. El presupuesto conjunto es nuevo por corrida: 50 minutos por defecto,
limitado además a kickoff + 24 horas. Se ignora el cronómetro de progresos antiguos.

Para «reintenta fotos», ejecutar `retry --chat=<chat>`: reutiliza lo conseguido.
Para «reintenta el video 3», consultar `status --chat=<chat> --number=3` y ejecutar
`retry --chat=<chat> --request=<requestId>` con su identificador original.
`delivery-unknown` conserva el archivo y exige verificar Telegram antes de reenviar;
`unavailable` no demuestra fallo. No pedir una grabación nueva por un fallo del servidor.

## Publicación y conservación

Un banco v2 completo tiene cuatro fotos y dos clips distintos con evidencia de prompt,
modelo, referencia y disponibilidad R2. Un PUT fallido deja el intento parcial.
R2 block permite lecturas y reutilización, con cero solicitudes Agnes y cero PUT de media;
los controles privados siguen disponibles. Los drafts conservan un completo anterior
si el nuevo intento queda parcial. La web sigue leyendo bancos legacy.

La poda exige FT/AET/PEN con ambos marcadores finitos y más de una hora desde la
primera detección válida del final. La evidencia terminal persiste aunque el fixture
desaparezca; una corrección a NS/LIVE/PST invalida la autorización anterior.
Salir del top o de la ventana conserva el contenido. Producción, generación pendiente
o subida sin resolver impiden cerrar el partido. Primero se confirma el borrado del
prefijo R2 exacto `partidos/<id>/`, y después se borran artefactos locales.

Actions reintenta a las 02:15, 04:15 y 06:15 Lima, sin consultar ni encender Fly.
Ver [deployment.md](deployment.md) para migración, secretos y comprobaciones.

## Voz y motion graphics

React y Remotion ejecutan los gráficos según el plan de cada voz. El sistema
conserva todas las palabras y ajusta la velocidad solo cuando hace falta, hasta
un 10%, manteniendo el tono. La voz disponible es 45.9 segundos dentro de un MP4
máximo de 49.9 segundos. Si Render informa VOICE_TOO_LONG, explica que debe grabar
hasta 45 segundos y sustituir ese audio; reintentar el mismo archivo no lo resuelve.

El motion alterna presentation editorial y statistical según la voz. Editorial
utiliza tipografía, duelos entre equipos, recorridos ilustrativos y energía sin
necesitar datos verificados. Statistical resuelve cifras del catálogo. Sin datos
pertinentes, el montaje puede ser totalmente creativo. Mantener subtítulos legibles.
