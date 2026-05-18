#!/usr/bin/env node

/**
 * Fix Agents Table Properly
 * 
 * This script recreates the agents table with the correct schema
 * while preserving existing data.
 */

import pkg from 'sqlite3';
const { Database } = pkg;

console.log('🔧 Starting agents table proper fix...');

// Database path that the application is actually using
const databasePath = '/app/apps/api/data/zsiistant.sqlite';
console.log('📁 Database path:', databasePath);

// Create database connection
const db = new Database(databasePath);

// Function to backup and recreate agents table
function recreateAgentsTable() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Backing up existing agents data...');
    
    // First, get all existing data
    db.all('SELECT * FROM agents', (err, agents) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`📝 Found ${agents.length} existing agents to backup`);
      
      if (agents.length > 0) {
        // Create backup table
        db.exec('DROP TABLE IF EXISTS agents_backup', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          db.exec('CREATE TABLE agents_backup AS SELECT * FROM agents', (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            console.log('✅ Data backed up to agents_backup');
            
            // Now drop and recreate the main table
            recreateTable(agents, resolve, reject);
          });
        });
      } else {
        // No data to backup, just recreate the table
        recreateTable([], resolve, reject);
      }
    });
  });
}

function recreateTable(agents, resolve, reject) {
  console.log('🔄 Dropping old agents table...');
  
  db.exec('DROP TABLE IF EXISTS agents', (err) => {
    if (err) {
      reject(err);
      return;
    }
    
    console.log('✅ Old table dropped');
    
    console.log('🆕 Creating new agents table with correct schema...');
    
    const createTableSQL = `
      CREATE TABLE agents (
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
        reject(err);
        return;
      }
      
      console.log('✅ New agents table created');
      
      // Restore data if any
      if (agents.length > 0) {
        console.log('🔄 Restoring agent data...');
        
        const insertSQL = `
          INSERT INTO agents (
            id, name, purpose, systemPrompt, status, provider, model, 
            isolationMode, maxConcurrentTasks, peerAccess, toolsConfig, 
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        let insertCount = 0;
        agents.forEach(agent => {
          db.run(insertSQL, [
            agent.id,
            agent.name,
            agent.purpose,
            agent.systemPrompt,
            agent.status,
            agent.provider,
            agent.model,
            agent.isolationMode,
            agent.maxConcurrentTasks,
            agent.peerAccess,
            agent.toolsConfig,
            agent.createdAt,
            agent.updatedAt
          ], (err) => {
            if (err) {
              console.error(`❌ Error inserting agent ${agent.id}:`, err.message);
            } else {
              insertCount++;
            }
            
            if (insertCount === agents.length) {
              console.log(`✅ Restored ${insertCount} agents`);
              resolve();
            }
          });
        });
      } else {
        console.log('✅ No data to restore');
        resolve();
      }
    });
  });
}

// Main function
async function main() {
  try {
    await recreateAgentsTable();
    console.log('🎉 Agents table properly fixed');
    
    // Verify the result
    db.all('PRAGMA table_info(agents)', (err, rows) => {
      if (err) {
        console.error('Error verifying table:', err.message);
      } else {
        console.log('✅ Final agents table columns:');
        rows.forEach(row => {
          console.log(`  - ${row.name}: ${row.type}`);
        });
      }
      
      db.close();
      process.exit(0);
    });
    
  } catch (err) {
    console.error('❌ Fix failed:', err.message);
    db.close();
    process.exit(1);
  }
}

// Run the fix
main();