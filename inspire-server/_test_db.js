const db = require('./db');
const conn = db.getDb();
const stats = db.getStats();
console.log(JSON.stringify(stats));
db.close();
