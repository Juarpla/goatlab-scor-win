# Medios y reintentos

El supervisor crea imágenes con Agnes AI y reutiliza solo imágenes Agnes guardadas.
Los bancos antiguos se filtran; las fotos externas no se descargan ni se reutilizan.
Los recursos propios de marca, gráficos y música existentes se conservan.

Intenta reunir el banco compartido de cuatro imágenes y hasta dos clips durante un máximo de quince
minutos, incluido un reinicio. Publica el banco parcial incluso con cero imágenes;
el montaje puede continuar con motion graphics y animaciones. Cada video usa un
subconjunto del banco y continúa con el siguiente audio sin exigir otras tres.

Para «reintenta fotos»: `retry --chat=<chat>`. Se reutiliza lo conseguido; los trabajos
ya preparados mantienen su copia del banco y siguen produciéndose. Con llave
Token Plan Starter, Agnes permite hasta cuatro imágenes compartidas por encuentro:
2K 9:16, doce inicios/minuto (proveedor: 80 RPM en 2K), una simultánea, timeout
300 s. Cuota Starter: 4.000 imágenes/día. El gasto diario queda en
`quota_use` dentro de `agnes.sqlite`; al agotarse, la generación se detiene con
`cuota diaria de imágenes agotada` y continúa al día siguiente. Un resultado
incierto no se regenera automáticamente.
Los scripts conservan prompts, atribuciones y dimensiones reales; los recursos
sintéticos son ilustraciones con personas ficticias y no documentan un hecho real.

Para «reintenta el video 3»: consulta `status --chat=<chat> --number=3`, busca `ordinal=3`,
y ejecuta `retry --chat=<chat> --request=<requestId>`. El mismo identificador
permite a Render reconocer una entrega completada y reintentar un fallo.

El estado `status` local describe el envío de la solicitud; `render.status` indica
el estado real del video, consultado solo cuando se solicita. `unavailable` no
significa que falló. Un envío `delivery-unknown` requiere revisar si el MP4 llegó al chat: el sistema
conserva el archivo y evita reenviarlo automáticamente. Informa esa situación
si el usuario pide reintentar; no le pidas grabar de nuevo por un fallo del servidor.


Los prompts publicados del partido son la fuente de creación: cuatro Image Prompts,
dos Video Prompts y entre dos y diez Motion Prompts (el modelo decide cuántos).
Cada imagen usa su prompt numerado.
Los clips usan imágenes Agnes ya completadas como referencia; Agnes Video 2.5
Flash, 720P, 9:16, seis segundos, una tarea simultánea y un inicio cada 30
segundos (proveedor Token: 5 RPM). Cuota Starter: 500 segundos/día; el repo
opera con un techo diario de 360 segundos (≈30 bancos de dos clips) para guardar
reserva de reintentos y generaciones bajo demanda por Telegram dentro del mes.
Cada clip anota su duración en `quota_use`; al agotarse el techo, el banco se
detiene con `cuota de vídeo diaria agotada` y continúa al día siguiente.
Se detiene al completar dos clips. Un fallo confirmado permite
probar la siguiente pareja imagen–prompt. Se agotan las imágenes disponibles antes
de reutilizarlas; un 429 conserva la pareja. Solo Flash (`agnes-image-2.5-flash`,
`agnes-video-2.5-flash`) con llave de tipo Token Plan: las llaves Free usan otro
pozo con 1 RPM de vídeo y se saturan con los clips.
Un POST incierto sin identificador libera el montaje parcial inmediatamente. Con
identificador, la recuperación tras errores dura como máximo 60 segundos por banco,
con plazo persistente que otros chats y reinicios no renuevan. No repetir solicitudes
inciertas ni iniciar otra generación mientras pueda seguir ejecutándose la anterior.
Otro banco bloqueado no espera: continúa con material parcial. Los diagnósticos
HTTP quedan acotados y saneados en video_errors dentro de agnes.sqlite.

Selección: el banco solo cubre partidos del ranking guardado
(`public/data/top.json`, top-5 + extras manuales) que tengan guión y prompts de
fotos y vídeo. Sin guión o sin esos prompts, el partido se omite sin gastar cuota.

Los quince minutos cubren imágenes y clips juntos. El inicio persiste tras
reinicios y no se renueva al reintentar: se recuperan recursos existentes. Con el
plazo agotado, se libera el banco parcial y se indican los fallos en el progreso.
Los Motion Prompts se aplican dentro de cada montaje y siguen la transcripción;
son gráficos locales (full-screen u overlays transparentes), no clips
pre-renderizados ni temas obligatorios para todos los audios. El montaje
siempre lleva motion gráfico, aunque falten fotos o clips.


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
