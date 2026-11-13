# Individual Workspace local development

The authenticated Individual Workspace reads server-only environment variables
from this app directory. The repository-root `.env.example` is not loaded
automatically by Next.js when this app runs.

For local development, copy the app-specific template:

```sh
cp apps/web/individual-workspace/.env.example apps/web/individual-workspace/.env.local
```

Set `VOLITION_API_URL` to the API origin. Local HTTP is accepted only for
`localhost` and `127.0.0.1`; remote origins must use HTTPS. In a Vercel
deployment, `WEB_ORIGIN` may be used when the same host routes `/v1/*` to the
API service through the repository's Vercel rewrite configuration. Keep both
variables server-side; never use a `NEXT_PUBLIC_*` prefix for the API origin
or access token.
