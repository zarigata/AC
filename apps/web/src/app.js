const AGENT_STATUS_OPTIONS = ["idle", "running", "paused", "error"];

const state = {
  topology: null,
  providers: null,
  pendingStatusUpdates: new Set(),
  pendingLinkCreation: false
};

const ui = {
  activeAgents: document.querySelector("#active-agents"),
  maxAgents: document.querySelector("#max-agents"),
  machineActiveAgents: document.querySelector("#machine-active-agents"),
  machineMaxAgents: document.querySelector("#machine-max-agents"),
  linkModes: document.querySelector("#link-modes"),
  agentGrid: document.querySelector("#agent-grid"),
  linkGrid: document.querySelector("#link-grid"),
  providerSummary: document.querySelector("#provider-summary"),
  providerGrid: document.querySelector("#provider-grid"),
  providerStats: document.querySelector("#provider-stats"),
  insightGrid: document.querySelector("#insight-grid"),
  agentSearch: document.querySelector("#agent-search"),
  agentIsolationFilter: document.querySelector("#agent-isolation-filter"),
  providerInput: document.querySelector("#provider-input"),
  modelInput: document.querySelector("#model-input"),
  modelSuggestions: document.querySelector("#model-suggestions"),
  linkForm: document.querySelector("#link-form"),
  linkSource: document.querySelector("#link-source"),
  linkTarget: document.querySelector("#link-target"),
  linkMode: document.querySelector("#link-mode"),
  form: document.querySelector("#agent-form"),
  error: document.querySelector("#error")
};

const showError = (message) => {
  ui.error.hidden = !message;
  ui.error.textContent = message ?? "";
};

const createChip = (text) => {
  const chip = document.createElement("span");
  chip.textContent = text;
  return chip;
};

const createKeyValue = (label, value) => {
  const item = document.createElement("div");
  item.className = "provider-stat";

  const key = document.createElement("span");
  key.textContent = label;

  const amount = document.createElement("strong");
  amount.textContent = String(value);

  item.append(key, amount);
  return item;
};

const providerModelDefaults = {
  ollama: ["qwen3", "llama3.1", "deepseek-r1"],
  "ollama-cloud": ["qwen3", "llama3.1-70b", "deepseek-r1"],
  "z-ai": ["glm-4.6", "glm-4-air", "glm-4-flash"],
  anthropic: ["claude-sonnet-4.5", "claude-opus-4.1", "claude-haiku-4.5"],
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-4.1"]
};

const getSuggestedModels = (providerId) =>
  providerModelDefaults[providerId] ?? ["custom-model", "latest-stable", "cost-optimized"];

const createInsightCard = (label, value, note) => {
  const card = document.createElement("article");
  card.className = "insight-card";

  const title = document.createElement("span");
  title.className = "metric-label";
  title.textContent = label;

  const amount = document.createElement("strong");
  amount.textContent = String(value);

  const detail = document.createElement("p");
  detail.textContent = note;

  card.append(title, amount, detail);
  return card;
};

const agentLabel = (agent) => `${agent.name} (${agent.id.slice(0, 8)})`;

const responseErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
};

const syncModelSuggestions = () => {
  const providerId = ui.providerInput.value;
  const suggestions = getSuggestedModels(providerId);

  ui.modelSuggestions.replaceChildren(
    ...suggestions.map((model) => {
      const option = document.createElement("option");
      option.value = model;
      return option;
    })
  );

  if (!suggestions.includes(ui.modelInput.value)) {
    [ui.modelInput.value] = suggestions;
  }
};

const syncProviderOptions = () => {
  if (!state.providers || !ui.providerInput) {
    return;
  }

  const currentValue = ui.providerInput.value || "ollama";
  ui.providerInput.replaceChildren(
    ...state.providers.providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = `${provider.name} · ${provider.status}`;
      return option;
    })
  );

  ui.providerInput.value = state.providers.providers.some((provider) => provider.id === currentValue)
    ? currentValue
    : "ollama";
  syncModelSuggestions();
};

