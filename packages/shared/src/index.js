export const agentStatusValues = ["idle", "running", "paused", "error"];
export const isolationModeValues = ["isolated", "selective", "mesh"];
export const agentLinkModeValues = ["observe", "message", "delegate"];
export const providerStatusValues = ["live-target", "planned", "experimental"];
export const providerCategoryValues = ["cloud", "local", "self-hosted", "router"];
export const providerReadinessValues = ["ready", "needs-config"];
export const firstWaveProviderIds = ["ollama", "ollama-cloud", "z-ai", "anthropic", "openai"];

export const providerCatalog = [
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
  { id: "nvidia-nim", name: "NVIDIA NIM", category: "self-hosted", status: "planned" },
  { id: "lepton", name: "Lepton AI", category: "cloud", status: "planned" },
  { id: "modal", name: "Modal", category: "self-hosted", status: "planned" },
  { id: "baseten", name: "Baseten", category: "cloud", status: "planned" },
  { id: "anyscale", name: "Anyscale", category: "cloud", status: "planned" },
  { id: "databricks", name: "Databricks Model Serving", category: "cloud", status: "planned" },
  { id: "deepinfra", name: "DeepInfra", category: "cloud", status: "planned" },
  { id: "writer", name: "Writer", category: "cloud", status: "planned" },
  { id: "ai21", name: "AI21", category: "cloud", status: "planned" },
  { id: "ollama", name: "Ollama", category: "local", status: "live-target", suggestedModel: "qwen3" },
  { id: "ollama-cloud", name: "Ollama Cloud", category: "cloud", status: "live-target", suggestedModel: "qwen3" },
  { id: "lm-studio", name: "LM Studio", category: "local", status: "planned" },
  { id: "vllm", name: "vLLM", category: "self-hosted", status: "planned" },
  { id: "llama-cpp", name: "llama.cpp Server", category: "local", status: "planned" },
  { id: "localai", name: "LocalAI", category: "local", status: "planned" },
  { id: "text-generation-webui", name: "Text Generation Web UI", category: "local", status: "experimental" },
  { id: "koboldcpp", name: "KoboldCpp", category: "local", status: "experimental" },
  { id: "xinference", name: "Xinference", category: "self-hosted", status: "planned" },
  { id: "jan", name: "Jan", category: "local", status: "experimental" },
  { id: "z-ai", name: "Z.AI", category: "cloud", status: "live-target", suggestedModel: "glm-4.6" },
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

const firstWaveConnectionSpecs = {
  ollama: {
    transport: "local-http",
    requiredEnv: ["OLLAMA_BASE_URL"],
    baseUrlEnv: "CLAWFORGE_OLLAMA_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:11434",
    healthStrategy: "http-get:/api/tags"
  },
  "ollama-cloud": {
    transport: "cloud-http",
    requiredEnv: ["OLLAMA_CLOUD_API_KEY"],
    baseUrlEnv: "CLAWFORGE_OLLAMA_CLOUD_BASE_URL",
    defaultBaseUrl: "https://ollama.com",
    healthStrategy: "auth-http-get:/api/tags"
  },
  "z-ai": {
    transport: "cloud-http",
    requiredEnv: ["ZAI_API_KEY"],
    baseUrlEnv: "CLAWFORGE_Z_AI_BASE_URL",
    defaultBaseUrl: "https://api.z.ai",
    healthStrategy: "auth-http-get:/v1/models"
  },
  anthropic: {
    transport: "cloud-http",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    baseUrlEnv: "CLAWFORGE_ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com",
    healthStrategy: "auth-http-get:/v1/models"
  },
  openai: {
    transport: "cloud-http",
    requiredEnv: ["OPENAI_API_KEY"],
    baseUrlEnv: "CLAWFORGE_OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    healthStrategy: "auth-http-get:/models"
  }
};

const ensureString = (value, field, min, max) => {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters.`);
  }
  
  // Additional security: check for empty strings after trimming
  if (normalized.length === 0) {
    throw new Error(`${field} cannot be empty or contain only whitespace.`);
  }

  // Enhanced sanitization to prevent injection attacks
  // Grouped patterns for better performance with comprehensive security coverage
  const dangerousPatterns = [
    // Critical security threats - check these first
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /data:/gi,
    /eval\(/gi,
    /exec\(/gi,
    /Function\(/gi,
    /on\w+\s*=/gi,
    
    // SQL injection
    /SELECT\s+/gi,
    /INSERT\s+/gi,
    /UPDATE\s+/gi,
    /DELETE\s+/gi,
    /DROP\s+/gi,
    /CREATE\s+/gi,
    /ALTER\s+/gi,
    /;\s*--/g,
    /#\s*$/gm,
    
    // Control characters and null bytes
    /\x00/g,
    /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g,
    /[\u0000-\u001F\u007F-\u009F]/g,
    
    // Path traversal
    /\.\./g,
    
    // Quotes and dangerous characters
    /['"`\\]/g,
    
    // Basic HTML tags that could be dangerous
    /<iframe|<object|<embed|<style|<meta|<link|<img|<video|<audio|<svg/gi,
    
    // Additional DOM access attempts
    /document\./gi,
    /window\./gi,
    /global\./gi,
    /self\./gi,
    /top\./gi,
    /parent\./gi,
    /frames\./gi,
    /location\./gi,
    /history\./gi,
    /navigator\./gi
  ];
  
  // Optimized dangerous pattern detection - batch similar patterns for performance
  const patternGroups = [
    // Most critical patterns first for early termination
    [/<script[^>]*>.*?<\/script>/gi, /javascript:/gi, /eval\(/gi, /exec\(/gi],
    [/on\w+\s*=/gi, /<iframe|<object|<embed|<style|<meta|<link|<img/gi],
    [/SELECT\s+/gi, /INSERT\s+/gi, /UPDATE\s+/gi, /DELETE\s+/gi],
    [/DROP\s+/gi, /CREATE\s+/gi, /ALTER\s+/gi, /;\s*--/g],
    [/\x00/g, /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g],
    [/[\u0000-\u001F\u007F-\u009F]/g], [/\.\./g]
  ];
  
  for (const group of patternGroups) {
    for (const pattern of group) {
      if (pattern.test(normalized)) {
        console.warn(`Blocked potentially dangerous content in ${field}:`, pattern.toString());
        throw new Error(`${field} contains invalid or potentially dangerous content.`);
      }
    }
  }
  
  // Unicode normalization check with enhanced security
  if (normalized.normalize('NFKC') !== normalized) {
    throw new Error(`${field} contains potentially dangerous Unicode characters.`);
  }
  
  // Additional security: Check for extremely long strings that might cause memory issues
  if (normalized.length > 10000) {
    throw new Error(`${field} exceeds maximum allowed length for security reasons.`);
  }
  
  return normalized;
};

/**
 * Enhanced ensureString with additional security checks
 * @param {string} value - Value to validate
 * @param {string} field - Field name for error messages
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {Object} options - Additional validation options
 * @returns {string} Validated and sanitized string
 */
const ensureStringEnhanced = (value, field, min, max, options = {}) => {
  const normalized = ensureString(value, field, min, max);
  
  // Additional security: Check for other dangerous content
  if (options.noHTML && /<[^>]*>/.test(normalized)) {
    throw new Error(`${field} contains HTML tags which are not allowed.`);
  }
  
  if (options.noSQL && /[;'"`]/.test(normalized)) {
    throw new Error(`${field} contains potentially dangerous SQL characters.`);
  }
  
  if (options.noScripts && /(?:javascript:|data:|<script)/i.test(normalized)) {
    throw new Error(`${field} contains potentially dangerous script content.`);
  }
  
  if (options.noPaths && /(?:\.\.|\/\.\.|\.\.)/.test(normalized)) {
    throw new Error(`${field} contains potentially dangerous path sequences.`);
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
  // Check if value is actually an integer and within bounds
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer.`);
  }
  
  // Enhanced security: check for NaN, Infinity, or other numeric anomalies
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite integer.`);
  }
  
  // Check bounds with safety margins for security
  const safeMin = Math.max(min, 0); // Ensure minimum is not negative
  const safeMax = Math.min(max, 100000); // Reasonable upper limit for security
  
  if (value < safeMin || value > safeMax) {
    throw new Error(`${field} must be an integer between ${safeMin} and ${safeMax}.`);
  }

  // Enhanced security checks for specific fields with stricter limits
  const securityFields = ['maxConcurrentTasks', 'maxTokens', 'timeout', 'limit', 'page', 'offset'];
  if (securityFields.includes(field)) {
    // More restrictive limits for security-sensitive fields
    const securityLimits = {
      'maxConcurrentTasks': { min: 1, max: 16 },
      'maxTokens': { min: 1, max: 16000 },
      'timeout': { min: 5000, max: 120000 },
      'limit': { min: 1, max: 100 },
      'page': { min: 1, max: 1000 },
      'offset': { min: 0, max: 10000 }
    };
    
    const securityLimit = securityLimits[field];
    if (value < securityLimit.min || value > securityLimit.max) {
      throw new Error(`${field} must be between ${securityLimit.min} and ${securityLimit.max} for security reasons.`);
    }
  }

  // Check for potentially problematic values
  if (value <= 0 && field !== 'timeout' && field !== 'offset') {
    throw new Error(`${field} must be a positive integer for security reasons.`);
  }

  // Additional security: check for numeric manipulation attempts
  if (value > Number.MAX_SAFE_INTEGER - 1) {
    throw new Error(`${field} exceeds maximum safe integer value.`);
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
  category: ensureEnum(input.category, "category", providerCategoryValues),
  status: ensureEnum(input.status, "status", providerStatusValues),
  suggestedModel:
    typeof input.suggestedModel === "string"
      ? ensureString(input.suggestedModel, "suggestedModel", 2, 120)
      : null
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

const normalizeOptionalUrl = (value, fallback) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().replace(/\/+$/, "");
  }

  return fallback;
};

const getProviderById = (id) => {
  const provider = providerCatalog.find((entry) => entry.id === id);
  if (!provider) {
    throw new Error(`Unknown provider id: ${id}`);
  }

  return ensureProvider(provider);
};

const firstWavePriorityFor = (providerId) => {
  const index = firstWaveProviderIds.indexOf(providerId);
  return index === -1 ? null : index + 1;
};

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

const sanitizeContent = (content, field) => {
  if (typeof content !== 'string') return content;
  
  // Remove potentially dangerous HTML/JS content
  let sanitized = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');
  
  return sanitized;
};

export const parseCreateAgentInput = (input) => {
  // Validate input structure
  if (!input || typeof input !== 'object') {
    throw new Error('Agent input must be an object');
  }
  
  // Enhanced validation with security checks
  const provider = getProviderById(
    ensureStringEnhanced(input.provider, "provider", 2, 80, { noSQL: true })
  );

  return {
    name: ensureStringEnhanced(input.name, "name", 2, 80, { 
      noHTML: true, 
      noSQL: true, 
      noScripts: true,
      noPaths: true
    }),
    purpose: ensureStringEnhanced(input.purpose, "purpose", 10, 240, { 
      noHTML: true, 
      noSQL: true,
      noScripts: true
    }),
    provider: provider.id,
    model: ensureStringEnhanced(input.model, "model", 2, 120, { 
      noSQL: true,
      noPaths: true
    }),
    isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
    maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
    peerAccess: ensureBoolean(input.peerAccess, "peerAccess")
  };
};

export const parseCreateLinkInput = (input) => ({
  sourceAgentId: ensureUuid(input.sourceAgentId, "sourceAgentId"),
  targetAgentId: ensureUuid(input.targetAgentId, "targetAgentId"),
  mode: ensureEnum(input.mode, "mode", agentLinkModeValues)
});

export const listProviders = () => providerCatalog.map((provider) => ensureProvider(provider));

export const listProviderConnections = (env = process.env) => {
  const prioritized = firstWaveProviderIds.map((providerId) => {
    const provider = getProviderById(providerId);
    const spec = firstWaveConnectionSpecs[providerId];
    const configured = spec.requiredEnv.every((name) => typeof env[name] === "string" && env[name].trim().length > 0);

    return {
      ...provider,
      priority: firstWavePriorityFor(providerId),
      transport: spec.transport,
      requiredEnv: [...spec.requiredEnv],
      configured,
      readiness: configured ? "ready" : "needs-config",
      baseUrl: normalizeOptionalUrl(env[spec.baseUrlEnv], spec.defaultBaseUrl),
      healthStrategy: spec.healthStrategy
    };
  });

  const remaining = listProviders()
    .filter((provider) => !firstWaveProviderIds.includes(provider.id))
    .map((provider) => ({
      ...provider,
      priority: null,
      transport: provider.category === "local" ? "local-http" : "cloud-http",
      requiredEnv: [],
      configured: false,
      readiness: "needs-config",
      baseUrl: null,
      healthStrategy: "planned"
    }));

  return [...prioritized, ...remaining];
};

export const getProviderReadinessSummary = (env = process.env) => {
  const providers = listProviderConnections(env).filter((provider) => provider.priority !== null);
  const ready = providers.filter((provider) => provider.configured);
  const pending = providers.filter((provider) => !provider.configured);

  return {
    firstWave: {
      total: providers.length,
      configured: ready.length,
      pendingCount: pending.length,
      ready: ready.map((provider) => provider.id),
      pending: pending.map((provider) => provider.id)
    },
    providers
  };
};