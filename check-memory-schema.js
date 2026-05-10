import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./apps/api/data/zsiistant.sqlite');

console.log('Memory table schema:');
const schema = db.prepare("PRAGMA table_info(agent_memory)").all();
console.log(schema);

console.log('\nSample data:');
const sample = db.prepare('SELECT * FROM agent_memory LIMIT 5').all();
console.log(sample);

db.close();