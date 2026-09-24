FROM ghcr.io/openclaw/openclaw:2026.9.6

USER root
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists
USER node

# Config pública (sin secrets: el config referencia ${VAR} que Fly inyecta).
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Repo goatlab (scripts + datos) para el skill /goatlab. Público, sin secrets.
RUN git clone --depth 1 https://github.com/Juarpla/goatlab-scor-win.git /home/node/goatlab
