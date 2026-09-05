# Folio MCP

Open-source TypeScript client, Model Context Protocol server and CLI for Folio. Unofficial; not affiliated with Folio AS.

Accounts, transactions, events, receipt bytes, categories and payment drafts.

## Package and release status

[@bruchris/folio-mcp](packages/folio-mcp) version 0.1.0 is prepared but not yet published to npm. Requires Node 22.14+; Node 24 is recommended. The following installation command applies after the first npm release.

```sh
npx -y @bruchris/folio-mcp
```

Set FOLIO_API_KEY in your client environment. Import the typed client from @bruchris/folio-mcp/client without launching MCP or loading environment files. Third-party Folio OAuth requires a vendor integration partnership. API keys remain supported for owner integrations.

## Approval

MCP writes return a preview until confirm=true; the client must obtain approval before confirming. CLI writes require --confirm. Folio API payments remain drafts for approval in Folio. The model reads receipts; the adapter does not parse merchant layouts or guess VAT.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:tooling
npm run check:public
npm run check:secrets
```

This repository contains only the Folio package in packages/folio-mcp and its supporting tooling. Its root workspace is private to prevent accidental publication of the tooling. The Freddy application source remains private and is excluded.

[Package documentation](packages/folio-mcp/README.md) · [Public docs](https://bruchris.github.io/folio-mcp/) · [Hosting](docs/hosting.md) · [Contributing](CONTRIBUTING.md) · [Releases](docs/releases.md) · [Security](SECURITY.md)

MIT license.
