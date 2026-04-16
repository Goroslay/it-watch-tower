
FROM node:20-alpine

WORKDIR /shared
RUN apk add --no-cache python3 make g++
COPY backend/shared/package*.json ./
COPY backend/shared/tsconfig.json ./
COPY backend/shared/src ./src
RUN npm install && npm run build


WORKDIR /app
COPY backend/services/dashboard/package*.json ./
COPY backend/services/dashboard/tsconfig.json ./
COPY backend/services/dashboard/index.html ./
COPY backend/services/dashboard/src ./src
RUN npm install && npm run build

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["npm", "start"]
