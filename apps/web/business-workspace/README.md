# Business Workspace

The Business Workspace uses WorkOS AuthKit on the server and resolves active
internal organization memberships through `GET /v1/me/organizations`. The
account access token is used only in server-side API requests and is never
serialized into browser code or storage.

## Local development

Copy the app-specific environment template:

```sh
cp apps/web/business-workspace/.env.example apps/web/business-workspace/.env.local
```

Set `VOLITION_API_URL` to the API origin. Local HTTP is accepted only for
`localhost` and `127.0.0.1`; remote origins must use HTTPS. In a Vercel
deployment, `WEB_ORIGIN` may be used when the host routes `/v1/*` to the API
service. Keep all API origins and AuthKit secrets server-side.

## Organization access

The selector displays only active internal organizations returned for the
verified account. The organization UUID in a route is a navigation key only:
the server re-fetches the account's organization list and rejects a route that
does not belong to that account. The selected organization's private profile
is loaded through `GET /v1/organizations/:organizationId/profile`.

The profile API is a separate integration dependency (PR #62); until it is
available, the workspace shows an explicit unavailable state. This UI is
read-only. Team administration, invitations, project management, service
listings, opportunity management, conversations and financial workflows are
not exposed until their tenant-scoped APIs and authorization gates are ready.

## Security boundary

No WorkOS organization claim, client-provided tenant UUID or organization slug
is treated as proof of membership. Every API operation must independently
resolve the verified account, active membership, resource ownership and
action-specific permission inside its tenant transaction. The workspace does
not perform tenant mutations.
