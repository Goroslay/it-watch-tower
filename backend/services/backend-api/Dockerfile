FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

WORKDIR /shared
COPY backend/shared/package*.json ./
COPY backend/shared/tsconfig.json ./
COPY backend/shared/src ./src
RUN npm install && npm run build

WORKDIR /app
COPY backend/services/backend-api/package*.json ./
COPY backend/services/backend-api/tsconfig.json ./
COPY backend/services/backend-api/src ./src
RUN npm install && npm run build

RUN mkdir -p /data

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:3003/health || exit 1

CMD ["npm", "start"]
