// Adds about 10,000 sample sales over the last 10 years.
//   npm run seed-sales            add (or re-create) the sample sales
//   npm run seed-sales -- --remove   delete them again
//   npm run seed-sales -- --if-empty only add them if there are none yet (used when the server starts)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
        if (process.argv.includes('--remove')) {
            const { rowCount } = await db.query('DELETE FROM cats WHERE sample');
            console.log(`Removed ${rowCount} sample sales.`);
            return;
        }
        if (process.argv.includes('--if-empty')) {
            const { rows } = await db.query('SELECT count(*)::int AS n FROM cats WHERE sample');
            if (rows[0].n > 0) {
                console.log(`Sample sales already there (${rows[0].n}), leaving them alone.`);
                return;
            }
        }
        await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'sample-sales.sql'), 'utf8'));
        const { rows } = await db.query(
            `SELECT count(*)::int AS n, min(sold_at)::date AS first, max(sold_at)::date AS last
             FROM cats WHERE sample`
        );
        console.log(`Added ${rows[0].n} sample sales from ${rows[0].first.toDateString()} to ${rows[0].last.toDateString()}.`);
    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
