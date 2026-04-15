# Project Conventions

## Code Style

Backend:
TypeScript strict mode

Agent:
Go modules

## Naming

Services:
kebab-case

Example:
metrics-processor
logs-processor

Database tables:
snake_case

## API Conventions

REST API

Endpoints:

/hosts
/services
/metrics
/logs
/alerts
/actions

Authentication:
JWT tokens

## Observability

All services must expose:

/health
/metrics

## Logging

Structured JSON logs.

Fields:

timestamp
service
level
message
context

## Security

TLS for all communication.

Remote commands must use whitelist validation.