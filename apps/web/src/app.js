const state = {
  topology: null,
  providers: null
};

const providerLabel = (provider) => {
  const readiness = provider.priority ? provider.readiness : provider.status;
  return `${provider.name} (${readiness})`;
};

const ui = {
  activeAgents: document.querySelector("#active-agents"),
  maxAgents: document.querySelector("#max-agents"),
  machineActiveAgents: document.querySelector("#machine-active-agents"),
  machineMaxAgents: document.querySelector("#machine-max-agents"),
  linkModes: document.querySelector("#link-modes"),
  agentGrid: document.querySelector("#agent-grid"),
  linkGrid: document.querySelector("#link-grid"),
  form: document.querySelector("#agent-form"),
  linkForm: document.querySelector("#link-form"),
  error: document.querySelector("#error"),
  providerReadyCount: document.querySelector("#provider-ready-count"),
  providerReadinessList: document.querySelector("#provider-readiness-list"),
  providerSelect: document.querySelector("#agent-provider"),
  providerModelInput: document.querySelector("#agent-model"),
  providerHint: document.querySelector("#provider-hint"),
  linkSource: document.querySelector("#link-source"),
  linkTarget: document.querySelector("#link-target"),
  linkMode: document.querySelector("#link-mode")
};

const showError = (message) => {
  ui.error.hidden = !message;
  ui.error.textContent = message ?? "";
};

const createChip = (text, className = "") => {
  const chip = document.createElement("span");
  chip.textContent = text;
  if (className) {
    chip.className = className;
  }
  return chip;
};

const createEmptyState = (message) => {
  const row = document.createElement("div");
  row.className = "empty-state";
  row.textContent = message;
  return row;
};

const getProvidersSorted = () => {
  if (!state.providers) {
    return [];
  }

  return [...state.providers.providers].sort((left, right) => {
    const leftPriority = left.priority ?? Number.POSITIVE_INFINITY;
    const rightPriority = right.priority ?? Number.POSITIVE_INFINITY;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.name.localeCompare(right.name);
  });
};

const getAgentName = (agentId) => {
  const agents = state.topology?.agents ?? [];
  return agents.find((agent) => agent.id === agentId)?.name ?? `${agentId.slice(0, 8)}...`;
};

const syncProviderHint = () => {
  const provider = getProvidersSorted().find((entry) => entry.id === ui.providerSelect.value);
  if (!provider) {
    ui.providerHint.textContent = "Recommended model will appear when you pick a provider.";
    return;
  }

  if (provider.suggestedModel) {
    ui.providerHint.textContent = `Suggested model: ${provider.suggestedModel}`;
    return;
  }

  ui.providerHint.textContent = "No default model is pinned for this provider yet.";
};

const applyProviderDefaultModel = ({ force = false } = {}) => {
  const provider = getProvidersSorted().find((entry) => entry.id === ui.providerSelect.value);
  if (!provider?.suggestedModel) {
    syncProviderHint();
    return;
  }

  if (force || !ui.providerModelInput.value.trim()) {
    ui.providerModelInput.value = provider.suggestedModel;
  }

  syncProviderHint();
};

const renderProviderReadiness = () => {
  if (!state.providers || !ui.providerReadyCount || !ui.providerReadinessList) {
    return;
  }

  const { readiness } = state.providers;
  ui.providerReadyCount.textContent = `${readiness.firstWave.configured}/${readiness.firstWave.total}`;

  ui.providerReadinessList.replaceChildren(
    ...readiness.providers.map((provider) => {
      const row = document.createElement("div");
      row.className = "provider-row readiness-row";

      const title = document.createElement("strong");
      title.textContent = `${provider.priority}. ${provider.name}`;

      const meta = document.createElement("div");
      meta.className = "agent-meta";
      meta.append(
        createChip(provider.configured ? "configured" : "pending"),
        createChip(provider.transport),
        createChip(provider.readiness)
      );

      row.append(title, meta);
      return row;
    })
  );
};

const renderProviderOptions = () => {
  if (!ui.providerSelect) {
    return;
  }

  const selected = ui.providerSelect.value;
  const providers = getProvidersSorted();
  ui.providerSelect.replaceChildren(
    ...providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = providerLabel(provider);
      option.selected = provider.id === selected || (!selected && provider.id === "ollama");
      return option;
    })
  );

  if (!ui.providerSelect.value && providers.length > 0) {
    ui.providerSelect.value = providers[0].id;
  }

  applyProviderDefaultModel({ force: !selected });
};

