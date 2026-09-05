# Folio releases

This repository publishes only @bruchris/folio-mcp. Never merge private workspace history or another vendor package into it. Reviewed source snapshots have independent public history; reconcile accepted public changes with the development workspace before later exports.

## Verification

Run npm ci, npm test, npm run typecheck, npm run build, npm run test:tooling, npm run check:public and npm run check:secrets. CI runs mandatory redacted Gitleaks scans of source and history. Smoke tests install the real tarball and verify the client, CLI and stdio MCP without vendor networking.

The public boundary gate checks current files, index and all reachable history, including tags. Root workspaces and the lockfile must contain only packages/folio-mcp. Path allowlists and secret scans complement source review; they do not authorize private data under an allowed filename.

## Publishing

Maintain the package CHANGELOG.md with its release version. Tags are folio-mcp-vVERSION. The manual release.yml workflow has a fixed Folio target and requires PUBLIC_RELEASE_ENABLED=true, the npm environment, and trusted publishing configured for bruchris/folio-mcp, release.yml and that environment. Publishing is currently disabled.

The workflow uses Node 24/npm 11.11.1, verifies source/version/notes, rejects existing release tags, runs tests/scans/audit, then publishes with provenance and creates the GitHub release. Initial package registration, publishing rights and 2FA may require the owner. New trusted publishers must explicitly allow direct npm publish; see [npm documentation](https://docs.npmjs.com/trusted-publishers/).

After publication, verify registry version, integrity, provenance, public links and a clean npx MCP handshake. If npm succeeds but the GitHub release fails, verify the exact published source and complete only the missing tag/release; never rerun publication of an immutable version. Correct ordinary bugs with a new version.
