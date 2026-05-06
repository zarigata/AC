export const agentStatusValues = ["idle", "running", "paused", "error"];
export const isolationModeValues = ["isolated", "selective", "mesh"];
export const agentLinkModeValues = ["observe", "message", "delegate"];
export const providerStatusValues = ["live-target", "planned", "experimental"];

export const providerCatalog = [
  { id: "openai", name: "OpenAI", category: "cloud", status: "live-target" },
  { id: "azure-openai", name: "Azure OpenAI", category: "cloud", status: "planned" },
  { id: "anthropic", name: "Anthropic", category: "cloud", status: "live-target" },
  { id: "google-gemini", name: "Google Gemini", category: "cloud", status: "planned" },
  { id: "vertex-ai", name: "Vertex AI", category: "cloud", status: "planned" },
  { id: "aws-bedrock", name: "AWS Bedrock", category: "cloud", status: "planned" },
  { id: "mistral", name: "Mistral", category: "cloud", status: "planned" },
  { id: "cohere", name: "Cohere", category: "cloud", status: "planned" },
  { id: "groq", name: "Groq", category: "cloud", status: "planned" },
  { id: "deepseek", name: "DeepSeek", category: "cloud", status: "planned" },
  { id: "xai", name: "xAI", category: "cloud", status: "planned" },
  { id: "perplexity", name: "Perplexity", category: "cloud", status: "planned" },
  { id: "together", name: "Together AI", category: "cloud", status: "planned" },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", status: "planned" },
  { id: "openrouter", name: "OpenRouter", category: "router", status: "planned" },
  { id: "cerebras", name: "Cerebras", category: "cloud", status: "planned" },
  { id: "sambanova", name: "SambaNova", category: "cloud", status: "planned" },
  { id: "cloudflare-workers-ai", name: "Cloudflare Workers AI", category: "cloud", status: "planned" },
  { id: "replicate", name: "Replicate", category: "cloud", status: "planned" },
  { id: "huggingface-inference", name: "Hugging Face Inference", category: "cloud", status: "planned" },
  { id: "nvidia-nim", name: "NVIDIA NIM", category: "self-hosted", status: "planned" },
  { id: "lepton", name: "Lepton AI", category: "cloud", status: "planned" },
  { id: "modal", name: "Modal", category: "self-hosted", status: "planned" },
  { id: "baseten", name: "Baseten", category: "cloud", status: "planned" },
  { id: "anyscale", name: "Anyscale", category: "cloud", status: "planned" },
  { id: "databricks", name: "Databricks Model Serving", category: "cloud", status: "planned" },
  { id: "deepinfra", name: "DeepInfra", category: "cloud", status: "planned" },
  { id: "writer", name: "Writer", category: "cloud", status: "planned" },
  { id: "ai21", name: "AI21", category: "cloud", status: "planned" },
  { id: "ollama", name: "Ollama", category: "local", status: "live-target" },
  { id: "ollama-cloud", name: "Ollama Cloud", category: "cloud", status: "live-target" },
  { id: "lm-studio", name: "LM Studio", category: "local", status: "planned" },
  { id: "vllm", name: "vLLM", category: "self-hosted", status: "planned" },
  { id: "llama-cpp", name: "llama.cpp Server", category: "local", status: "planned" },
  { id: "localai", name: "LocalAI", category: "local", status: "planned" },
  { id: "text-generation-webui", name: "Text Generation Web UI", category: "local", status: "experimental" },
  { id: "koboldcpp", name: "KoboldCpp", category: "local", status: "experimental" },
  { id: "xinference", name: "Xinference", category: "self-hosted", status: "planned" },
  { id: "jan", name: "Jan", category: "local", status: "experimental" },
  { id: "z-ai", name: "Z.AI", category: "cloud", status: "live-target" },
  { id: "moonshot", name: "Moonshot AI", category: "cloud", status: "planned" },
  { id: "baidu-qianfan", name: "Baidu Qianfan", category: "cloud", status: "planned" },
  { id: "alibaba-dashscope", name: "Alibaba DashScope", category: "cloud", status: "planned" },
  { id: "tencent-hunyuan", name: "Tencent Hunyuan", category: "cloud", status: "planned" },
  { id: "minimax", name: "MiniMax", category: "cloud", status: "planned" },
  { id: "zero-one-ai", name: "01.AI", category: "cloud", status: "planned" },
  { id: "novita", name: "Novita AI", category: "cloud", status: "planned" },
  { id: "nebius", name: "Nebius AI Studio", category: "cloud", status: "planned" },
  { id: "scaleway-ai", name: "Scaleway AI", category: "cloud", status: "planned" },
  { id: "hyperbolic", name: "Hyperbolic", category: "cloud", status: "planned" }
];

