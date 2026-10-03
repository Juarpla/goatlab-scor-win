FROM ghcr.io/openclaw/openclaw:2026.9.6

USER root
RUN apt-get update && apt-get install -y --no-install-recommends git nginx python3 ffmpeg && rm -rf /var/lib/apt/lists
USER node

# Config pública (sin secrets: el config referencia ${VAR} que Fly inyecta).
COPY --chown=node:node fly/gateway/openclaw.json /home/node/.openclaw/openclaw.json
COPY --chown=node:node fly/gateway/workspace/ /home/node/.openclaw/workspace/
COPY --chown=node:node fly/gateway/idle-stop.mjs /home/node/idle-stop.mjs
ENV GOATLAB_REPO=/home/node/goatlab GOATLAB_STATE_DIR=/data \
    GOATLAB_SKILL_DIR=/home/node/.openclaw/workspace/skills/goatlab

# Repo goatlab (scripts + datos) para el skill /goatlab. Público, sin secrets.
RUN git clone --depth 1 https://github.com/Juarpla/goatlab-scor-win.git /home/node/goatlab

COPY fly/gateway/nginx.conf /etc/nginx/nginx.conf
COPY fly/gateway/start.sh /home/node/start.sh
USER root
RUN mkdir -p /var/lib/nginx/body /var/lib/nginx/tmp /var/log/nginx /run/nginx \
  && chown -R node:node /var/lib/nginx /var/log/nginx /run/nginx \
  && chmod +x /home/node/start.sh
USER node

ENTRYPOINT ["tini", "-g", "--"]
CMD ["/home/node/start.sh"]
