FROM node:20-alpine

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++


# Build shared package first
WORKDIR /shared
COPY ../../shared/package*.json ./
COPY ../../shared/tsconfig.json ./
COPY ../../shared/src ./src
RUN npm install && npm run build

# Back to service context
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies and build
RUN npm install && npm run build

# Expose port (if needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["npm", "start"]
