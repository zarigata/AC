#!/usr/bin/env node

import { createServer } from 'node:http';
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
  
  // Create a simple server
  const server = createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.method === 'GET' && req.url === '/api/agents') {
      try {
        const agents = registry.listAgents();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ agents }));
      } catch (err) {
        console.error('Error in /api/agents:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }
    
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  const PORT = 4001;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server running on http://0.0.0.0:${PORT}`);
    
    // Test the server
    const testUrl = `http://localhost:${PORT}/api/agents`;
    console.log('Testing:', testUrl);
    
    import('node:http').then((httpModule) => {
      const http = httpModule.default;
      http.get(testUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('Response:', data);
          server.close();
        });
      }).on('error', (err) => {
        console.error('Error:', err.message);
        server.close();
      });
    });
  });
  
} catch (error) {
  console.error('Error starting test server:', error.message);
  console.error('Stack:', error.stack);
}