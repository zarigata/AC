export function sendMessage(registry, input) {
  return registry.sendMessage(input);
}

export function getMessagesForAgent(registry, agentId) {
  return registry.getMessagesForAgent(agentId);
}

export function getConversation(registry, agent1, agent2) {
  return registry.getConversation(agent1, agent2);
}
