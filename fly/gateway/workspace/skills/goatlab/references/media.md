# Medios y reintentos

El supervisor crea imágenes con Agnes AI y reutiliza solo imágenes Agnes guardadas.
Los bancos antiguos se filtran; las fotos externas no se descargan ni se reutilizan.
Los recursos propios de marca, gráficos y música existentes se conservan.

Intenta reunir el banco compartido de diez imágenes y hasta tres clips durante un máximo de quince
minutos, incluido un reinicio. Publica el banco parcial incluso con cero imágenes;
el montaje puede continuar con motion graphics y animaciones. Cada video usa un
subconjunto del banco y continúa con el siguiente audio sin exigir otros nueve.

Para «reintenta fotos»: `retry --chat=<chat>`. Se reutiliza lo conseguido; los trabajos
ya preparados mantienen su copia del banco y siguen produciéndose. Agnes permite
hasta diez imágenes compartidas por encuentro: 2K 9:16, cuatro llamadas/minuto,
una simultánea, timeout 300 s. Un resultado incierto no se regenera automáticamente.
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


Los prompts publicados del partido son la fuente de creación: diez Image Prompts,
cinco Video Prompts y cinco Motion Prompts. Cada imagen usa su prompt numerado.
Los clips usan imágenes Agnes ya completadas como referencia; Agnes Video 2.5
Flash, 720P, 9:16, seis segundos, una tarea simultánea y un inicio por minuto.
Se detiene al completar tres clips o tras cinco tareas. Un fallo confirmado permite
probar el siguiente prompt; un POST incierto se conserva y no se repite.

Los quince minutos cubren imágenes y clips juntos. El inicio persiste tras
reinicios y no se renueva al reintentar: se recuperan recursos existentes. Con el
plazo agotado, se libera el banco parcial y se indican los fallos en el progreso.
Los Motion Prompts se aplican dentro de cada montaje y siguen la transcripción;
no son cinco clips pre-renderizados ni temas obligatorios para todos los audios.
