FROM ghcr.io/openclaw/openclaw:2026.9.6

USER root
RUN apt-get update && apt-get install -y --no-install-recommends git nginx && rm -rf /var/lib/apt/lists
USER node

# Config pública (sin secrets: el config referencia ${VAR} que Fly inyecta).
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/
COPY --chown=node:node idle-stop.mjs /home/node/idle-stop.mjs

# Repo goatlab (scripts + datos) para el skill /goatlab. Público, sin secrets.
RUN git clone --depth 1 https://github.com/Juarpla/goatlab-scor-win.git /home/node/goatlab

COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /home/node/start.sh
USER root
RUN mkdir -p /var/lib/nginx/body /var/lib/nginx/tmp /var/log/nginx /run/nginx \
  && chown -R node:node /var/lib/nginx /var/log/nginx /run/nginx \
  && chmod +x /home/node/start.sh
USER node

ENTRYPOINT ["tini", "--"]
CMD ["/home/node/start.sh"]
