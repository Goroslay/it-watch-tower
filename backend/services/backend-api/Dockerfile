
FROM node:20-alpine

WORKDIR /shared
RUN apk add --no-cache python3 make g++
COPY ../../shared/package*.json ./
COPY ../../shared/tsconfig.json ./
COPY ../../shared/src ./src
RUN npm install && npm run build

WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm install && npm run build

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["npm", "start"]
