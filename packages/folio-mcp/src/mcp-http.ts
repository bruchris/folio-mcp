import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

type ListenMcpHttpOptions = {
  name: string;
  token: string;
  port: number;
  host?: string;
  allowedOrigins?: string[];
  landingHtml?: string;
  log?: (line: string) => void;
  createServer: () => McpServer | Promise<McpServer>;
};

const JSON_RPC_INTERNAL_ERROR = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32603, message: "Internal server error" },
  id: null,
});

export function redactAuthorization(line: string): string {
  return line.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function authorizationMatches(header: string | undefined, expected: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix) || !expected) return false;
  const got = Buffer.from(header.slice(prefix.length));
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  };
}

function parseRequestUrl(req: IncomingMessage): URL | undefined {
  try {
    return new URL(req.url ?? "/", "http://127.0.0.1");
  } catch {
    return undefined;
  }
}

function logToStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function listenMcpHttp(options: ListenMcpHttpOptions): Promise<{ close: () => void; port: number }> {
  const sink = options.log ?? logToStderr;

  function writeLog(line: string): void {
    sink(redactAuthorization(line));
  }

  function logRequest(req: IncomingMessage, path: string, status: number): void {
    writeLog(`[${options.name}] ${req.method ?? "GET"} ${path} ${status}`);
  }

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = parseRequestUrl(req);
    if (!url) {
      res.writeHead(400).end("bad request target");
      return;
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      logRequest(req, "/healthz", 200);
      return;
    }
    if (req.method === "GET" && url.pathname === "/" && options.landingHtml) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(options.landingHtml);
      logRequest(req, "/", 200);
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      logRequest(req, url.pathname, 404);
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !options.allowedOrigins?.includes(origin)) {
      res.writeHead(403).end("forbidden origin");
      logRequest(req, "/mcp", 403);
      return;
    }
    const cors = corsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) res.setHeader(key, value);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      logRequest(req, "/mcp", 204);
      return;
    }
    if (!authorizationMatches(req.headers.authorization, options.token)) {
      res.writeHead(401, { "www-authenticate": "Bearer", ...cors }).end("unauthorized");
      logRequest(req, "/mcp", 401);
      return;
    }
    try {
      const mcp = await options.createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
      logRequest(req, "/mcp", res.statusCode || 200);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON_RPC_INTERNAL_ERROR);
      }
      logRequest(req, "/mcp", 500);
    }
  });
  return new Promise((resolve, reject) => {
    http.on("error", reject);
    const host = options.host ?? "127.0.0.1";
    http.listen(options.port, host, () => {
      const addr = http.address();
      const port = typeof addr === "object" && addr ? addr.port : options.port;
      writeLog(`[${options.name}] HTTP MCP on ${host}:${port} (GET /, GET /healthz, POST/GET /mcp)`);
      resolve({
        port,
        close: () => http.close(),
      });
    });
  });
}

export function requireMcpAuthToken(): string {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "MCP_AUTH_TOKEN must be set to serve over HTTP. Never expose /mcp without a bearer token.",
    );
  }
  return token;
}
