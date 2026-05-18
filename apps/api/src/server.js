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
import { applyPreset } from "./presets.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const databasePath = process.env.CLAWFORGE_DB_PATH ?? new URL("../data/clawforge.sqlite", import.meta.url).pathname;
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
      return sendJson(response, 200, { ok: true, service: "clawforge-api" });
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

    if (request.method === "GET" && url.pathname === "/api/presets") {
      const { builtInPresets } = await import("./presets.js");
      return sendJson(response, 200, { presets: Object.keys(builtInPresets) });
    }

    if (request.method === "POST" && url.pathname === "/api/agents") {
      const body = await readRequestBody(request);
      const payload = parseCreateAgentInput(
        body.preset ? applyPreset(body, body.preset) : body
      );
      const agent = registry.createAgent(payload);
      return sendJson(response, 201, { agent });
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      const payload = parseCreateLinkInput(await readRequestBody(request));
      const link = registry.createLink(payload);
      return sendJson(response, 201, { link });
    }

    if (request.method === "GET" && /^\/api\/agents\/[^/]+\/messages$/.test(url.pathname)) {
      const agentId = url.pathname.split("/")[3];
      const messages = registry.getMessagesForAgent(agentId);
      return sendJson(response, 200, { messages });
    }

    if (request.method === "POST" && /^\/api\/agents\/[^/]+\/messages$/.test(url.pathname)) {
      const agentId = url.pathname.split("/")[3];
      const body = await readRequestBody(request);
      const message = registry.sendMessage({
        fromAgentId: body.fromAgentId ?? agentId,
        toAgentId: body.toAgentId,
        content: body.content,
        type: body.type ?? "text"
      });
      return sendJson(response, 201, { message });
    }

    if (request.method === "GET" && /^\/api\/agents\/[^/]+\/conversation\/[^/]+$/.test(url.pathname)) {
      const parts = url.pathname.split("/");
      const agentId = parts[3];
      const otherId = parts[5];
      const messages = registry.getConversation(agentId, otherId);
      return sendJson(response, 200, { messages });
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
    sendJson(response, 400, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`ClawForge listening on http://${host}:${port}`);
});