const syncLinkFormOptions = (topology) => {
  if (!ui.linkForm || !ui.linkSource || !ui.linkTarget || !ui.linkMode) {
    return;
  }

  const agents = topology.agents;
  const modes = topology.capacity.supportedLinkModes;
  const previousSource = ui.linkSource.value;
  const previousTarget = ui.linkTarget.value;
  const previousMode = ui.linkMode.value;

  ui.linkSource.replaceChildren(
    ...agents.map((agent) => {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = agentLabel(agent);
      return option;
    })
  );

  ui.linkTarget.replaceChildren(
    ...agents.map((agent) => {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = agentLabel(agent);
      return option;
    })
  );

  ui.linkMode.replaceChildren(
    ...modes.map((mode) => {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode;
      return option;
    })
  );

  if (agents.length > 0) {
    const sourceId = agents.some((agent) => agent.id === previousSource) ? previousSource : agents[0].id;
    ui.linkSource.value = sourceId;

    const alternateTarget = agents.find((agent) => agent.id !== sourceId)?.id ?? sourceId;
    if (agents.some((agent) => agent.id === previousTarget) && previousTarget !== sourceId) {
      ui.linkTarget.value = previousTarget;
    } else {
      ui.linkTarget.value = alternateTarget;
    }
  }

  ui.linkMode.value = modes.includes(previousMode) ? previousMode : modes[0];

  const submitButton = ui.linkForm.querySelector('button[type="submit"]');
  if (submitButton) {
    const sourceId = ui.linkSource.value;
    const targetId = ui.linkTarget.value;
    submitButton.disabled =
      state.pendingLinkCreation || agents.length < 2 || sourceId.length === 0 || sourceId === targetId;
    submitButton.textContent = state.pendingLinkCreation ? "Creating..." : "Create link";
  }
};

const linkModeDescription = (mode) => {
  if (mode === "delegate") {
    return "handoff execution";
  }

  if (mode === "message") {
    return "direct peer exchange";
  }

  return "read-only awareness";
};

const updateAgentStatus = async (agentId, status) => {
  try {
    state.pendingStatusUpdates.add(agentId);
    render();

    const response = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, "Could not update status."));
    }

    await loadTopology();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not update status.");
  } finally {
    state.pendingStatusUpdates.delete(agentId);
    render();
  }
};

const createLink = async (payload) => {
  try {
    state.pendingLinkCreation = true;
    render();

    const response = await fetch("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, "Could not create link."));
    }

    await loadTopology();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not create link.");
  } finally {
    state.pendingLinkCreation = false;
    render();
  }
};

const render = () => {
  const topology = state.topology;
  if (!topology) {
    return;
  }

  ui.activeAgents.textContent = String(topology.capacity.activeAgents);
  ui.maxAgents.textContent = String(topology.capacity.maxAgentsPerMachine);
  ui.machineActiveAgents.textContent = String(topology.capacity.activeAgents);
  ui.machineMaxAgents.textContent = String(topology.capacity.maxAgentsPerMachine);

  const searchTerm = ui.agentSearch.value.trim().toLowerCase();
  const isolationFilter = ui.agentIsolationFilter.value;
  const visibleAgents = topology.agents.filter((agent) => {
    const matchesSearch =
      searchTerm.length === 0 ||
      [agent.name, agent.purpose, agent.provider, agent.model].some((value) =>
        value.toLowerCase().includes(searchTerm)
      );
    const matchesIsolation = isolationFilter === "all" || agent.isolationMode === isolationFilter;
    return matchesSearch && matchesIsolation;
  });

  ui.linkModes.replaceChildren(
    ...topology.capacity.supportedLinkModes.map((mode) => {
      const item = document.createElement("li");

      const title = document.createElement("strong");
      title.textContent = mode;

      const detail = document.createElement("span");
      detail.textContent = linkModeDescription(mode);

      item.append(title, detail);
      return item;
    })
  );

  ui.agentGrid.replaceChildren(
    ...visibleAgents.map((agent) => {
      const row = document.createElement("article");
      row.className = "agent-row";

      const primary = document.createElement("div");
      primary.className = "agent-primary";

      const kicker = document.createElement("span");
      kicker.className = "row-kicker";
      kicker.textContent = agent.status;

      const title = document.createElement("h3");
      title.textContent = agent.name;

      const text = document.createElement("p");
      text.textContent = agent.purpose;

      primary.append(kicker, title, text);

      const meta = document.createElement("div");
      meta.className = "agent-meta";
      meta.append(
        createChip(agent.provider),
        createChip(agent.model),
        createChip(agent.isolationMode),
        createChip(agent.peerAccess ? "peer-enabled" : "isolated")
      );

      const controls = document.createElement("div");
      controls.className = "agent-controls";

      const statusSelect = document.createElement("select");
      statusSelect.className = "status-select";
      statusSelect.append(
        ...AGENT_STATUS_OPTIONS.map((status) => {
          const option = document.createElement("option");
          option.value = status;
          option.textContent = status;
          return option;
        })
      );
      statusSelect.value = agent.status;

      const updateButton = document.createElement("button");
      updateButton.className = "status-button";
      updateButton.type = "button";
      updateButton.textContent = state.pendingStatusUpdates.has(agent.id) ? "Saving..." : "Update";
      updateButton.disabled =
        state.pendingStatusUpdates.has(agent.id) || statusSelect.value === agent.status;

      statusSelect.addEventListener("change", () => {
        updateButton.disabled =
          state.pendingStatusUpdates.has(agent.id) || statusSelect.value === agent.status;
      });

      updateButton.addEventListener("click", async () => {
        await updateAgentStatus(agent.id, statusSelect.value);
      });

      controls.append(statusSelect, updateButton);
      row.append(primary, meta, controls);
      return row;
    })
  );

  if (ui.insightGrid) {
    const isolatedCount = topology.agents.filter((agent) => agent.isolationMode === "isolated").length;
    const selectiveCount = topology.agents.filter((agent) => agent.isolationMode === "selective").length;
    const meshCount = topology.agents.filter((agent) => agent.isolationMode === "mesh").length;
    const peerEnabledCount = topology.agents.filter((agent) => agent.peerAccess).length;
    const providerCount = new Set(topology.agents.map((agent) => agent.provider)).size;

    ui.insightGrid.replaceChildren(
      createInsightCard("Visible agents", visibleAgents.length, "current registry rows after filters"),
      createInsightCard("Isolated", isolatedCount, "workers with no peer access by default"),
      createInsightCard("Selective", selectiveCount, "permissioned coordination lanes"),
      createInsightCard("Mesh", meshCount, "high-collaboration workers"),
      createInsightCard("Peer enabled", peerEnabledCount, "agents allowed to reach peers"),
      createInsightCard("Providers in use", providerCount, "distinct backends currently assigned")
    );
  }

  ui.linkGrid.replaceChildren(
    ...topology.links.map((link) => {
      const row = document.createElement("div");
      row.className = "link-row";

      const sourceAgent = topology.agents.find((agent) => agent.id === link.sourceAgentId);
      const targetAgent = topology.agents.find((agent) => agent.id === link.targetAgentId);

      const source = document.createElement("strong");
      source.textContent = sourceAgent ? sourceAgent.name : link.sourceAgentId.slice(0, 8);

      const mode = document.createElement("span");
      mode.textContent = link.mode;

      const target = document.createElement("strong");
      target.textContent = targetAgent ? targetAgent.name : link.targetAgentId.slice(0, 8);

      row.append(source, mode, target);
      return row;
    })
  );

  syncLinkFormOptions(topology);

  if (state.providers && ui.providerSummary && ui.providerGrid && ui.providerStats) {
    ui.providerSummary.textContent = String(state.providers.summary.total);
    ui.providerGrid.replaceChildren(
      ...state.providers.providers.slice(0, 12).map((provider) => {
        const row = document.createElement("div");
        row.className = "provider-row";

        const name = document.createElement("strong");
        name.textContent = provider.name;

        const meta = document.createElement("div");
        meta.className = "agent-meta";
        meta.append(createChip(provider.category), createChip(provider.status));

        row.append(name, meta);
        return row;
      })
    );

    ui.providerStats.replaceChildren(
      createKeyValue("local", state.providers.summary.local),
      createKeyValue("cloud", state.providers.summary.cloud),
      createKeyValue("self-hosted", state.providers.summary.selfHosted),
      createKeyValue("routers", state.providers.summary.routers)
    );
  }
};

