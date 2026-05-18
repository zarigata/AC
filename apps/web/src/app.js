/* Zazi // Phase 3 frontend — vanilla JS, no build tools */

const state = {
  topology: null,
  providers: null,
  presets: {},
  collapsedNodes: new Set(),
  selectedCommAgentId: null,
  commPollInterval: null
};

const ui = {
  activeAgents: document.getElementById("active-agents"),
  maxAgents: document.getElementById("max-agents"),
  machineActiveAgents: document.getElementById("machine-active-agents"),
  machineMaxAgents: document.getElementById("machine-max-agents"),
  linkModes: document.getElementById("link-modes"),
  agentTree: document.getElementById("agent-tree"),
  linkGrid: document.getElementById("link-grid"),
  form: document.getElementById("agent-form"),
  linkForm: document.getElementById("link-form"),
  error: document.getElementById("error"),
  providerReadyCount: document.getElementById("provider-ready-count"),
  providerReadinessList: document.getElementById("provider-readiness-list"),
  providerSelect: document.getElementById("agent-provider"),
  providerModelInput: document.getElementById("agent-model"),
  providerHint: document.getElementById("provider-hint"),
  linkSource: document.getElementById("link-source"),
  linkTarget: document.getElementById("link-target"),
  linkMode: document.getElementById("link-mode"),
  themeToggle: document.getElementById("theme-toggle"),
  presetSelect: document.getElementById("agent-preset"),
  agentLevel: document.getElementById("agent-level"),
  agentMaxSub: document.getElementById("agent-max-sub"),
  commLog: document.getElementById("comm-log"),
  commAgentLabel: document.getElementById("comm-agent-label"),
  commOverlay: document.getElementById("comm-overlay"),
  commOverlayTitle: document.getElementById("comm-overlay-title"),
  commOverlayBody: document.getElementById("comm-overlay-body"),
  commOverlayClose: document.getElementById("comm-overlay-close")
};

/* ============================================================
   Helpers
   ============================================================ */

const showError = (message) => {
  if (!ui.error) return;
  ui.error.hidden = !message;
  ui.error.textContent = message ?? "";
};

const createChip = (text, className = "") => {
  const chip = document.createElement("span");
  chip.textContent = text;
  if (className) chip.className = className;
  return chip;
};

const createEmptyState = (message) => {
  const row = document.createElement("div");
  row.className = "empty-state";
  row.textContent = message;
  return row;
};

const getProvidersSorted = () => {
  if (!state.providers) return [];
  return [...state.providers.providers].sort((a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    return ap !== bp ? ap - bp : a.name.localeCompare(b.name);
  });
};

const getAgentName = (id) => {
  for (const root of state.topology?.hierarchy ?? []) {
    if (root.id === id) return root.name;
    for (const child of root.children ?? []) {
      if (child.id === id) return child.name;
      for (const sub of child.children ?? []) {
        if (sub.id === id) return sub.name;
      }
    }
  }
  return id ? `${id.slice(0, 8)}…` : "unknown";
};

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
};

/* ============================================================
   Theme Toggle
   ============================================================ */

const initTheme = () => {
  const saved = localStorage.getItem("zazi-theme");
  const theme = saved === "modern" ? "modern" : "retro";
  document.documentElement.setAttribute("data-theme", theme);
  ui.themeToggle.textContent = theme === "retro" ? "🕹️ Retro" : "💼 Modern";
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute("data-theme") || "retro";
  const next = current === "retro" ? "modern" : "retro";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("zazi-theme", next);
  ui.themeToggle.textContent = next === "retro" ? "🕹️ Retro" : "💼 Modern";
};

ui.themeToggle?.addEventListener("click", toggleTheme);

/* ============================================================
   Presets
   ============================================================ */

const loadPresets = async () => {
  try {
    const res = await fetch("/api/presets");
    if (!res.ok) return;
    const data = await res.json();
    state.presets = data.presets || {};
  } catch {
    // silently fail, presets are optional
  }
};

