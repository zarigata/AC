const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./apps/api/data/zsiistant.sqlite');

console.log('Skills table schema:');
const schema = db.prepare("PRAGMA table_info(skills)").all();
console.log(schema);

db.close();