const loadTopology = async () => {
  const response = await fetch("/api/topology");
  if (!response.ok) {
    throw new Error("Could not load topology.");
  }

  state.topology = await response.json();
  render();
};

const loadProviders = async () => {
  const response = await fetch("/api/providers");
  if (!response.ok) {
    throw new Error("Could not load providers.");
  }

  state.providers = await response.json();
  syncProviderOptions();
  render();
};

ui.agentSearch.addEventListener("input", () => {
  render();
});

ui.agentIsolationFilter.addEventListener("change", () => {
  render();
});

ui.providerInput.addEventListener("change", () => {
  syncModelSuggestions();
});

ui.linkSource.addEventListener("change", () => {
  render();
});

ui.linkTarget.addEventListener("change", () => {
  render();
});

ui.linkMode.addEventListener("change", () => {
  render();
});

ui.linkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(null);

  const sourceAgentId = ui.linkSource.value;
  const targetAgentId = ui.linkTarget.value;
  const mode = ui.linkMode.value;

  if (sourceAgentId === targetAgentId) {
    showError("Source and target must be different agents.");
    return;
  }

  await createLink({ sourceAgentId, targetAgentId, mode });
});

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(null);

  const formData = new FormData(ui.form);
  const payload = {
    name: String(formData.get("name") ?? ""),
    purpose: String(formData.get("purpose") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    model: String(formData.get("model") ?? ""),
    isolationMode: String(formData.get("isolationMode") ?? ""),
    maxConcurrentTasks: Number(formData.get("maxConcurrentTasks") ?? 4),
    peerAccess: formData.get("peerAccess") === "on"
  };

  const response = await fetch("/api/agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json();
    showError(data.error ?? "Could not create the agent.");
    return;
  }

  ui.form.reset();
  ui.providerInput.value = "ollama";
  ui.form.isolationMode.value = "selective";
  ui.form.maxConcurrentTasks.value = "4";
  ui.form.peerAccess.checked = true;
  syncModelSuggestions();
  await loadTopology();
});

Promise.all([loadTopology(), loadProviders()]).catch((error) => {
  showError(error instanceof Error ? error.message : "Unknown error");
});