const applyPreset = (name) => {
  const p = state.presets[name];
  if (!p) return;

  const form = ui.form;
  if (p.purpose && form.purpose) form.purpose.value = p.purpose;
  if (p.provider && form.provider) form.provider.value = p.provider;
  if (p.model && form.model) form.model.value = p.model;
  if (p.isolationMode && form.isolationMode) form.isolationMode.value = p.isolationMode;
  if (p.maxConcurrentTasks !== undefined && form.maxConcurrentTasks) form.maxConcurrentTasks.value = String(p.maxConcurrentTasks);
  if (p.peerAccess !== undefined && form.peerAccess) form.peerAccess.checked = Boolean(p.peerAccess);
  if (p.level && ui.agentLevel) ui.agentLevel.value = p.level;
  if (p.maxSubAgents !== undefined && ui.agentMaxSub) ui.agentMaxSub.value = String(p.maxSubAgents);

  syncProviderHint();
};

ui.presetSelect?.addEventListener("change", () => applyPreset(ui.presetSelect.value));

/* ============================================================
   Provider hints
   ============================================================ */

const syncProviderHint = () => {
  const provider = getProvidersSorted().find((e) => e.id === ui.providerSelect.value);
  if (!provider) {
    ui.providerHint.textContent = "Recommended model will appear when you pick a provider.";
    return;
  }
  ui.providerHint.textContent = provider.suggestedModel
    ? `Suggested model: ${provider.suggestedModel}`
    : "No default model is pinned for this provider yet.";
};

const applyProviderDefaultModel = ({ force = false } = {}) => {
  const provider = getProvidersSorted().find((e) => e.id === ui.providerSelect.value);
  if (!provider?.suggestedModel) {
    syncProviderHint();
    return;
  }
  if (force || !ui.providerModelInput.value.trim()) {
    ui.providerModelInput.value = provider.suggestedModel;
  }
  syncProviderHint();
};

ui.providerSelect?.addEventListener("change", () => applyProviderDefaultModel({ force: true }));

/* ============================================================
   Rendering
   ============================================================ */

const renderProviderOptions = () => {
  if (!ui.providerSelect) return;
  const selected = ui.providerSelect.value;
  const providers = getProvidersSorted();
  ui.providerSelect.replaceChildren(
    ...providers.map((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const readiness = p.priority ? p.readiness : p.status;
      opt.textContent = `${p.name} (${readiness})`;
      opt.selected = p.id === selected || (!selected && p.id === "ollama");
      return opt;
    })
  );
  if (!ui.providerSelect.value && providers.length > 0) {
    ui.providerSelect.value = providers[0].id;
  }
  applyProviderDefaultModel({ force: !selected });
};

const renderProviderReadiness = () => {
  if (!state.providers || !ui.providerReadyCount || !ui.providerReadinessList) return;
  ui.providerReadyCount.textContent = `${state.providers.readiness.firstWave.configured}/${state.providers.readiness.firstWave.total}`;
  ui.providerReadinessList.replaceChildren(
    ...state.providers.readiness.providers.map((p) => {
      const row = document.createElement("div");
      row.className = "provider-row readiness-row";
      const title = document.createElement("strong");
      title.textContent = `${p.priority}. ${p.name}`;
      const meta = document.createElement("div");
      meta.className = "agent-meta";
      meta.append(
        createChip(p.configured ? "configured" : "pending"),
        createChip(p.transport),
        createChip(p.readiness)
      );
      row.append(title, meta);
      return row;
    })
  );
};

