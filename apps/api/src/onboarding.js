import { networkInterfaces } from "node:os";

const preferredProviderIds = ["ollama", "ollama-cloud", "z-ai", "anthropic", "openai"];

const normalizeAddress = (entry) => {
  if (!entry || entry.internal || entry.family !== "IPv4") {
    return null;
  }

  if (entry.address.startsWith("169.254.")) {
    return null;
  }

  return entry.address;
};

export const listLanUrls = ({ host, port, interfaces = networkInterfaces() }) => {
  const addresses = Object.values(interfaces)
    .flat()
    .map(normalizeAddress)
    .filter(Boolean);

  const uniqueAddresses = [...new Set(addresses)].sort((left, right) => left.localeCompare(right));
  const urls = uniqueAddresses.map((address) => `http://${address}:${port}`);

  if (host !== "0.0.0.0" && host !== "::") {
    return urls.filter((url) => url.includes(`://${host}:`));
  }

  return urls;
};

export const getOnboardingSnapshot = ({ host, port, topology, providers, interfaces }) => {
  const localUrl = `http://localhost:${port}`;
  const lanUrls = listLanUrls({ host, port, interfaces });
  const preferredProviders = providers.filter((provider) => preferredProviderIds.includes(provider.id));
  const liveTargetProviders = preferredProviders.filter((provider) => provider.status === "live-target");
  const hasCustomAgent = topology.agents.length > 2;
  const hasCollaborationLink = topology.links.length > 0;
  const hasLanAccess = lanUrls.length > 0;

  return {
    access: {
      bindHost: host,
      localUrl,
      lanUrls,
      lanReachable: hasLanAccess
    },
    providers: {
      preferred: preferredProviders,
      liveTargets: liveTargetProviders.length
    },
    checklist: [
      {
        id: "reach-ui",
        title: "Open RelayCore from another device on the LAN",
        done: hasLanAccess,
        detail: hasLanAccess ? lanUrls[0] : "No LAN address detected yet. Check host binding and local networking."
      },
      {
        id: "pick-provider",
        title: "Start with a lightweight primary provider",
        done: liveTargetProviders.length >= 3,
        detail: "Ollama, Ollama Cloud, and Z.AI stay at the top of the initial routing stack."
      },
      {
        id: "create-agent",
        title: "Create the first operator-defined agent",
        done: hasCustomAgent,
        detail: hasCustomAgent
          ? "A custom agent is already registered."
          : "Use the provisioning form to add a role your team actually needs."
      },
      {
        id: "connect-team",
        title: "Wire the first visible collaboration path",
        done: hasCollaborationLink,
        detail: hasCollaborationLink
          ? "The fleet already has at least one inspectable handoff path."
          : "Create a delegate, message, or observe link so teamwork stays explicit."
      }
    ],
    firstRun: !hasCustomAgent
  };
};