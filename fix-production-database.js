#!/usr/bin/env node

/**
 * Fix Production Database Script
 * 
 * This script adds missing columns to the production database
 * that the application is actually using.
 */

import pkg from 'sqlite3';
const { Database } = pkg;

console.log('🔧 Starting production database fix...');

// Database path that the application is actually using
const databasePath = '/app/apps/api/data/zsiistant.sqlite';
console.log('📁 Database path:', databasePath);

// Create database connection
const db = new Database(databasePath);

// Function to add missing columns
function addMissingColumn(tableName, columnName, columnDefinition) {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Checking column ${columnName} in table ${tableName}...`);
    
    // Check if column exists
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
        return;
      }
      
      const columnExists = columns.some(col => col.name === columnName);
      
      if (columnExists) {
        console.log(`✅ Column ${columnName} already exists`);
        resolve();
      } else {
        console.log(`⚠️ Column ${columnName} missing, adding...`);
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`, (err) => {
          if (err) {
            console.error(`❌ Failed to add column ${columnName}:`, err.message);
            reject(err);
          } else {
            console.log(`✅ Successfully added column ${columnName}`);
            resolve();
          }
        });
      }
    });
  });
}

// Main fix function
async function fixDatabase() {
  try {
    console.log('🔍 Checking database structure...');
    
    // Check if agents table exists
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='agents'`, (err, tables) => {
      if (err) {
        throw err;
      }
      
      if (tables.length === 0) {
        console.log('❌ Agents table does not exist');
        process.exit(1);
      }
      
      console.log('✅ Agents table exists');
      
      // Add missing columns if they don't exist
      const columnsToAdd = [
        { name: 'systemPrompt', definition: 'TEXT DEFAULT NULL' },
        { name: 'toolsConfig', definition: 'TEXT DEFAULT NULL' }
      ];
      
      let fixCount = 0;
      
      columnsToAdd.forEach(({ name, definition }) => {
        addMissingColumn('agents', name, definition)
          .then(() => fixCount++)
          .catch(err => {
            console.error(`❌ Error fixing column ${name}:`, err.message);
          });
      });
      
      // Close database after a short delay to let all operations complete
      setTimeout(() => {
        console.log(`🎉 Database fix completed. ${fixCount} columns added/verified`);
        db.close();
        process.exit(0);
      }, 2000);
    });
    
  } catch (err) {
    console.error('❌ Database fix failed:', err.message);
    db.close();
    process.exit(1);
  }
}

// Run the fix
fixDatabase();