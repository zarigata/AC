export const builtInPresets = {
  researcher: {
    purpose: "Collect information, summarize documents, and surface insights.",
    provider: "anthropic",
    model: "claude-sonnet-4.5",
    isolationMode: "selective",
    maxConcurrentTasks: 4,
    peerAccess: true,
    level: "agent",
    maxSubAgents: 5
  },
  coder: {
    purpose: "Write, review, and refactor code across languages and frameworks.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "selective",
    maxConcurrentTasks: 4,
    peerAccess: true,
    level: "agent",
    maxSubAgents: 5
  },
  writer: {
    purpose: "Draft, edit, and polish content for blogs, docs, and scripts.",
    provider: "openai",
    model: "gpt-5.4",
    isolationMode: "selective",
    maxConcurrentTasks: 2,
    peerAccess: false,
    level: "agent",
    maxSubAgents: 3
  },
  designer: {
    purpose: "Generate visual layouts, design tokens, and UI guidance.",
    provider: "openai",
    model: "gpt-5.4",
    isolationMode: "isolated",
    maxConcurrentTasks: 2,
    peerAccess: false,
    level: "agent",
    maxSubAgents: 0
  },
  orchestrator: {
    purpose: "Break work into tasks, supervise runs, and route model usage.",
    provider: "openai",
    model: "gpt-5.4",
    isolationMode: "mesh",
    maxConcurrentTasks: 8,
    peerAccess: true,
    level: "orchestrator",
    maxSubAgents: 10
  },
  custom: {
    purpose: "User-defined agent with no preset defaults.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "mesh",
    maxConcurrentTasks: 1,
    peerAccess: false,
    level: "agent",
    maxSubAgents: 0
  }
};

export function getPreset(name) {
  return builtInPresets[name] ?? null;
}

export function applyPreset(input, presetName) {
  const preset = getPreset(presetName);
  if (!preset) return input;

  return {
    ...preset,
    ...Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined && v !== "" && v !== null)
    ),
    flavor: presetName
  };
}
