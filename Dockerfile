FROM node:22-alpine AS web-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts ./
COPY web ./web
COPY src/contracts ./src/contracts
COPY public ./public
RUN npm run build:web

FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --chown=node:node package.json package-lock.json README.md ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=web-build /app/public ./public
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
