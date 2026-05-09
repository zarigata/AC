#!/usr/bin/env node

// Test the listAgents method specifically
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
  console.log('Agents:', JSON.stringify(agents, null, 2));
  
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}