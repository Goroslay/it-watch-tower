# Database Migrations

This directory contains database schema migrations and initialization scripts.

## Migrations

### 001-init-tables.sql
Initial schema setup for:
- `hosts` - Infrastructure hosts
- `services` - Services running on hosts  
- `metrics` - Time-series metrics (ClickHouse)
- `logs` - Application logs
- `alerts` - Alert instances
- `alert_rules` - Alert rule definitions

## Running Migrations

Migrations are automatically applied when ClickHouse container starts (via `init-db.sql`).

To manually run:

```bash
clickhouse-client --host localhost --database itwatchtower < 001-init-tables.sql
```

## Schema Notes

- **Metrics & Logs**: Uses MergeTree with TTL for auto-expiration
- **Hosts & Services**: Uses ReplacingMergeTree for versioning
- **Indexes**: Optimized for common query patterns
- **Partitioning**: By month (YYYY-MM) for better performance
- **Compression**: Automatic by ClickHouse
