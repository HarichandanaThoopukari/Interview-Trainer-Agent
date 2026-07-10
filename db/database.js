const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

// On serverless platforms like Vercel, only /tmp is writable and it does not
// persist across cold starts/invocations. This lets the app boot there for
// demos, but for real persistent data use Render/Railway (writable disk) or
// swap this file for a hosted database.
const dbDir = process.env.VERCEL ? '/tmp' : __dirname;
const dbFile = path.join(dbDir, 'data.json');

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify({ users: [], chats: [], reports: [], bookmarks: [] }, null, 2));
}

const adapter = new FileSync(dbFile);
const db = low(adapter);

db.defaults({ users: [], chats: [], reports: [], bookmarks: [] }).write();

module.exports = db;
