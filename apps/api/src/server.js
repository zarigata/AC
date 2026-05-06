import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listAgentTemplates,
  listProviders,
  parseCreateAgentInput,
  parseCreateLinkInput,
  parseUpdateAgentInput
} from "../../../packages/shared/src/index.js";

import { getOnboardingSnapshot } from "./onboarding.js";
import { AgentRegistry } from "./registry.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const databasePath =
  process.env.RELAYCORE_DB_PATH ??
  process.env.CLAWFORGE_DB_PATH ??
  new URL("../data/relaycore.sqlite", import.meta.url).pathname;
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, service: "relaycore-api" });
    }

    if (request.method === "GET" && url.pathname === "/api/agents") {
      return sendJson(response, 200, { agents: registry.listAgents() });
    }

    if (request.method === "GET" && url.pathname === "/api/topology") {
      return sendJson(response, 200, registry.getTopology());
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      const providers = listProviders();
      return sendJson(response, 200, {
        providers,
        summary: {
          total: providers.length,
          local: providers.filter((provider) => provider.category === "local").length,
          cloud: providers.filter((provider) => provider.category === "cloud").length,
          selfHosted: providers.filter((provider) => provider.category === "self-hosted").length,
          routers: providers.filter((provider) => provider.category === "router").length
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/templates") {
      const templates = listAgentTemplates();
      return sendJson(response, 200, {
        templates,
        summary: {
          total: templates.length,
          collaborative: templates.filter((template) => template.peerAccess).length,
          isolated: templates.filter((template) => template.isolationMode === "isolated").length
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/onboarding") {
      return sendJson(
        response,
        200,
        getOnboardingSnapshot({
          host,
          port,
          topology: registry.getTopology(),
          providers: listProviders(),
          templates: listAgentTemplates()
        })
      );
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

    if (request.method === "PATCH" && url.pathname.startsWith("/api/agents/")) {
      const agentId = url.pathname.slice("/api/agents/".length);
      const payload = parseUpdateAgentInput(await readRequestBody(request));
      const agent = registry.updateAgent(agentId, payload);
      return sendJson(response, 200, { agent });
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
  console.log(`RelayCore listening on http://${host}:${port}`);
});
