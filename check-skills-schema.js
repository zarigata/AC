import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./apps/api/data/zsiistant.sqlite');

console.log('Skills table schema:');
const schema = db.prepare("PRAGMA table_info(skills)").all();
console.log(schema);

console.log('\nSample skills:');
const sample = db.prepare('SELECT * FROM skills LIMIT 2').all();
console.log(sample);

db.close();