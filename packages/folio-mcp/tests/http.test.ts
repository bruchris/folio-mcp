import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderFolioLandingPage } from "../src/landing.js";
import { authorizationMatches, listenMcpHttp, redactAuthorization } from "../src/mcp-http.js";

const TOKEN = "s3cret";
const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "0.0.0" },
  },
});

function listenTest(options: {
  name?: string;
  allowedOrigins?: string[];
  landingHtml?: string;
  log?: (line: string) => void;
  createServer?: () => McpServer | Promise<McpServer>;
} = {}) {
  return listenMcpHttp({
    name: "test",
    token: TOKEN,
    port: 0,
    createServer: () => new McpServer({ name: "test", version: "0.0.0" }),
    ...options,
  });
}

function localUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

describe("MCP HTTP bearer", () => {
  it("rejects a malformed request target without crashing the HTTP server", async () => {
    const { close, port } = await listenTest();
    try {
      await expect(fetch(localUrl(port, "//["), { signal: AbortSignal.timeout(500) })).resolves.toMatchObject({
        status: 400,
      });
      expect((await fetch(localUrl(port, "/healthz"))).status).toBe(200);
    } finally {
      close();
    }
  });

  it.each([undefined, "https://trusted.example"])(
    "serves authenticated initialize for an allowed client origin %s",
    async (origin) => {
      const { close, port } = await listenTest({ allowedOrigins: ["https://trusted.example"] });
      try {
        const headers: Record<string, string> = {
          authorization: "Bearer wrong",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        };
        if (origin) headers.origin = origin;
        const denied = await fetch(localUrl(port, "/mcp"), { method: "POST", headers, body: "{}" });
        expect(denied.status).toBe(401);
        headers.authorization = `Bearer ${TOKEN}`;
        const response = await fetch(localUrl(port, "/mcp"), {
          method: "POST",
          headers,
          body: INITIALIZE_BODY,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe(origin ?? null);
        const body = await response.text();
        expect(body).toContain("protocolVersion");
        expect(body).not.toContain(TOKEN);
      } finally {
        close();
      }
    },
  );

  it("keeps internal failures out of HTTP responses", async () => {
    const { close, port } = await listenTest({
      createServer: () => {
        throw new Error("synthetic-private-credential");
      },
    });
    try {
      const response = await fetch(localUrl(port, "/mcp"), {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    } finally {
      close();
    }
  });

  it("rejects untrusted browser origins before authentication or MCP work", async () => {
    let calls = 0;
    const { close, port } = await listenTest({
      createServer: () => {
        calls += 1;
        return new McpServer({ name: "t", version: "0.0.0" });
      },
    });
    try {
      for (const method of ["OPTIONS", "POST", "GET"]) {
        const response = await fetch(localUrl(port, "/mcp"), {
          method,
          headers: { origin: "https://untrusted.example", authorization: `Bearer ${TOKEN}` },
        });
        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
      expect(calls).toBe(0);
    } finally {
      close();
    }
  });

  it("accepts a matching Bearer token", () => {
    expect(authorizationMatches("Bearer secret", "secret")).toBe(true);
    expect(authorizationMatches("Bearer other", "secret")).toBe(false);
    expect(authorizationMatches(undefined, "secret")).toBe(false);
  });

  it("redacts Authorization values and never logs the bearer token", async () => {
    expect(redactAuthorization("Authorization: Bearer s3cret")).toBe("Authorization: Bearer [redacted]");
    const lines: string[] = [];
    const { close, port } = await listenTest({
      log: (line) => lines.push(line),
      createServer: () => new McpServer({ name: "t", version: "0.0.0" }),
    });
    try {
      await fetch(localUrl(port, "/mcp"), {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: "{}",
      });
      const denied = await fetch(localUrl(port, "/mcp"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(denied.status).toBe(401);
      expect(lines.join("\n")).toMatch(/POST \/mcp \d+/);
      expect(lines.join("\n")).not.toContain(TOKEN);
      expect(lines.join("\n")).not.toMatch(/Bearer (?!\[redacted\])/);
    } finally {
      close();
    }
  });

  it("serves the Folio landing page with required public links", async () => {
    const { close, port } = await listenTest({
      name: "folio-mcp",
      landingHtml: renderFolioLandingPage({ version: "0.1.0" }),
      createServer: () => new McpServer({ name: "folio-mcp", version: "0.1.0" }),
    });
    try {
      const landing = await fetch(localUrl(port, "/"));
      expect(landing.status).toBe(200);
      const html = await landing.text();
      expect(html).toContain("https://www.npmjs.com/package/@bruchris/folio-mcp");
      expect(html).toContain("#hosted-setup");
      expect(html).toContain("/healthz");
    } finally {
      close();
    }
  });

  it("serves a public HTML landing page at / without changing /healthz or /mcp", async () => {
    const { close, port } = await listenTest({
      landingHtml: "<!doctype html><title>Folio MCP</title><p>landing</p>",
      createServer: () => new McpServer({ name: "t", version: "0.0.0" }),
    });
    try {
      const landing = await fetch(localUrl(port, "/"));
      expect(landing.status).toBe(200);
      expect(landing.headers.get("content-type")).toMatch(/text\/html/);
      expect(await landing.text()).toContain("Folio MCP");
      const health = await fetch(localUrl(port, "/healthz"));
      expect(health.status).toBe(200);
      expect(await health.text()).toBe("ok");
      const denied = await fetch(localUrl(port, "/mcp"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(denied.status).toBe(401);
      expect((await fetch(localUrl(port, "/nope"))).status).toBe(404);
    } finally {
      close();
    }
  });

  it("serves /healthz and rejects /mcp without a token", async () => {
    const mcp = new McpServer({ name: "t", version: "0.0.0" });
    const { close, port } = await listenTest({ createServer: () => mcp });
    try {
      const health = await fetch(localUrl(port, "/healthz"));
      expect(health.status).toBe(200);
      expect(await health.text()).toBe("ok");
      const denied = await fetch(localUrl(port, "/mcp"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(denied.status).toBe(401);
    } finally {
      close();
    }
  });
});
