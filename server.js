require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const { promisify } = require('util');
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const scrypt = promisify(crypto.scrypt);
const PRODUCTION = process.env.NODE_ENV === 'production';

// Hosts like Render sit in front of the app and handle https
if (PRODUCTION) app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Express 4 does not catch errors from async handlers on its own
const route = fn => (req, res, next) => fn(req, res, next).catch(next);

const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const text = v => (typeof v === 'string' ? v.trim() : '');

// ---------- Accounts and sessions ----------

const SESSION_DAYS = 7;
const COOKIE = 'sid';

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function checkPassword(password, stored) {
    const [, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
}

// Used when the email is unknown, so a wrong email takes as long as a wrong password
let dummyHash;
hashPassword('not-a-real-password').then(h => (dummyHash = h));

const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
    for (const part of (req.headers.cookie || '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

async function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM sessions WHERE expires_at < now()');
    await pool.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
        [tokenHash(token), userId, SESSION_DAYS]
    );
    res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: PRODUCTION, // only sent over https once the site is live
        maxAge: SESSION_DAYS * 86400000,
        path: '/',
    });
}

// Attaches req.user when the browser has a valid session cookie
app.use(route(async (req, res, next) => {
    const token = readCookie(req, COOKIE);
    if (token) {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = $1 AND s.expires_at > now()`,
            [tokenHash(token)]
        );
        req.user = rows[0] || null;
    }
    next();
}));

function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    next();
}

app.post('/api/signup', route(async (req, res) => {
    const name = text(req.body?.name);
    const email = text(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const errors = [];
    if (!name || name.length > 80) errors.push('Name is required and must be 80 characters or fewer.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.push('Enter a valid email address.');
    if (password.length < 8 || password.length > 200) errors.push('Password must be at least 8 characters.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    try {
        const { rows } = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
            [name, email, await hashPassword(password)]
        );
        await startSession(res, rows[0].id);
        res.status(201).json({ user: rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists. Try logging in.' });
        throw err;
    }
}));

app.post('/api/login', route(async (req, res) => {
    const email = text(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const { rows } = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = await checkPassword(password, user ? user.password_hash : dummyHash);
    if (!user || !ok) return res.status(401).json({ error: 'Wrong email or password.' });
    await startSession(res, user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
}));

app.post('/api/logout', route(async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
}));

app.get('/api/me', (req, res) => res.json({ user: req.user || null }));

// ---------- Cats ----------

const COLUMNS = `id, name, breed, sex, age_months, coat, fur_color, price_cents, description,
                 photo_url, vaccinated, status, sold_at, created_at`;
const SEXES = ['Male', 'Female'];
const STATUSES = ['available', 'reserved', 'sold'];
const HEX = /^#[0-9a-fA-F]{6}$/;

// Returns { cat } with cleaned-up values, or { errors } listing what is wrong
function validateCat(b) {
    const errors = [];
    const cat = {
        name: text(b.name),
        breed: text(b.breed),
        sex: b.sex,
        age_months: b.age_months,
        coat: text(b.coat),
        fur_color: b.fur_color,
        price_cents: b.price_cents,
        description: text(b.description),
        photo_url: text(b.photo_url) || null,
        vaccinated: Boolean(b.vaccinated),
        status: b.status === undefined ? 'available' : b.status,
    };

    if (!cat.name || cat.name.length > 60) errors.push('Name is required and must be 60 characters or fewer.');
    if (!cat.breed || cat.breed.length > 60) errors.push('Breed is required and must be 60 characters or fewer.');
    if (!SEXES.includes(cat.sex)) errors.push('Sex must be Male or Female.');
    if (!intIn(cat.age_months, 0, 300)) errors.push('Age must be a whole number of months from 0 to 300.');
    if (cat.coat.length > 60) errors.push('Coat must be 60 characters or fewer.');
    if (!HEX.test(cat.fur_color)) errors.push('Fur colour must look like #rrggbb.');
    if (!intIn(cat.price_cents, 0, 100000000)) errors.push('Price must be zero or more.');
    if (cat.description.length > 1000) errors.push('Description must be 1000 characters or fewer.');
    if (cat.photo_url && !/^https?:\/\/\S+$/.test(cat.photo_url)) errors.push('Photo link must start with http:// or https://.');
    if (!STATUSES.includes(cat.status)) errors.push('Status must be available, reserved or sold.');

    return errors.length ? { errors } : { cat };
}

function parseId(req) {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
}

const SORTS = {
    newest: 'created_at DESC, id DESC',
    'price-asc': 'price_cents ASC, id DESC',
    'price-desc': 'price_cents DESC, id DESC',
    age: 'age_months ASC, id DESC',
};
const PAGE_SIZE = 60;

// ?q=search&status=available|reserved|sold&sort=newest|price-asc|price-desc|age
// Returns one page of cats plus how many match in total.
app.get('/api/cats', route(async (req, res) => {
    const where = [];
    const params = [];
    if (STATUSES.includes(req.query.status)) {
        params.push(req.query.status);
        where.push(`status = $${params.length}`);
    }
    const q = text(req.query.q).slice(0, 60);
    if (q) {
        params.push(`%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`);
        where.push(`(name ILIKE $${params.length} OR breed ILIKE $${params.length} OR coat ILIKE $${params.length})`);
    }
    const order = SORTS[req.query.sort] || SORTS.newest;
    const { rows } = await pool.query(
        `SELECT ${COLUMNS}, count(*) OVER ()::int AS total FROM cats
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ${order} LIMIT ${PAGE_SIZE}`,
        params
    );
    const total = rows.length ? rows[0].total : 0;
    rows.forEach(r => delete r.total);
    res.json({ cats: rows, total });
}));

app.get('/api/cats/:id', route(async (req, res) => {
    const id = parseId(req);
    const { rows } = id ? await pool.query(`SELECT ${COLUMNS} FROM cats WHERE id = $1`, [id]) : { rows: [] };
    if (!rows.length) return res.status(404).json({ error: 'Cat not found.' });
    res.json(rows[0]);
}));

app.post('/api/cats', requireUser, route(async (req, res) => {
    const { cat, errors } = validateCat(req.body || {});
    if (errors) return res.status(400).json({ error: errors.join(' ') });
    const { rows } = await pool.query(
        `INSERT INTO cats (name, breed, sex, age_months, coat, fur_color, price_cents, description,
                           photo_url, vaccinated, status, sold_at, listed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $11 = 'sold' THEN now() END, $12)
         RETURNING ${COLUMNS}`,
        [cat.name, cat.breed, cat.sex, cat.age_months, cat.coat, cat.fur_color, cat.price_cents,
         cat.description, cat.photo_url, cat.vaccinated, cat.status, req.user.id]
    );
    res.status(201).json(rows[0]);
}));

// Change a listing's status and/or price. Marking a cat sold records when it sold.
app.patch('/api/cats/:id', requireUser, route(async (req, res) => {
    const id = parseId(req);
    if (!id) return res.status(404).json({ error: 'Cat not found.' });
    const { status, price_cents } = req.body || {};
    if (status === undefined && price_cents === undefined) {
        return res.status(400).json({ error: 'Send a new status or price_cents.' });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Status must be available, reserved or sold.' });
    }
    if (price_cents !== undefined && !intIn(price_cents, 0, 100000000)) {
        return res.status(400).json({ error: 'Price must be zero or more.' });
    }
    const { rows } = await pool.query(
        `UPDATE cats SET
             status = COALESCE($2, status),
             price_cents = COALESCE($3, price_cents),
             sold_at = CASE WHEN COALESCE($2, status) = 'sold' THEN COALESCE(sold_at, now()) END
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, status ?? null, price_cents ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cat not found.' });
    res.json(rows[0]);
}));

app.delete('/api/cats/:id', requireUser, route(async (req, res) => {
    const id = parseId(req);
    const result = id ? await pool.query('DELETE FROM cats WHERE id = $1', [id]) : { rowCount: 0 };
    if (!result.rowCount) return res.status(404).json({ error: 'Cat not found.' });
    res.status(204).end();
}));

// ---------- Sales report ----------

// ?month=YYYY-MM, defaulting to the current month
app.get('/api/reports/sales', requireUser, route(async (req, res) => {
    let month = req.query.month;
    if (month === undefined) {
        const { rows } = await pool.query(`SELECT to_char(now(), 'YYYY-MM') AS m`);
        month = rows[0].m;
    }
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ error: 'Month must look like 2026-10.' });
    }
    const start = `${month}-01`;

    const sold = await pool.query(
        `SELECT id, name, breed, price_cents, sold_at, EXTRACT(DAY FROM sold_at)::int AS day
         FROM cats
         WHERE sold_at >= $1::date AND sold_at < $1::date + interval '1 month'
         ORDER BY sold_at`,
        [start]
    );

    // This month and the five before it, including months with no sales
    const history = await pool.query(
        `SELECT to_char(m, 'YYYY-MM') AS month, count(c.id)::int AS count, COALESCE(sum(c.price_cents), 0)::float8 AS revenue_cents
         FROM generate_series($1::date - interval '5 months', $1::date, interval '1 month') AS m
         LEFT JOIN cats c ON c.sold_at >= m AND c.sold_at < m + interval '1 month'
         GROUP BY m ORDER BY m`,
        [start]
    );

    const stock = await pool.query(`SELECT status, count(*)::int AS count FROM cats GROUP BY status`);
    const daysInMonth = (await pool.query(
        `SELECT EXTRACT(DAY FROM $1::date + interval '1 month' - interval '1 day')::int AS n`, [start]
    )).rows[0].n;

    const byDay = Array(daysInMonth).fill(0);
    const byBreed = {};
    for (const cat of sold.rows) {
        byDay[cat.day - 1]++;
        byBreed[cat.breed] = (byBreed[cat.breed] || 0) + 1;
    }

    res.json({
        month,
        sold_count: sold.rows.length,
        revenue_cents: sold.rows.reduce((sum, c) => sum + c.price_cents, 0),
        previous_count: history.rows[history.rows.length - 2].count,
        by_day: byDay,
        by_breed: Object.entries(byBreed).map(([breed, count]) => ({ breed, count })).sort((a, b) => b.count - a.count),
        history: history.rows,
        stock: Object.fromEntries(STATUSES.map(s => [s, stock.rows.find(r => r.status === s)?.count || 0])),
        sold: sold.rows,
    });
}));

