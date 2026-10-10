# QA del montaje producido

Versión 5 valida el plan contra cinema-catalog.json antes del bundle. Comprueba timeline, fragmentos de voz, unidades, procedencia, recursos y máximo dos movimientos distintivos ejecutados. Remotion comprueba el ajuste del contenido cinematográfico dentro de la zona segura usando la fuente local cargada. FFprobe comprueba H.264/AAC, 1080×1920, 30 fps, duración menor de 50 segundos y peso menor de 45 MB.

Render extrae seis fotogramas de apertura, desarrollo y resolución. La cadena GOATLAB_VISION_MODELS hace hasta tres llamadas iniciales de 60 segundos. Cada petición utiliza un contexto nuevo. La respuesta clasifica ok/minor/severe y admite únicamente fontScale (0.8–1) y captionBottom (480–600) para corregir subtítulos. Se permite un render adicional y una llamada de comprobación. Si el defecto no admite esos controles o persiste grave, se retiene el video y continúa la cola. Una caída inicial de visión o defectos menores permiten entregar tras los gates deterministas. Si falla la comprobación de un defecto grave conocido, se retiene.

productionReport conserva modelos, recursos, fallback, etapas, QA y presencia de gráficos por duración. Los reportes sobreviven a la purga de los archivos temporales y están limitados a 1000 registros. Una muestra de seis fotogramas no sustituye revisar los videos completos del piloto.

Los comandos check-motion-frames y motion-contact-sheet quedan como herramientas del legado. La aprobación de un prompt antiguo no constituye QA del video nuevo.

La revisión recibe fotogramas aislados a la mitad de resolución, sus tiempos, transcripción y plan. Evalúa evidencia visible: no infiere retraso de audio desde imágenes estáticas. Los titulares y los fragmentos de subtítulos cumplen funciones distintas. La clasificación severe exige un defecto de lectura, recorte, solapamiento bloqueante o incoherencia factual observable; las preferencias estéticas son minor.
