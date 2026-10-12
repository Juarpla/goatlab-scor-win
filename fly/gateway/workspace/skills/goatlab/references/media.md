# Medios y reintentos

El banco pertenece al partido y reúne cuatro imágenes y dos clips Agnes, reutilizables
entre audios y chats. El montaje puede continuar con recursos parciales y gráficos.
Las fotos externas se filtran. Los prompts publicados de imagen/vídeo deben coincidir
con ID, equipos traducidos, competición y kickoff; motion inválido usa `editingFacts`.
El top debe ser válido y tener como máximo siete horas. Una petición manual omite
solamente su antigüedad y conserva el límite kickoff + 24 h.

## Consulta y reintentos en Gateway

Gateway consulta objetos del prefijo `partidos/<id>/` mediante HEAD firmado para
metadatos y GET público para comprobar acceso y checksum. Verifica los prompts y
la identidad del partido; solo publica en su caché local los recursos compatibles.
No consulta cuotas Agnes ni escribe o borra objetos de R2. La consulta tiene un
límite de 90 segundos. Un 404 significa recurso ausente; 403, transporte y recursos
inválidos se informan por separado. Si falla R2, conserva la caché compatible y
continúa con gráficos. Banco parcial es un resultado válido, no una interrupción.

Para «reintenta fotos», ejecutar `retry --chat=<chat>`: vuelve a consultar imágenes
y clips publicados por Actions. Actualiza el banco de los montajes pendientes y
conserva los trabajos ya aceptados y entregados.
Para «reintenta el video 3», consultar `status --chat=<chat> --number=3` y ejecutar
`retry --chat=<chat> --request=<requestId>` con su identificador original.
`delivery-unknown` exige verificar Telegram antes de reenviar; `unavailable` no
demuestra fallo. No pedir una grabación nueva por un fallo del servidor.

El progreso muestra imágenes disponibles sobre cuatro y clips sobre dos, sin
cronómetro. Un estado de Render con más de 90 segundos sin confirmación se indica
como pendiente de actualización, sin afirmar que continúa planificando ni que
falló. Los errores de montaje y de consulta del banco se comunican separadamente.

## Producción y conservación en Actions

GitHub Actions genera imágenes, clips y prompts, publica en R2 y realiza el
mantenimiento remoto. La admisión, cuotas y recuperación Agnes mantienen el
contrato de `AGNES-STATE.md`; Gateway utiliza `MEDIA_ROLE=consumer` y el productor
exige `MEDIA_ROLE=producer` dentro de GitHub Actions. Actions reintenta a las
02:15, 04:15 y 06:15 Lima, sin consultar ni encender Fly.

El banco completo mantiene las pruebas v2 de cuatro fotos y dos clips distintos.
La generación parcial conserva un banco completo anterior. La poda remota sigue
requiriendo final confirmado y protección de trabajos pendientes. Gateway limpia
únicamente su caché de lectura, caducada y sin trabajos que la necesiten. Actions
continúa desde R2 y elimina los temporales tras confirmar cada subida.
Ver [deployment.md](deployment.md) para despliegue y comprobaciones.

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
