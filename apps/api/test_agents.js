#!/usr/bin/env node

// Simple test script to check if the agents endpoint works
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databasePath = join(__dirname, 'data/zsiistant.sqlite');

try {
  // Import registry
  const { AgentRegistry } = await import('./src/registry.js');
  
  // Create registry instance
  const registry = new AgentRegistry({ databasePath });
  
  // Test listing agents
  const agents = registry.listAgents();
  console.log('Found agents:', agents.length);
  console.log('Agents:', agents);
  
  // Test creating an agent
  const newAgent = registry.createAgent({
    id: 'test-agent-2',
    name: 'Test Agent 2',
    purpose: 'Testing basic functionality',
    provider: 'ollama',
    model: 'llama3.1:8b',
    isolationMode: 'isolated',
    maxConcurrentTasks: 8,
    peerAccess: false
  });
  console.log('Created agent:', newAgent);
  
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}