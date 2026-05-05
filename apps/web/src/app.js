const state = {
  topology: null,
  providers: null
};

const ui = {
  activeAgents: document.querySelector("#active-agents"),
  maxAgents: document.querySelector("#max-agents"),
  linkModes: document.querySelector("#link-modes"),
  agentGrid: document.querySelector("#agent-grid"),
  linkGrid: document.querySelector("#link-grid"),
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

const render = () => {
  const topology = state.topology;
  if (!topology) {
    return;
  }

  ui.activeAgents.textContent = String(topology.capacity.activeAgents);
  ui.maxAgents.textContent = String(topology.capacity.maxAgentsPerMachine);

  ui.linkModes.replaceChildren(
    ...topology.capacity.supportedLinkModes.map((mode) => {
      const item = document.createElement("li");
      item.textContent = mode;
      return item;
    })
  );

  ui.agentGrid.replaceChildren(
    ...topology.agents.map((agent) => {
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
  );

  ui.linkGrid.replaceChildren(
    ...topology.links.map((link) => {
      const row = document.createElement("div");
      row.className = "link-row";
      row.append(
        createChip(link.sourceAgentId.slice(0, 8)),
        createChip(link.mode),
        createChip(link.targetAgentId.slice(0, 8))
      );
      return row;
    })
  );

  const providerSummary = document.querySelector("#provider-summary");
  const providerGrid = document.querySelector("#provider-grid");
  if (state.providers && providerSummary && providerGrid) {
    providerSummary.textContent = `${state.providers.summary.total} providers planned`;
    providerGrid.replaceChildren(
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
  render();
};

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
  ui.form.provider.value = "openai";
  ui.form.model.value = "gpt-5.4";
  ui.form.isolationMode.value = "selective";
  ui.form.maxConcurrentTasks.value = "4";
  ui.form.peerAccess.checked = true;
  await loadTopology();
});

Promise.all([loadTopology(), loadProviders()]).catch((error) => {
  showError(error instanceof Error ? error.message : "Unknown error");
});
