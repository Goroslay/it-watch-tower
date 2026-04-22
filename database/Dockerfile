# ClickHouse DB seed/init Dockerfile
FROM clickhouse/clickhouse-server:latest
COPY ./schemas/001-init-tables.sql /docker-entrypoint-initdb.d/init-db.sql
COPY ./users.d/default-user.xml /etc/clickhouse-server/users.d/default-user.xml