// Sales grouped by day, month or year between two dates, with growth for each period.
// ?group=day|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
// The range is widened to whole periods (e.g. whole months).
const GROUP_LIMITS = { day: 1100, month: 240, year: 50 };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

app.get('/api/reports/trend', requireUser, route(async (req, res) => {
    const { group, from, to } = req.query;
    if (!GROUP_LIMITS[group]) return res.status(400).json({ error: 'Group must be day, month or year.' });
    if (!isDate(from) || !isDate(to) || from > to) {
        return res.status(400).json({ error: 'Pick a start date that is before the end date.' });
    }
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const periods = {
        day: (Date.parse(to) - Date.parse(from)) / 86400000 + 1,
        month: (ty - fy) * 12 + (tm - fm) + 1,
        year: ty - fy + 1,
    }[group];
    if (periods > GROUP_LIMITS[group]) {
        return res.status(400).json({ error: `That is too many ${group}s to show at once. Pick a shorter range or group by a bigger unit.` });
    }

    // One extra period before the range, so the first period also gets a growth figure
    const step = `1 ${group}`;
    const { rows } = await pool.query(
        `WITH bounds AS (
             SELECT date_trunc($1, $2::date::timestamptz) - $4::interval AS lo,
                    date_trunc($1, $3::date::timestamptz) + $4::interval AS hi
         ),
         sales AS (
             SELECT date_trunc($1, sold_at) AS b, count(*)::int AS n, sum(price_cents)::float8 AS rev
             FROM cats, bounds
             WHERE sold_at >= bounds.lo AND sold_at < bounds.hi
             GROUP BY 1
         )
         SELECT to_char(s.b, 'YYYY-MM-DD') AS start, COALESCE(sales.n, 0) AS count, COALESCE(sales.rev, 0) AS revenue_cents
         FROM bounds, generate_series(bounds.lo, bounds.hi - $4::interval, $4::interval) AS s(b)
         LEFT JOIN sales ON sales.b = s.b
         ORDER BY s.b`,
        [group, from, to, step]
    );
    const [before, ...inRange] = rows;

    // The same number of periods straight before the range, for the overall growth figure
    const previous = (await pool.query(
        `SELECT count(*)::int AS count, COALESCE(sum(price_cents), 0)::float8 AS revenue_cents
         FROM cats
         WHERE sold_at >= date_trunc($1, $2::date::timestamptz) - $3::interval
           AND sold_at <  date_trunc($1, $2::date::timestamptz)`,
        [group, from, `${inRange.length} ${group}`]
    )).rows[0];

    const growth = (now, then) => (then > 0 ? (now - then) / then : null);
    let last = before;
    for (const p of inRange) {
        p.growth = growth(p.count, last.count);
        last = p;
    }
    const total = inRange.reduce((sum, p) => sum + p.count, 0);
    const revenue = inRange.reduce((sum, p) => sum + p.revenue_cents, 0);
    const first = (await pool.query(`SELECT to_char(min(sold_at), 'YYYY-MM-DD') AS d FROM cats`)).rows[0].d;

    res.json({
        group,
        first_sale: first,
        periods: inRange,
        total,
        revenue_cents: revenue,
        previous,
        growth: growth(total, previous.count),
        revenue_growth: growth(revenue, previous.revenue_cents),
    });
}));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Selling Cats running at http://localhost:${port}`));
