# ─────────────────────────────────────────────────────────────────────────────
# HISTORY GAME ARENA — production image
#
# Single Node.js process: Express API + WebSocket + the built React client.
# SQLite lives in /data, so mount a volume there or the data dies with the
# container.
#
#   docker build -t history-arena .
#   docker run -p 8787:8787 -v arena-data:/data history-arena
# ─────────────────────────────────────────────────────────────────────────────

# ── stage 1: dependencies + client build ────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 compiles a native addon, which needs a toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY public ./public

RUN npm run build

# drop dev-only packages but keep `tsx`: the server imports shared/*.ts directly
RUN npm prune --omit=dev && npm cache clean --force

# ── stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    SEED_ON_BOOT=off

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./package.json

# run unprivileged, but own the data directory the DB is written to
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "server/index.js"]