export const agentTemplateCatalog = [
  {
    id: "ops-coordinator",
    name: "Ops Coordinator",
    summary: "Routes work, keeps humans in the loop, and escalates when the chain gets stuck.",
    purpose: "Coordinate small-team work, route tasks to specialists, summarize progress, and escalate blockers to a human operator.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "selective",
    maxConcurrentTasks: 6,
    peerAccess: true,
    collaborationMode: "delegate"
  },
  {
    id: "research-scout",
    name: "Research Scout",
    summary: "Collects facts, compares options, and hands off concise briefs to another agent.",
    purpose: "Gather source-backed findings, compare options, and deliver short briefs for a coordinator or reviewer.",
    provider: "ollama",
    model: "qwen3",
    isolationMode: "isolated",
    maxConcurrentTasks: 3,
    peerAccess: false,
    collaborationMode: "delegate"
  },
  {
    id: "customer-reply-drafter",
    name: "Customer Reply Drafter",
    summary: "Prepares customer-facing responses for review before anything is sent.",
    purpose: "Draft clear, friendly customer replies from tickets or notes and hand them to a reviewer before release.",
    provider: "anthropic",
    model: "claude-haiku-4.5",
    isolationMode: "selective",
    maxConcurrentTasks: 4,
    peerAccess: true,
    collaborationMode: "review"
  },
  {
    id: "inbox-triage",
    name: "Inbox Triage",
    summary: "Sorts incoming work, tags urgency, and forwards the next-best action.",
    purpose: "Classify inbound requests, mark urgency, and hand off the next action to the right teammate or operator.",
    provider: "ollama",
    model: "llama3.1",
    isolationMode: "selective",
    maxConcurrentTasks: 8,
    peerAccess: true,
    collaborationMode: "handoff"
  },
  {
    id: "run-reviewer",
    name: "Run Reviewer",
    summary: "Checks outputs from other agents and surfaces risks before humans act.",
    purpose: "Review drafts, plans, or summaries from other agents, point out risks, and recommend whether a human should approve the next step.",
    provider: "z-ai",
    model: "glm-4-air",
    isolationMode: "isolated",
    maxConcurrentTasks: 2,
    peerAccess: false,
    collaborationMode: "review"
  }
];

const ensureString = (value, field, min, max) => {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters.`);
  }

  return normalized;
};

const ensureBoolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }

  return value;
};

const ensureInteger = (value, field, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }

  return value;
};

const ensureEnum = (value, field, allowed) => {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  }

  return value;
};

const ensureProvider = (input) => ({
  id: ensureString(input.id, "id", 2, 80),
  name: ensureString(input.name, "name", 2, 120),
  category: ensureEnum(input.category, "category", ["cloud", "local", "self-hosted", "router"]),
  status: ensureEnum(input.status, "status", providerStatusValues)
});

const ensureUuid = (value, field) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${field} must be a UUID.`);
  }

  return value;
};

const ensureTemplate = (input) => ({
  id: ensureString(input.id, "id", 2, 80),
  name: ensureString(input.name, "name", 2, 80),
  summary: ensureString(input.summary, "summary", 10, 180),
  purpose: ensureString(input.purpose, "purpose", 10, 240),
  provider: ensureString(input.provider, "provider", 2, 80),
  model: ensureString(input.model, "model", 2, 120),
  isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
  maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
  peerAccess: ensureBoolean(input.peerAccess, "peerAccess"),
  collaborationMode: ensureEnum(input.collaborationMode, "collaborationMode", [
    "delegate",
    "review",
    "handoff",
    "summarize"
  ])
});

export const parseAgent = (input) => ({
  id: ensureUuid(input.id, "id"),
  name: ensureString(input.name, "name", 2, 80),
  purpose: ensureString(input.purpose, "purpose", 10, 240),
  status: ensureEnum(input.status, "status", agentStatusValues),
  provider: ensureString(input.provider, "provider", 2, 80),
  model: ensureString(input.model, "model", 2, 120),
  isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
  maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
  peerAccess: ensureBoolean(input.peerAccess, "peerAccess"),
  createdAt: ensureString(input.createdAt, "createdAt", 10, 40),
  updatedAt: ensureString(input.updatedAt, "updatedAt", 10, 40)
});

export const parseCreateAgentInput = (input) => ({
  name: ensureString(input.name, "name", 2, 80),
  purpose: ensureString(input.purpose, "purpose", 10, 240),
  provider: ensureString(input.provider, "provider", 2, 80),
  model: ensureString(input.model, "model", 2, 120),
  isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
  maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
  peerAccess: ensureBoolean(input.peerAccess, "peerAccess")
});

export const parseUpdateAgentInput = (input) => {
  if (typeof input !== "object" || input === null) {
    throw new Error("Agent update payload must be an object.");
  }

  const updates = {};

  if ("status" in input) {
    updates.status = ensureEnum(input.status, "status", agentStatusValues);
  }

  if ("peerAccess" in input) {
    updates.peerAccess = ensureBoolean(input.peerAccess, "peerAccess");
  }

  if ("isolationMode" in input) {
    updates.isolationMode = ensureEnum(input.isolationMode, "isolationMode", isolationModeValues);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("Agent update payload must include status, peerAccess, or isolationMode.");
  }

  return updates;
};

export const parseCreateLinkInput = (input) => ({
  sourceAgentId: ensureUuid(input.sourceAgentId, "sourceAgentId"),
  targetAgentId: ensureUuid(input.targetAgentId, "targetAgentId"),
  mode: ensureEnum(input.mode, "mode", agentLinkModeValues)
});

export const listProviders = () => providerCatalog.map((provider) => ensureProvider(provider));
export const listAgentTemplates = () => agentTemplateCatalog.map((template) => ensureTemplate(template));
