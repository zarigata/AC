import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getProviderReadinessSummary,
  listProviderConnections,
  listProviders,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

import { AgentRegistry } from "./registry.js";

const VERSION = "0.2.0";
const startTime = Date.now();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const databasePath = process.env.ZSIISTANT_DB_PATH ?? new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
const webRoot = fileURLToPath(new URL("../../web/", import.meta.url));

const registry = new AgentRegistry({ databasePath });
registry.seed();

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const readRequestBody = async (request) => {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }

  return raw ? JSON.parse(raw) : {};
};

const contentTypeFor = (path) => {
  const extension = extname(path);
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
};

const providerSummary = () => {
  const providers = listProviders();
  return {
    providers,
    summary: {
      total: providers.length,
      local: providers.filter((provider) => provider.category === "local").length,
      cloud: providers.filter((provider) => provider.category === "cloud").length,
      selfHosted: providers.filter((provider) => provider.category === "self-hosted").length,
      routers: providers.filter((provider) => provider.category === "router").length
    },
    readiness: getProviderReadinessSummary(process.env)
  };
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "zsiistant-api",
        version: VERSION,
        uptime: Math.floor((Date.now() - startTime) / 1000)
      });
    }

    /* ─── Single Agent ─── */

    const agentMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)$/);

    if (agentMatch) {
      const agentId = agentMatch[1];

      if (request.method === "GET") {
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { agent });
      }

      if (request.method === "PATCH") {
        const body = await readRequestBody(request);
        const agent = registry.updateAgent(agentId, body);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { agent });
      }

      if (request.method === "DELETE") {
        const deleted = registry.deleteAgent(agentId);
        if (!deleted) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { deleted: true });
      }
    }

    /* ─── Sessions ─── */

    const sessionsMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions$/);

    if (sessionsMatch && request.method === "GET") {
      const sessions = registry.listSessions(sessionsMatch[1]);
      return sendJson(response, 200, { sessions });
    }

    if (sessionsMatch && request.method === "POST") {
      const body = await readRequestBody(request);
      const session = registry.createSession(sessionsMatch[1], body);
      if (!session) return sendJson(response, 404, { error: "Agent not found" });
      return sendJson(response, 201, { session });
    }

    const sessionMsgMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions\/([\w-]+)\/messages$/);

    if (sessionMsgMatch && request.method === "GET") {
      const messages = registry.listMessages(sessionMsgMatch[1], sessionMsgMatch[2]);
      return sendJson(response, 200, { messages });
    }

    if (sessionMsgMatch && request.method === "POST") {
      const body = await readRequestBody(request);
      const message = registry.createMessage(sessionMsgMatch[1], sessionMsgMatch[2], body);
      if (!message) return sendJson(response, 404, { error: "Not found" });
      return sendJson(response, 201, { message });
    }

    /* ─── Links ─── */

    if (request.method === "DELETE" && url.pathname === "/api/links") {
      const body = await readRequestBody(request);
      const deleted = registry.deleteLink(body);
      if (!deleted) return sendJson(response, 404, { error: "Link not found" });
      return sendJson(response, 200, { deleted: true });
    }

    /* ─── Settings ─── */

    if (request.method === "GET" && url.pathname === "/api/settings") {
      return sendJson(response, 200, {
        version: VERSION,
        defaultModel: "qwen3",
        maxAgents: 100,
        supportedIsolationModes: ["isolated", "selective", "mesh"],
        supportedLinkModes: ["observe", "message", "delegate"],
        providers: listProviders().length
      });
    }

    /* ─── Usage Stats ─── */

    const usageMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/usage$/);

    if (usageMatch && request.method === "GET") {
      const usage = registry.getAgentUsage(usageMatch[1]);
      if (!usage) return sendJson(response, 404, { error: "Agent not found" });
      return sendJson(response, 200, usage);
    }

    if (request.method === "GET" && url.pathname === "/api/agents") {
      return sendJson(response, 200, { agents: registry.listAgents() });
    }

    if (request.method === "GET" && url.pathname === "/api/topology") {
      return sendJson(response, 200, registry.getTopology());
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(response, 200, providerSummary());
    }

    if (request.method === "GET" && url.pathname === "/api/provider-readiness") {
      return sendJson(response, 200, {
        providers: listProviderConnections(process.env),
        summary: getProviderReadinessSummary(process.env)
      });
    }

    if (request.method === "POST" && url.pathname === "/api/agents") {
      const payload = parseCreateAgentInput(await readRequestBody(request));
      const agent = registry.createAgent(payload);
      return sendJson(response, 201, { agent });
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      const payload = parseCreateLinkInput(await readRequestBody(request));
      const link = registry.createLink(payload);
      return sendJson(response, 201, { link });
    }

    if (request.method === "GET") {
      const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = normalize(join(webRoot, target));
      if (relative(webRoot, filePath).startsWith("..")) {
        return sendJson(response, 403, { error: "Forbidden" });
      }
      const asset = await readFile(filePath);
      response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      response.end(asset);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error.status ?? 400;
    sendJson(response, status, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Zsiistant v${VERSION} listening on http://${host}:${port}`);
});
