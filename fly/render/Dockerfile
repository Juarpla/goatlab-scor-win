FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src/lib/short.js ./src/lib/short.js
COPY public/favicon.svg ./public/favicon.svg
COPY fly/render/server.mjs ./fly/render/server.mjs

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["node", "fly/render/server.mjs"]
