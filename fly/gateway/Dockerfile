FROM ghcr.io/openclaw/openclaw:2026.9.6

USER root
RUN apt-get update && apt-get install -y --no-install-recommends git nginx python3 ffmpeg chromium && rm -rf /var/lib/apt/lists
USER node

# Config pública (sin secrets: el config referencia ${VAR} que Fly inyecta).
COPY --chown=node:node fly/gateway/openclaw.json /home/node/.openclaw/openclaw.json
COPY --chown=node:node fly/gateway/workspace/ /home/node/.openclaw/workspace/
COPY --chown=node:node fly/gateway/idle-stop.mjs fly/gateway/idle-safety.mjs fly/gateway/creative-director.mjs /home/node/
COPY --chown=node:node src/lib/visual-style.js /home/node/visual-style.js
# Keep the director relative import stable outside the repository checkout.
COPY --chown=node:node src/lib/media-policy.js src/lib/montage-experiment.json /home/node/workspace/skills/goatlab/lib/
# The skill imports this module locally as well as from the cloned repository.
COPY --chown=node:node src/lib/visual-style.js /home/node/.openclaw/workspace/skills/goatlab/lib/visual-style.js
COPY --chown=node:node fly/gateway/ui-access.mjs fly/gateway/runtime.mjs /home/node/
COPY --chown=node:node fly/gateway/conversation-retention.mjs fly/gateway/retention-supervisor.mjs /home/node/
ARG GOATLAB_REVISION=unknown
ENV GOATLAB_REVISION=${GOATLAB_REVISION} GOATLAB_REPO=/home/node/goatlab GOATLAB_STATE_DIR=/data \
    GOATLAB_SKILL_DIR=/home/node/.openclaw/workspace/skills/goatlab GOATLAB_DIRECTOR_SCRIPT=/home/node/creative-director.mjs

# Repo goatlab (scripts + datos) para el skill /goatlab. Público, sin secrets.
RUN git clone --depth 1 https://github.com/Juarpla/goatlab-scor-win.git /home/node/goatlab
COPY --chown=node:node scripts/report-video-styles.mjs /home/node/goatlab/scripts/
COPY --chown=node:node src/lib/visual-style.js /home/node/goatlab/src/lib/
COPY --chown=node:node VIDEO-CINEMATIC-REPORT.md /home/node/goatlab/

COPY fly/gateway/nginx.conf /etc/nginx/nginx.conf
COPY fly/gateway/start.sh /home/node/start.sh
USER root
RUN mkdir -p /var/lib/nginx/body /var/lib/nginx/tmp /var/log/nginx /run/nginx \
  && chown -R node:node /var/lib/nginx /var/log/nginx /run/nginx \
  && chmod +x /home/node/start.sh
USER node

ENTRYPOINT ["tini", "-g", "--"]
CMD ["/home/node/start.sh"]
