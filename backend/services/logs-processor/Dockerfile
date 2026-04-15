FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

WORKDIR /shared
COPY backend/shared/package*.json ./
COPY backend/shared/tsconfig.json ./
COPY backend/shared/src ./src
RUN npm install && npm run build

WORKDIR /app
COPY backend/services/logs-processor/package*.json ./
COPY backend/services/logs-processor/tsconfig.json ./
COPY backend/services/logs-processor/src ./src

RUN npm install && npm run build

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["npm", "start"]
