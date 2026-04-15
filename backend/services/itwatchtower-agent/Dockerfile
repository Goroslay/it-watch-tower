FROM golang:1.20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev


# Only copy go.mod and go.sum if they exist
COPY go.mod go.sum ./
RUN if [ -f go.mod ]; then go mod download; fi

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o agent .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates curl

WORKDIR /root/

COPY --from=builder /app/agent .

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:9090/health || exit 1

CMD ["./agent"]
