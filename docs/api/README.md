# API documentation

Document versioned REST/event contracts, authentication and authorization, pagination, error envelopes, idempotency, rate limits, webhooks, compatibility and deprecation policy here. OpenAPI specifications are maintained alongside the API once endpoints are implemented.

## Public discovery endpoints

The Marketplace web application reads the public, read-only projections through:

- `GET /v1/opportunities?q=&type=&limit=&offset=`
- `GET /v1/services?q=&category=&deliveryMode=&limit=&offset=`

Both endpoints return arrays of published public records. Their database views use invoker security and expose only the public listing projection; draft and organization-only records must never be rendered in the public marketplace.

The Marketplace server component uses the server-only `VOLITION_API_URL` environment variable as the API origin (for example, `http://localhost:4000` in local development). Set it to the deployed API origin in the appropriate Vercel environment. Do not expose database credentials or internal service URLs through `NEXT_PUBLIC_*` variables.

A missing or unavailable API is presented as an explicit connection/unavailable state. The web application must not substitute invented sample listings for live records.
