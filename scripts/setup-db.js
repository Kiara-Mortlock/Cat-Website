// Creates the database (if needed), the cats table, and the starter cats.
// Run with: npm run setup-db
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    }

    const url = new URL(process.env.DATABASE_URL);
    const dbName = url.pathname.slice(1);
    if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) {
        throw new Error(`Database name "${dbName}" should only use lowercase letters, numbers and underscores.`);
    }

    // Connect to the built-in "postgres" database to create ours
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
        await admin.query(`CREATE DATABASE ${dbName}`);
        console.log(`Created database ${dbName}`);
    }
    await admin.end();

    const db = new Client({ connectionString: url.toString() });
    await db.connect();
    for (const file of ['schema.sql', 'seed.sql']) {
        await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8'));
        console.log(`Ran db/${file}`);
    }
    const { rows } = await db.query('SELECT count(*)::int AS n FROM cats');
    console.log(`Done. The shop has ${rows[0].n} cats.`);
    await db.end();
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
