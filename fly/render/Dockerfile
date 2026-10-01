# Etapa 1: whisper.cpp (último respaldo de los tiempos por palabra) y el
# modelo multilingüe base. Nunca un modelo .en: traduciría la voz en español.
FROM node:22-bookworm-slim AS whisper
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp /src/whisper \
  && cmake -S /src/whisper -B /src/whisper/build \
    -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF \
  && cmake --build /src/whisper/build --config Release -j --target whisper-cli \
  && mkdir -p /opt/whisper \
  && cp /src/whisper/build/bin/whisper-cli /opt/whisper/whisper-cli \
  && curl -fsSL -o /opt/whisper/ggml-base.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Etapa 2: worker. Node 22 lanza HyperFrames; chrome-headless-shell captura
# cada frame y FFmpeg comprime. Un solo Chrome: el que descarga HyperFrames.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-dejavu-core libgomp1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 \
    libxrender1 libxshmfence1 libxss1 libxtst6 fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /opt/whisper /opt/whisper

WORKDIR /app
COPY fly/render/package.json fly/render/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npx --no-install hyperframes browser ensure \
  && CHROME="$(npx --no-install hyperframes browser path | tail -1)" \
  && ! ldd "$CHROME" | grep 'not found' \
  && /opt/whisper/whisper-cli --help > /dev/null
COPY src/lib/hyperframe.js src/lib/timing.js src/lib/media.js src/lib/teams.js src/lib/compliance.js src/lib/youtube.js src/lib/render-queue.js ./src/lib/
COPY fly/render/server.mjs fly/render/short-job.mjs fly/render/transcribe.mjs ./fly/render/
COPY fly/render/assets/bed.mp3 fly/render/assets/bed.txt ./fly/render/assets/

ENV PORT=3000 NODE_ENV=production \
    WHISPER_BIN=/opt/whisper/whisper-cli \
    WHISPER_MODEL=/opt/whisper/ggml-base.bin
EXPOSE 3000
CMD ["node", "fly/render/server.mjs"]
