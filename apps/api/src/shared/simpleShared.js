/**
 * Simplified shared constants and functions to avoid import issues
 */

// Agent configuration values
export const agentStatusValues = ["idle", "running", "paused", "error"];
export const isolationModeValues = ["isolated", "selective", "mesh"];
export const agentLinkModeValues = ["observe", "message", "delegate"];

// Provider configuration values
export const providerStatusValues = ["live-target", "planned", "experimental"];
export const providerCategoryValues = ["cloud", "local", "self-hosted", "router"];
export const providerReadinessValues = ["ready", "needs-config"];
export const firstWaveProviderIds = ["ollama", "ollama-cloud", "z-ai", "anthropic", "openai"];

// Provider catalog
export const providerCatalog = [
  { id: "ollama", name: "Ollama", category: "local", status: "live-target", suggestedModel: "qwen3:1.7b" },
  { id: "openai", name: "OpenAI", category: "cloud", status: "live-target", suggestedModel: "gpt-5.4-mini" },
  { id: "azure-openai", name: "Azure OpenAI", category: "cloud", status: "planned" },
  { id: "anthropic", name: "Anthropic", category: "cloud", status: "live-target", suggestedModel: "claude-sonnet-4.5" },
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
  { id: "nvidia-nim", name: "NVIDIA NIM", category: "self-hosted", status: "planned" }
];

// Helper functions
const ensureString = (value, fieldName, minLength, maxLength) => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
  }
  return trimmed;
};

const ensureEnum = (value, fieldName, allowedValues) => {
  if (!allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
};

const ensureInteger = (value, fieldName, min, max) => {
  const num = parseInt(value);
  if (isNaN(num) || num < min || num > max) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return num;
};

const ensureBoolean = (value, fieldName) => {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
};

// Provider lookup
const getProviderById = (id) => {
  return providerCatalog.find(p => p.id === id) || providerCatalog[0];
};

// Parsing functions
export const parseAgent = (agent) => {
  return {
    id: agent.id,
    name: ensureString(agent.name, "name", 2, 80),
    purpose: ensureString(agent.purpose, "purpose", 10, 240),
    systemPrompt: agent.systemPrompt ? ensureString(agent.systemPrompt, "systemPrompt", 0, 2000) : null,
    toolsConfig: agent.toolsConfig || null,
    provider: getProviderById(agent.provider).id,
    model: ensureString(agent.model, "model", 2, 120),
    isolationMode: ensureEnum(agent.isolationMode, "isolationMode", isolationModeValues),
    status: ensureEnum(agent.status, "status", agentStatusValues),
    maxConcurrentTasks: ensureInteger(agent.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
    peerAccess: ensureBoolean(agent.peerAccess, "peerAccess"),
    createdAt: agent.createdAt || new Date().toISOString(),
    updatedAt: agent.updatedAt || new Date().toISOString()
  };
};

export const parseCreateAgentInput = (input) => {
  if (!input || typeof input !== 'object') {
    throw new Error('Agent input must be an object');
  }
  
  const provider = getProviderById(input.provider);

  return {
    name: ensureString(input.name, "name", 2, 80),
    purpose: ensureString(input.purpose, "purpose", 10, 240),
    systemPrompt: input.systemPrompt ? ensureString(input.systemPrompt, "systemPrompt", 0, 2000) : null,
    toolsConfig: input.toolsConfig || null,
    provider: provider.id,
    model: ensureString(input.model, "model", 2, 120),
    isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
    maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
    peerAccess: ensureBoolean(input.peerAccess, "peerAccess")
  };
};

export const parseCreateLinkInput = (input) => {
  if (!input || typeof input !== 'object') {
    throw new Error('Link input must be an object');
  }
  
  // Support both field names for backward compatibility
  const sourceId = input.sourceAgentId || input.sourceId;
  const targetId = input.targetAgentId || input.targetId;
  
  return {
    sourceId: ensureString(sourceId, "sourceAgentId/sourceId", 2, 80),
    targetId: ensureString(targetId, "targetAgentId/targetId", 2, 80),
    mode: ensureEnum(input.mode, "mode", agentLinkModeValues),
    direction: ensureEnum(input.direction, "direction", ["inbound", "outbound", "bidirectional"])
  };
};

// Summary functions
export const providerSummary = () => ({
  providers: listProviderConnections(),
  summary: getProviderReadinessSummary()
});

export const getProviderReadinessSummary = () => ({
  total: providerCatalog.length,
  ready: providerCatalog.filter(p => p.status === "live-target").length,
  needsConfig: providerCatalog.filter(p => p.status === "planned").length
});

export const listProviderConnections = () => providerCatalog.map(p => ({
  id: p.id,
  name: p.name,
  category: p.category,
  status: p.status
}));

export const listProviders = () => providerCatalog;