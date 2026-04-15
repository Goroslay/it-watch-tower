# Telemetry Processing Skill

Processes telemetry data from monitoring agents.

## Metrics Pipeline

Agent → Broker → Metrics Processor → Storage

Processing steps:

validate metrics

enrich tags

aggregate metrics

write to database

## Logs Pipeline

Agent → Broker → Logs Processor → Storage

Processing steps:

parse logs

normalize structure

index logs