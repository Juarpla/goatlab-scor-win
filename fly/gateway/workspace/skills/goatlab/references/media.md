# Medios y reintentos

El supervisor busca en Commons, Pexels, Pixabay y Openverse, que indexa muchas
fuentes. También admite recursos `licensed` con página, autor y enlace verificable
de licencia comercial que permita adaptación. Los recortes no cambian estos permisos.
La metadata debe relacionar el recurso con los equipos, jugadores o lugar del encuentro;
la consulta por sí sola no establece identidad. Descarga y comprueba cada imagen antes
de contarla. Un candidato rechazado no invalida el resto del banco.

Primero intenta reunir quince recursos: búsqueda hasta 90 segundos/seis consultas
por fuente, luego Agnes para completar faltantes. El intento completo dura como
máximo quince minutos, incluido un reinicio; al terminar publica el banco parcial
incluso con cero fotos. Después comienzan los videos, con escenas de fotos y gráficos,
o solamente motion graphics cuando no hay imágenes. Cada video usa un subconjunto
del banco y continúa con el siguiente audio sin exigir otros nueve.

Para «reintenta fotos»: `retry --chat=<chat>`. Se reutiliza lo conseguido; los trabajos
ya preparados mantienen su copia del banco y siguen produciéndose. Agnes permite
hasta quince imágenes compartidas por encuentro: 2K 9:16, cuatro llamadas/minuto,
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
