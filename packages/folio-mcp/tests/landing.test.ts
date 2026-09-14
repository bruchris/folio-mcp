import { describe, expect, it } from "vitest";
import { renderFolioLandingPage } from "../src/landing.js";

describe("Folio landing page", () => {
  it("includes product content, required setup links, version, and no secrets", () => {
    const html = renderFolioLandingPage({ version: "0.1.0" });
    for (const snippet of [
      "Folio",
      "https://www.npmjs.com/package/@bruchris/folio-mcp",
      "https://github.com/bruchris/folio-mcp",
      "#local-setup",
      "#hosted-setup",
      "https://github.com/bruchris/folio-mcp/blob/main/SECURITY.md",
      "/healthz",
      "/mcp",
      "0.1.0",
      "MCP_AUTH_TOKEN",
    ]) {
      expect(html).toContain(snippet);
    }
    expect(html).not.toContain("FOLIO_CLIENT_SECRET");
    expect(html).not.toContain("Bearer ");
    expect(html).not.toMatch(/sk[-_]|api[_-]?key\s*[:=]/i);
  });
});
