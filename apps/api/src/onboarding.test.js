import assert from "node:assert/strict";
import test from "node:test";

import { listProviders } from "../../../packages/shared/src/index.js";
import { getOnboardingSnapshot, listLanUrls } from "./onboarding.js";

test("builds stable LAN urls from non-internal IPv4 interfaces", () => {
  const lanUrls = listLanUrls({
    host: "0.0.0.0",
    port: 4000,
    interfaces: {
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      eth0: [
        { address: "192.168.1.8", family: "IPv4", internal: false },
        { address: "fe80::1", family: "IPv6", internal: false }
      ],
      wlan0: [{ address: "10.0.0.22", family: "IPv4", internal: false }]
    }
  });

  assert.deepEqual(lanUrls, ["http://10.0.0.22:4000", "http://192.168.1.8:4000"]);
});

test("reports first-run onboarding state when only seeded agents exist", () => {
  const snapshot = getOnboardingSnapshot({
    host: "0.0.0.0",
    port: 4000,
    interfaces: {
      eth0: [{ address: "192.168.1.8", family: "IPv4", internal: false }]
    },
    topology: {
      capacity: { maxAgentsPerMachine: 100, activeAgents: 2, supportedLinkModes: ["delegate"] },
      agents: [
        { id: "11111111-1111-4111-8111-111111111111" },
        { id: "22222222-2222-4222-8222-222222222222" }
      ],
      links: [{ sourceAgentId: "11111111-1111-4111-8111-111111111111", targetAgentId: "22222222-2222-4222-8222-222222222222", mode: "delegate" }]
    },
    providers: listProviders()
  });

  assert.equal(snapshot.firstRun, true);
  assert.equal(snapshot.access.lanReachable, true);
  assert.equal(snapshot.checklist.find((item) => item.id === "create-agent").done, false);
  assert.equal(snapshot.checklist.find((item) => item.id === "reach-ui").done, true);
});