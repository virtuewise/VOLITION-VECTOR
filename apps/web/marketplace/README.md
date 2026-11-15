# Marketplace local development

The Marketplace Next.js app reads server-side environment files from this app
directory. The repository-root `.env.example` is for monorepo services and is
not automatically loaded by Next.js when this app runs.

For local development, copy the app-specific template:

```sh
cp apps/web/marketplace/.env.example apps/web/marketplace/.env.local
```

Set `VOLITION_API_URL` to the API origin. Local HTTP is accepted only for
`localhost` and `127.0.0.1`; remote origins must use HTTPS. Keep this variable
server-side (do not rename it to `NEXT_PUBLIC_VOLITION_API_URL`).