const renderLinkForm = () => {
  const topology = state.topology;
  if (!topology || !ui.linkSource || !ui.linkTarget || !ui.linkMode) return;

  const { agents, capacity } = topology;
  ui.linkMode.replaceChildren(
    ...capacity.supportedLinkModes.map((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      return opt;
    })
  );

  const opts = agents.map((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.name} · ${a.provider} · ${a.model}`;
    return opt;
  });
  ui.linkSource.replaceChildren(...opts.map((o) => o.cloneNode(true)));
  ui.linkTarget.replaceChildren(...opts.map((o) => o.cloneNode(true)));

  const enough = agents.length >= 2;
  Array.from(ui.linkForm.elements).forEach((el) => (el.disabled = !enough));
  if (enough) {
    ui.linkSource.selectedIndex = 0;
    ui.linkTarget.selectedIndex = Math.min(1, agents.length - 1);
  }
};

/* ============================================================
   Tree Rendering
   ============================================================ */

const TreeActions = (agent, onCreateSub, onDelete, onMessage) => {
  const actions = document.createElement("div");
  actions.className = "tree-actions";

  if (agent.level !== "sub-agent") {
    const subBtn = document.createElement("button");
    subBtn.className = "tree-action-btn";
    subBtn.textContent = "+ Sub-agent";
    subBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onCreateSub(agent);
    });
    actions.append(subBtn);
  }

  const msgBtn = document.createElement("button");
  msgBtn.className = "tree-action-btn";
  msgBtn.textContent = "Message";
  msgBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onMessage(agent);
  });
  actions.append(msgBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "tree-action-btn";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete(agent);
  });
  actions.append(delBtn);

  return actions;
};

const StatusDot = (status) => {
  const dot = document.createElement("span");
  dot.className = `status-dot ${status || "idle"}`;
  dot.title = status || "idle";
  return dot;
};

const LevelBadge = (level) => {
  const badge = document.createElement("span");
  badge.className = `level-badge ${level}`;
  badge.textContent = level;
  return badge;
};

const renderTreeNode = (node, depth = 0) => {
  const branch = document.createElement("div");
  branch.className = "tree-branch";

  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = state.collapsedNodes.has(node.id);

  const nodeEl = document.createElement("div");
  nodeEl.className = "tree-node";
  if (depth > 0) {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-indent-line";
    wrapper.style.paddingLeft = `${22 + (depth - 1) * 18}px`;
    wrapper.appendChild(nodeEl);
    branch.appendChild(wrapper);
  } else {
    branch.appendChild(nodeEl);
  }

  const toggle = document.createElement("button");
  toggle.className = "tree-toggle-btn";
  toggle.textContent = hasChildren ? (isCollapsed ? "▶" : "▼") : "•";
  toggle.addEventListener("click", () => {
    if (hasChildren) {
      if (isCollapsed) state.collapsedNodes.delete(node.id);
      else state.collapsedNodes.add(node.id);
      render(); // re-render tree
    }
  });
  nodeEl.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "tree-node-body";
  const title = document.createElement("div");
  title.className = "tree-node-title";
  title.appendChild(StatusDot(node.status));
  title.appendChild(document.createTextNode(node.name));
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "tree-node-meta";
  meta.appendChild(LevelBadge(node.level));
  meta.appendChild(document.createTextNode(`${node.provider} / ${node.model}`));
  const subCount = document.createElement("span");
  subCount.className = "sub-count";
  const childrenLen = node.children?.length ?? 0;
  subCount.textContent = childrenLen ? `${childrenLen} sub${childrenLen === 1 ? "" : "s"}` : "";
  if (childrenLen) meta.appendChild(subCount);
  body.appendChild(meta);
  nodeEl.appendChild(body);

  const actions = TreeActions(
    node,
    (agent) => openSubAgentModal(agent),
    async (agent) => {
      if (!confirm(`Delete agent “${agent.name}”?`)) return;
      try {
        await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
        state.collapsedNodes.delete(agent.id);
        await loadTopology();
      } catch {
        showError("Could not delete agent.");
      }
    },
    async (agent) => {
      state.selectedCommAgentId = agent.id;
      await refreshCommLog();
    }
  );
  nodeEl.appendChild(actions);

  if (hasChildren && !isCollapsed) {
    for (const child of node.children) {
      branch.appendChild(renderTreeNode(child, depth + 1));
    }
  }

  return branch;
};

/* ============================================================
   Sub-agent Modal
   ============================================================ */

const openSubAgentModal = (parentAgent) => {
  const existing = document.getElementById("sub-agent-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "sub-agent-modal";
  overlay.style.zIndex = "850";

  const content = document.createElement("div");
  content.className = "modal-content";

  const bar = document.createElement("div");
  bar.className = "window-bar";
  bar.innerHTML = `
    <span>sub_agent_wizard.exe</span>
    <button class="modal-close" id="sub-modal-close" type="button">×</button>
  `;

  const body = document.createElement("div");
  body.className = "modal-body";
  body.innerHTML = `
    <div class="section-label">Provisioning</div>
    <h2>Create sub-agent for ${parentAgent.name}</h2>
    <p class="muted">Provider inherited from parent. Level locked to sub-agent.</p>
    <form class="form-grid" id="sub-agent-form">
      <label>Name
        <input name="name" required minlength="2" maxlength="80" />
      </label>
      <label>Purpose
        <textarea name="purpose" required minlength="10" maxlength="240"></textarea>
      </label>
      <label>Provider
        <select name="provider" disabled>
          <option value="${parentAgent.provider}" selected>${parentAgent.provider}</option>
        </select>
      </label>
      <label>Model
        <input name="model" value="${parentAgent.model}" required />
      </label>
      <label>Isolation mode
        <select name="isolationMode">
          <option value="isolated">isolated</option>
          <option value="selective" selected>selective</option>
          <option value="mesh">mesh</option>
        </select>
      </label>
      <label>Max concurrent tasks
        <input name="maxConcurrentTasks" type="number" min="1" max="32" value="2" />
      </label>
      <label class="toggle">
        <input name="peerAccess" type="checkbox" />
        Allow peer access
      </label>
      <input type="hidden" name="parentId" value="${parentAgent.id}" />
      <input type="hidden" name="level" value="sub-agent" />
      <input type="hidden" name="maxSubAgents" value="0" />
      <button class="primary" type="submit">Create sub-agent</button>
    </form>
  `;

  content.append(bar, body);
  overlay.append(content);
  document.body.append(overlay);

  document.getElementById("sub-modal-close")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById("sub-agent-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const payload = {
      name: String(fd.get("name") ?? ""),
      purpose: String(fd.get("purpose") ?? ""),
      provider: String(fd.get("provider") ?? ""),
      model: String(fd.get("model") ?? ""),
      isolationMode: String(fd.get("isolationMode") ?? ""),
      maxConcurrentTasks: Number(fd.get("maxConcurrentTasks") ?? 2),
      peerAccess: fd.get("peerAccess") === "on",
      level: String(fd.get("level") ?? "sub-agent"),
      parentId: String(fd.get("parentId") ?? ""),
      maxSubAgents: Number(fd.get("maxSubAgents") ?? 0)
    };
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error ?? "Could not create sub-agent.");
        return;
      }
      overlay.remove();
      await loadTopology();
    } catch {
      showError("Could not create sub-agent.");
    }
  });
};

/* ============================================================
   Communication Panel
   ============================================================ */

const refreshCommLog = async () => {
  const topology = state.topology;
  if (!topology) return;

  // Default to first orchestrator, or first agent
  let agentId = state.selectedCommAgentId;
  if (!agentId) {
    const firstRoot = topology.hierarchy?.find((r) => r.level === "orchestrator");
    agentId = firstRoot?.id ?? topology.agents[0]?.id;
  }
  if (!agentId) return;

  state.selectedCommAgentId = agentId;
  const name = getAgentName(agentId);
  ui.commAgentLabel.textContent = `Messages for ${name}`;

  try {
    const res = await fetch(`/api/agents/${agentId}/messages`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const msgs = data.messages || [];

    if (msgs.length === 0) {
      ui.commLog.innerHTML = `<div class="empty-state">No messages yet.</div>`;
      return;
    }

    ui.commLog.replaceChildren(
      ...msgs.map((m) => {
        const entry = document.createElement("div");
        entry.className = `comm-entry ${m.fromAgentId === agentId ? "sent" : "received"}`;
        const header = document.createElement("div");
        header.className = "comm-entry-header";
        const fromTo = document.createElement("div");
        fromTo.className = "comm-from-to";
        fromTo.textContent = `${getAgentName(m.fromAgentId)} → ${getAgentName(m.toAgentId)}`;
        const ts = document.createElement("div");
        ts.className = "comm-timestamp";
        ts.textContent = formatTime(m.createdAt);
        header.append(fromTo, ts);

        const preview = document.createElement("div");
        preview.className = "comm-preview";
        preview.textContent = m.content.slice(0, 120) + (m.content.length > 120 ? "…" : "");
        entry.append(header, preview);

        entry.addEventListener("click", async () => {
          await showConversation(m.fromAgentId, m.toAgentId);
        });
        return entry;
      })
    );
  } catch {
    ui.commLog.innerHTML = `<div class="empty-state">Could not load messages.</div>`;
  }
};

const showConversation = async (a, b) => {
  try {
    const res = await fetch(`/api/agents/${a}/conversation/${b}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const msgs = data.messages || [];

    ui.commOverlayTitle.textContent = `Conversation: ${getAgentName(a)} ↔ ${getAgentName(b)}`;
    ui.commOverlayBody.replaceChildren(
      ...msgs.map((m) => {
        const isSent = m.fromAgentId === a;
        const bubble = document.createElement("div");
        bubble.className = `comm-bubble ${isSent ? "sent" : "received"}`;
        bubble.style.alignSelf = isSent ? "flex-end" : "flex-start";

        const head = document.createElement("div");
        head.className = "comm-bubble-header";
        head.textContent = `${formatTime(m.createdAt)} · ${getAgentName(m.fromAgentId)} → ${getAgentName(m.toAgentId)}`;

        const body = document.createElement("div");
        body.textContent = m.content;
        bubble.append(head, body);
        return bubble;
      })
    );
    ui.commOverlay.hidden = false;
  } catch {
    showError("Could not load conversation.");
  }
};

