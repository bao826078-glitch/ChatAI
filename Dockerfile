
# syntax=docker/dockerfile:1

# Build frontend and bundle Express backend
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build \
    && ./node_modules/.bin/esbuild server.ts \
       --bundle \
       --platform=node \
       --format=esm \
       --target=node22 \
       --packages=external \
       --outfile=server.js

# Install production dependencies only
FROM node:22-alpine AS production-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

# Final runtime image
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8088 \
    DB_PATH=/data/chatai.db

WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

RUN mkdir -p /data \
    && chown node:node /data

USER node

EXPOSE 8088
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s \
    --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8088/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
