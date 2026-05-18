#!/usr/bin/env node

/**
 * Create Agents Table Script
 * 
 * This script creates the agents table with the correct schema
 * since it's missing entirely from the database.
 */

import pkg from 'sqlite3';
const { Database } = pkg;

console.log('🔧 Starting agents table creation...');

// Database path for container environment
const databasePath = '/app/data/zsiistant.sqlite';
console.log('📁 Database path:', databasePath);

// Create database connection
const db = new Database(databasePath);

// Function to create agents table
function createAgentsTable() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Checking if agents table exists...');
    
    // First check if table exists
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'", (err, tables) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (tables.length > 0) {
        console.log('✅ Agents table already exists');
        resolve();
      } else {
        console.log('⚠️ Agents table missing, creating...');
        
        // Create the table with the correct schema
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            purpose TEXT NOT NULL,
            systemPrompt TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            isolationMode TEXT NOT NULL DEFAULT 'isolated',
            maxConcurrentTasks INTEGER NOT NULL DEFAULT 4,
            peerAccess INTEGER NOT NULL DEFAULT 0,
            toolsConfig TEXT DEFAULT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
          CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider);
          CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(createdAt);
        `;
        
        db.exec(createTableSQL, (err) => {
          if (err) {
            console.error('❌ Failed to create agents table:', err.message);
            reject(err);
          } else {
            console.log('✅ Agents table created successfully');
            resolve();
          }
        });
      }
    });
  });
}

// Main function
async function main() {
  try {
    await createAgentsTable();
    console.log('🎉 Agents table setup completed');
    
    // Close database
    db.close();
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    db.close();
    process.exit(1);
  }
}

// Run the setup
main();