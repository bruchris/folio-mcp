# Owner-hosted Folio MCP

The HTTP entrypoint is an always-on Node server. Use a VPS or Docker host with TLS; it cannot run unchanged as a Vercel function or Cloudflare Worker. Routes are GET / (landing), GET /healthz and Streamable HTTP /mcp. The vendor domain and tenant-aware OAuth are not yet deployed.

## API-key mode

Set MCP_AUTH_TOKEN and FOLIO_API_KEY in your host environment, then run npm run http:folio. The default is loopback port 3000. Third-party Folio OAuth requires a vendor integration partnership. API keys remain supported for owner integrations.

Docker Compose reads an uncommitted root .env for interpolation and binds port 3000 on 127.0.0.1. Never print resolved Compose configuration or container environments. Start with docker compose up --build -d and put a TLS reverse proxy in front of the loopback port. If Cloudflare proxies the origin, enforce equivalent authentication at the origin and do not cache authenticated responses.

Requests with an Origin header are denied unless that exact origin is in MCP_ALLOWED_ORIGINS. Native clients without Origin still require the bearer token. Wildcards are unsupported. Remote MCP disables filesystem uploads and download destination paths; local stdio retains explicit filesystem operations. Receipt downloads can return bytes to the model.

## Owner OAuth mode

Use your registered vendor app and npm run auth:folio; the default redirect is http://localhost:3334/callback. Client secrets and refreshed tokens stay in the owner's local .env; none are distributed in npm.

For Docker, set FOLIO_OAUTH_ENV_FILE to an existing absolute private file containing only Folio client ID/secret and current refresh token, writable by UID 1000. Then use:

```sh
docker compose -f docker-compose.yml -f docker-compose.oauth.yml up -d
```

Do not mount a shared credential file. Startup refresh persists rotated tokens into the mounted file; do not override it with a stale environment refresh token. Long-running production OAuth needs coordinated refresh/reconnection. Restarting is an owner-testing limitation, not unattended production support.

## Operations

Verify health 200, missing bearer 401, denied Origin 403 and valid MCP initialization over HTTPS. Use synthetic credentials in automated checks; live bookkeeping writes need separate approval.

Images run as UID 1000 with production dependencies. Rotate exposed credentials, redact authorization headers from proxy logs and retain the previous image for rollback. Build release images only from this repository and its single-vendor lockfile. Never copy a private application lockfile into it.
