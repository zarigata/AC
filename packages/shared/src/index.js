export const agentStatusValues = ["idle", "running", "paused", "error"];
export const isolationModeValues = ["isolated", "selective", "mesh"];
export const agentLinkModeValues = ["observe", "message", "delegate"];

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

const ensureUuid = (value, field) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${field} must be a UUID.`);
  }

  return value;
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

export const parseCreateAgentInput = (input) => ({
  name: ensureString(input.name, "name", 2, 80),
  purpose: ensureString(input.purpose, "purpose", 10, 240),
  provider: ensureString(input.provider, "provider", 2, 80),
  model: ensureString(input.model, "model", 2, 120),
  isolationMode: ensureEnum(input.isolationMode, "isolationMode", isolationModeValues),
  maxConcurrentTasks: ensureInteger(input.maxConcurrentTasks, "maxConcurrentTasks", 1, 32),
  peerAccess: ensureBoolean(input.peerAccess, "peerAccess")
});

export const parseCreateLinkInput = (input) => ({
  sourceAgentId: ensureUuid(input.sourceAgentId, "sourceAgentId"),
  targetAgentId: ensureUuid(input.targetAgentId, "targetAgentId"),
  mode: ensureEnum(input.mode, "mode", agentLinkModeValues)
});
