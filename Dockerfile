# GRIT Interview Scheduling. (c) 2026 Nishant. All rights reserved.

FROM node:22-alpine AS client
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-deps
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    PUBLIC_DIR=/app/public
WORKDIR /app/server
COPY --from=server-deps /build/server/node_modules ./node_modules
COPY server/ ./
COPY --from=client /build/client/dist /app/public
COPY LICENSE NOTICE /app/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["node", "src/index.js"]
