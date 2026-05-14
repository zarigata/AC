/**
 * Topology Routes - Handle system topology API endpoints
 */

export function registerTopologyRoutes(server, registry, providers, failoverChains, settings) {
  /**
   * GET /api/topology - Return system topology including agents, links, and capacity
   */
  const handleTopologyRequest = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    
    // Only handle GET /api/topology
    if (request.method !== "GET" || url.pathname !== "/api/topology") {
      return false;
    }

    try {
      // Get all agents from registry
      const agents = registry.listAgents();
      
      // Get all links from registry
      const links = registry.db.prepare("SELECT * FROM agent_links ORDER BY createdAt DESC").all();
      
      // Get system capacity
      const capacity = {
        activeAgents: agents.length,
        maxAgentsPerMachine: settings?.maxAgentsPerMachine || 100,
        supportedLinkModes: ["isolated", "selective", "mesh"]
      };

      // Create topology response
      const topology = {
        capacity,
        agents: agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          purpose: agent.purpose,
          provider: agent.provider,
          model: agent.model,
          isolationMode: agent.isolationMode || "isolated",
          maxConcurrentTasks: agent.maxConcurrentTasks || 4,
          peerAccess: agent.peerAccess || false,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt
        })),
        links: links.map(link => ({
          sourceAgentId: link.sourceAgentId,
          targetAgentId: link.targetAgentId,
          mode: link.mode
        }))
      };

      // Send response
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(topology));
      return true;

    } catch (error) {
      console.error("Topology route error:", error.message);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to retrieve topology" }));
      return true;
    }
  };

  // Register the route handler
  server.on('request', handleTopologyRequest);
}