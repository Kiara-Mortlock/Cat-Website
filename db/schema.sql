-- People who can log in to list cats and see the sales report
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,             -- scrypt$salt$hash, never the password itself
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Logged-in browsers. Only a hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

-- One row per cat listed in the shop
CREATE TABLE IF NOT EXISTS cats (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    breed       TEXT NOT NULL CHECK (length(breed) BETWEEN 1 AND 60),
    sex         TEXT NOT NULL CHECK (sex IN ('Male', 'Female')),
    age_months  INT  NOT NULL CHECK (age_months BETWEEN 0 AND 300),
    coat        TEXT NOT NULL DEFAULT '' CHECK (length(coat) <= 60),          -- e.g. "Ginger tabby"
    fur_color   TEXT NOT NULL CHECK (fur_color ~ '^#[0-9a-fA-F]{6}$'),       -- used to draw the cat
    price_cents INT  NOT NULL CHECK (price_cents >= 0),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    photo_url   TEXT CHECK (photo_url IS NULL OR photo_url ~ '^https?://'),  -- optional real photo
    vaccinated  BOOLEAN NOT NULL DEFAULT false,
    status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
    sold_at     TIMESTAMPTZ,                                                  -- set when marked sold
    listed_by   INT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'sold') = (sold_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS cats_sold_at_idx ON cats (sold_at) WHERE sold_at IS NOT NULL;

-- Marks generated history from `npm run seed-sales`, so it can be removed again
ALTER TABLE cats ADD COLUMN IF NOT EXISTS sample BOOLEAN NOT NULL DEFAULT false;