const renderLinkForm = () => {
  if (!state.topology || !ui.linkSource || !ui.linkTarget || !ui.linkMode) {
    return;
  }

  const { agents, capacity } = state.topology;

  ui.linkMode.replaceChildren(
    ...capacity.supportedLinkModes.map((mode) => {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode;
      return option;
    })
  );

  const options = agents.map((agent) => {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = `${agent.name} · ${agent.provider} · ${agent.model}`;
    return option;
  });

  ui.linkSource.replaceChildren(...options.map((option) => option.cloneNode(true)));
  ui.linkTarget.replaceChildren(...options.map((option) => option.cloneNode(true)));

  const enoughAgents = agents.length >= 2;
  Array.from(ui.linkForm.elements).forEach((element) => {
    element.disabled = !enoughAgents;
  });

  if (enoughAgents) {
    ui.linkSource.selectedIndex = 0;
    ui.linkTarget.selectedIndex = Math.min(1, agents.length - 1);
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

  ui.linkModes.replaceChildren(
    ...topology.capacity.supportedLinkModes.map((mode) => {
      const item = document.createElement("li");
      item.textContent = mode;
      return item;
    })
  );

  ui.agentGrid.replaceChildren(
    ...(topology.agents.length > 0
      ? topology.agents.map((agent) => {
          const row = document.createElement("article");
          row.className = "agent-row";

          const primary = document.createElement("div");
          const title = document.createElement("h3");
          title.textContent = agent.name;
          const text = document.createElement("p");
          text.textContent = agent.purpose;
          primary.append(title, text);

          const meta = document.createElement("div");
          meta.className = "agent-meta";
          meta.append(
            createChip(agent.provider),
            createChip(agent.model),
            createChip(agent.isolationMode),
            createChip(agent.peerAccess ? "peer-enabled" : "isolated")
          );

          row.append(primary, meta);
          return row;
        })
      : [createEmptyState("No agents registered yet.")])
  );

  ui.linkGrid.replaceChildren(
    ...(topology.links.length > 0
      ? topology.links.map((link) => {
          const row = document.createElement("div");
          row.className = "link-row named-link-row";
          row.append(
            createChip(getAgentName(link.sourceAgentId), "name-chip"),
            createChip(link.mode),
            createChip(getAgentName(link.targetAgentId), "name-chip")
          );
          return row;
        })
      : [createEmptyState("No links yet. Create the first communication path on the right.")])
  );

  const providerSummary = document.querySelector("#provider-summary");
  const providerGrid = document.querySelector("#provider-grid");
  if (state.providers && providerSummary && providerGrid) {
    providerSummary.textContent = `${state.providers.summary.total} providers planned`;
    providerGrid.replaceChildren(
      ...getProvidersSorted().slice(0, 12).map((provider) => {
        const row = document.createElement("div");
        row.className = "provider-row";

        const name = document.createElement("strong");
        name.textContent = provider.name;

        const meta = document.createElement("div");
        meta.className = "agent-meta";
        meta.append(
          createChip(provider.category),
          createChip(provider.priority ? provider.readiness : provider.status),
          ...(provider.suggestedModel ? [createChip(provider.suggestedModel)] : [])
        );

        row.append(name, meta);
        return row;
      })
    );
  }

  renderProviderOptions();
  renderProviderReadiness();
  renderLinkForm();
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
  render();
};

ui.providerSelect?.addEventListener("change", () => {
  applyProviderDefaultModel({ force: true });
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
  ui.form.isolationMode.value = "selective";
  ui.form.maxConcurrentTasks.value = "4";
  ui.form.peerAccess.checked = true;
  renderProviderOptions();
  await loadTopology();
});

ui.linkForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(null);

  const formData = new FormData(ui.linkForm);
  const payload = {
    sourceAgentId: String(formData.get("sourceAgentId") ?? ""),
    targetAgentId: String(formData.get("targetAgentId") ?? ""),
    mode: String(formData.get("mode") ?? "")
  };

  const response = await fetch("/api/links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json();
    showError(data.error ?? "Could not create the link.");
    return;
  }

  await loadTopology();
});

Promise.all([loadTopology(), loadProviders()]).catch((error) => {
  showError(error instanceof Error ? error.message : "Unknown error");
});