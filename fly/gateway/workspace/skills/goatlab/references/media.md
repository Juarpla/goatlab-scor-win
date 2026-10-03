# Medios y reintentos

El supervisor busca en Commons, Pexels y Pixabay por nombres y contexto, conserva
metadatos y atribución, y completa faltantes con Agnes. La selección es textual:
una consulta por jugador no verifica que ese jugador aparezca. El planificador
recibe esta distinción y usa imágenes genéricas solo como contexto.

Para «reintenta fotos» o equivalente: `retry --chat=<chat>`. El supervisor recupera
el pack y reutiliza las imágenes de Agnes ya guardadas. Respeta el límite de cinco
por encuentro, compartido entre los diez Shorts. Los controles de RPM, resolución,
timeout y HTTP 429 están implementados en Python; no cambies variables para eludirlos.

Para «reintenta el video 3»: consulta `status --chat=<chat> --number=3`, busca `ordinal=3`,
y ejecuta `retry --chat=<chat> --request=<requestId>`. El mismo identificador
permite a Render reconocer una entrega completada y reintentar un fallo.

El estado `status` local describe el envío de la solicitud; `render.status` indica
el estado real del video, consultado solo cuando se solicita. `unavailable` no
significa que falló. Un envío `delivery-unknown` requiere revisar si el MP4 llegó al chat: el sistema
conserva el archivo y evita reenviarlo automáticamente. Informa esa situación
si el usuario pide reintentar; no le pidas grabar de nuevo por un fallo del servidor.
