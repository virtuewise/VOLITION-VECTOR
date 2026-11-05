# Local containers

Run the local development dependencies from this directory with `docker compose up -d`. The Compose file binds PostgreSQL and Redis to loopback only and uses development-only credentials. Never reuse these credentials in shared or production environments. PostgreSQL is authoritative; Redis is disposable infrastructure for cache and queue coordination.