ui.commOverlayClose?.addEventListener("click", () => {
  ui.commOverlay.hidden = true;
});
ui.commOverlay?.addEventListener("click", (e) => {
  if (e.target === ui.commOverlay) ui.commOverlay.hidden = true;
});

/* ============================================================
   Main Render
   ============================================================ */

const render = () => {
  const topology = state.topology;
  if (!topology) return;

  ui.activeAgents.textContent = String(topology.capacity.activeAgents);
  ui.maxAgents.textContent = String(topology.capacity.maxAgentsPerMachine);
  ui.machineActiveAgents.textContent = String(topology.capacity.activeAgents);
  ui.machineMaxAgents.textContent = String(topology.capacity.maxAgentsPerMachine);

  ui.linkModes.replaceChildren(
    ...topology.capacity.supportedLinkModes.map((mode) => {
      const li = document.createElement("li");
      li.textContent = mode;
      return li;
    })
  );

  // Agent tree
  ui.agentTree.replaceChildren(
    ...(topology.hierarchy.length > 0
      ? topology.hierarchy.map((root) => renderTreeNode(root, 0))
      : [createEmptyState("No agents registered yet.")])
  );

  // Links flat view
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

  // Providers
  const providerSummaryEl = document.getElementById("provider-summary");
  const providerGrid = document.getElementById("provider-grid");
  if (state.providers && providerSummaryEl && providerGrid) {
    providerSummaryEl.textContent = `${state.providers.summary.total} providers planned`;
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

/* ============================================================
   Data Loading
   ============================================================ */

const loadTopology = async () => {
  const res = await fetch("/api/topology");
  if (!res.ok) throw new Error("Could not load topology.");
  state.topology = await res.json();
  render();
};

const loadProviders = async () => {
  const res = await fetch("/api/providers");
  if (!res.ok) throw new Error("Could not load providers.");
  state.providers = await res.json();
  render();
};

/* ============================================================
   Forms
   ============================================================ */

ui.form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError(null);
  const fd = new FormData(ui.form);
  const preset = ui.presetSelect.value;
  const payload = {
    name: String(fd.get("name") ?? ""),
    purpose: String(fd.get("purpose") ?? ""),
    provider: String(fd.get("provider") ?? ""),
    model: String(fd.get("model") ?? ""),
    isolationMode: String(fd.get("isolationMode") ?? ""),
    maxConcurrentTasks: Number(fd.get("maxConcurrentTasks") ?? 4),
    peerAccess: fd.get("peerAccess") === "on",
    level: String(fd.get("level") ?? "agent"),
    maxSubAgents: Number(fd.get("maxSubAgents") ?? 5)
  };
  if (preset && preset !== "custom") {
    payload.preset = preset;
  }

  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showError(data.error ?? "Could not create the agent.");
    return;
  }

  ui.form.reset();
  if (ui.form.isolationMode) ui.form.isolationMode.value = "selective";
  if (ui.form.maxConcurrentTasks) ui.form.maxConcurrentTasks.value = "4";
  if (ui.form.peerAccess) ui.form.peerAccess.checked = true;
  if (ui.presetSelect) ui.presetSelect.value = "custom";
  renderProviderOptions();
  await loadTopology();
});

ui.linkForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError(null);
  const fd = new FormData(ui.linkForm);
  const payload = {
    sourceAgentId: String(fd.get("sourceAgentId") ?? ""),
    targetAgentId: String(fd.get("targetAgentId") ?? ""),
    mode: String(fd.get("mode") ?? "")
  };
  const res = await fetch("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showError(data.error ?? "Could not create the link.");
    return;
  }
  await loadTopology();
});

/* ============================================================
   Boot
   ============================================================ */

initTheme();

Promise.all([loadTopology(), loadProviders(), loadPresets()])
  .then(() => {
    refreshCommLog();
    state.commPollInterval = setInterval(refreshCommLog, 5000);
  })
  .catch((err) => {
    showError(err instanceof Error ? err.message : "Unknown error");
  });

window.addEventListener("beforeunload", () => {
  if (state.commPollInterval) clearInterval(state.commPollInterval);
});
