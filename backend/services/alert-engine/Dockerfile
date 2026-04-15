
FROM node:20-alpine

WORKDIR /shared
RUN apk add --no-cache python3 make g++
COPY backend/shared/package*.json ./
COPY backend/shared/tsconfig.json ./
COPY backend/shared/src ./src
RUN npm install && npm run build

WORKDIR /app
COPY backend/services/alert-engine/package*.json ./
COPY backend/services/alert-engine/tsconfig.json ./
COPY backend/services/alert-engine/src ./src
RUN npm install && npm run build

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["npm", "start"]
