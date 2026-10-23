# Version hébergée de JobScout (voir « Hébergement en ligne » dans le README). Construit avec : docker build -t jobscout .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    JOBSCOUT_HOSTED=1 \
    JOBSCOUT_DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/opt/browsers \
    PORT=3000
COPY --from=build --chown=node:node /app /app
# Moteur LinkedIn : Chromium sans fenêtre + bibliothèques système, hors du volume /data (qui masquerait data/browsers).
RUN npx playwright install --with-deps chromium --only-shell && rm -rf /var/lib/apt/lists/*
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/next.mjs", "start", "-H", "0.0.0.0"]
