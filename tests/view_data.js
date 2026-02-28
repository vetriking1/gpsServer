const Database = require('better-sqlite3');

const db = new Database('gps_tracker.db', { readonly: true });

console.log('\n=== LOCATION DATA ===');
const locations = db.prepare('SELECT * FROM location_data ORDER BY received_at DESC LIMIT 10').all();
console.table(locations);

console.log('\n=== FUEL DATA ===');
const fuel = db.prepare('SELECT * FROM fuel_data ORDER BY received_at DESC LIMIT 10').all();
console.table(fuel);

console.log('\n=== CONNECTION LOGS ===');
const logs = db.prepare('SELECT * FROM connection_logs ORDER BY timestamp DESC LIMIT 10').all();
console.table(logs);

db.close();
