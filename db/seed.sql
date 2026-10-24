-- Starter cats. Only added when the table is empty, so this is safe to run again.
-- Some are already sold (this month and earlier) so the sales report has data to show.
INSERT INTO cats (name, breed, sex, age_months, coat, fur_color, price_cents, description, vaccinated, status, sold_at)
SELECT * FROM (VALUES
    ('Biscuit', 'British Shorthair', 'Male', 4, 'Blue grey', '#8a96a3', 450000,
     'A round-faced little teddy bear who loves laps and naps in the sun.', true, 'available', NULL::timestamptz),
    ('Marmalade', 'Domestic Shorthair', 'Female', 7, 'Ginger tabby', '#e08a3c', 120000,
     'Playful and chatty. Will follow you from room to room to see what you are up to.', true, 'available', NULL),
    ('Luna', 'Siamese', 'Female', 12, 'Seal point', '#e8dcc8', 380000,
     'Elegant, clever and very talkative. Best with someone who is home a lot.', true, 'available', NULL),
    ('Oreo', 'Domestic Shorthair', 'Male', 3, 'Black and white', '#2b2b2b', 95000,
     'A tiny tuxedo kitten full of beans. Gets on well with other cats.', false, 'available', NULL),
    ('Cinnamon', 'Maine Coon', 'Male', 10, 'Brown tabby', '#8b5a3c', 650000,
     'A gentle giant in the making, with a fluffy tail and enormous paws.', true, 'reserved', NULL),
    ('Snowball', 'Persian', 'Female', 24, 'White', '#f4f1ea', 520000,
     'Calm and cuddly. Needs a daily brush to keep that cloud of fur soft.', true, 'available', NULL),
    ('Mocha', 'Ragdoll', 'Female', 5, 'Chocolate point', '#c8a989', 580000,
     'Goes floppy when you pick her up. Sweet, quiet and very affectionate.', true, 'available', NULL),

    -- Sold this month (never later than right now)
    ('Smokey', 'Russian Blue', 'Male', 36, 'Solid blue', '#6f7c8a', 300000,
     'Shy at first, then your shadow. Loves a feather toy.', true, 'sold',
     LEAST(now(), date_trunc('month', now()) + interval '9 days 14 hours')),
    ('Pepper', 'Domestic Shorthair', 'Female', 6, 'Black', '#1f1f1f', 90000,
     'A sleek little panther who purrs the moment you look at her.', true, 'sold',
     LEAST(now(), date_trunc('month', now()) + interval '3 days 10 hours')),
    ('Tigger', 'Bengal', 'Male', 8, 'Spotted brown', '#c58a4a', 720000,
     'Bouncy, sporty and curious. Loves to climb and play fetch.', true, 'sold',
     LEAST(now(), date_trunc('month', now()) + interval '15 days 16 hours')),

    -- Sold in earlier months
    ('Shadow', 'Bombay', 'Male', 14, 'Black', '#191919', 280000,
     'Calm and loyal with copper eyes.', true, 'sold', date_trunc('month', now()) - interval '12 days'),
    ('Simba', 'Domestic Shorthair', 'Male', 5, 'Orange', '#e3963e', 110000,
     'A brave little lion cub.', true, 'sold', date_trunc('month', now()) - interval '20 days'),
    ('Bella', 'Ragdoll', 'Female', 9, 'Blue point', '#cfd5dc', 560000,
     'Soft as a cloud and just as calm.', true, 'sold', date_trunc('month', now()) - interval '40 days')
) AS v(name, breed, sex, age_months, coat, fur_color, price_cents, description, vaccinated, status, sold_at)
WHERE NOT EXISTS (SELECT 1 FROM cats);
