-- About 10,000 sold cats spread over the last 10 years, for trying out the sales report.
-- Sales grow steadily, peak around December, and prices rise about 5% a year.
-- Running this again replaces the previous sample rows; your own cats are never touched.

DELETE FROM cats WHERE sample;

SELECT setseed(0.42); -- same data every time

WITH params AS (
    SELECT
        ARRAY['Milo', 'Luna', 'Oliver', 'Bella', 'Leo', 'Lily', 'Simba', 'Nala', 'Charlie', 'Chloe',
              'Max', 'Cleo', 'Jasper', 'Daisy', 'Oscar', 'Sophie', 'Tiger', 'Willow', 'Felix', 'Zoe',
              'Ginger', 'Misty', 'Shadow', 'Pumpkin', 'Socks', 'Coco', 'Pepper', 'Mittens', 'Toffee', 'Honey',
              'Biscuit', 'Peanut', 'Smudge', 'Patch', 'Bean', 'Olive', 'Maple', 'Hazel', 'Juniper', 'Pip'] AS names,
        -- breed, base price range in Rand (10 years ago)
        ARRAY['Domestic Shorthair', 'British Shorthair', 'Siamese', 'Maine Coon', 'Persian',
              'Ragdoll', 'Bengal', 'Russian Blue', 'Sphynx', 'Scottish Fold'] AS breeds,
        ARRAY[600, 3000, 2500, 4500, 3500, 4000, 5000, 2500, 6000, 4000] AS lows,
        ARRAY[1500, 5000, 4000, 7500, 6000, 6500, 8000, 4000, 9000, 6500] AS highs,
        -- Domestic Shorthairs sell far more often than the rest
        ARRAY[1, 1, 1, 1, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10] AS breed_pick,
        ARRAY['Ginger tabby', 'Black', 'Black and white', 'Grey tabby', 'Blue grey', 'White',
              'Cream', 'Brown tabby', 'Tortoiseshell', 'Seal point'] AS coats,
        ARRAY['#e08a3c', '#1f1f1f', '#2b2b2b', '#8c8c84', '#8a96a3', '#f4f1ea',
              '#e8d2a8', '#8b5a3c', '#6b4a32', '#e8dcc8'] AS furs,
        date_trunc('month', now()) - interval '119 months' AS first_month
),
months AS (
    SELECT m,
           (extract(year FROM age(m, p.first_month)) * 12 + extract(month FROM age(m, p.first_month)))::int AS t,
           LEAST(m + interval '1 month', now()) AS month_end
    FROM params p, generate_series(p.first_month, date_trunc('month', now()), interval '1 month') AS m
),
counts AS (
    SELECT m, month_end,
           round(
               (30 + 0.9 * t)                                                  -- steady growth
               * (1 + 0.2 * cos(2 * pi() * (extract(month FROM m) - 12) / 12)) -- busiest in December
               * (0.9 + random() * 0.2)                                        -- a bit of noise
               -- the current month only counts the days so far
               * extract(epoch FROM month_end - m) / extract(epoch FROM (m + interval '1 month') - m)
           )::int AS n
    FROM months
),
sales AS (
    SELECT m + random() * (month_end - m) AS sold_at,
           random() AS r_name, random() AS r_sex, random() AS r_age, random() AS r_price,
           random() AS r_vacc, random() AS r_listed, random() AS r_breed, random() AS r_coat
    FROM counts, generate_series(1, counts.n)
)
INSERT INTO cats (name, breed, sex, age_months, coat, fur_color, price_cents, description,
                  vaccinated, status, sold_at, created_at, sample)
SELECT
    p.names[1 + floor(s.r_name * array_length(p.names, 1))::int],
    p.breeds[pick.b],
    CASE WHEN s.r_sex < 0.5 THEN 'Female' ELSE 'Male' END,
    2 + floor(s.r_age * 30)::int,
    p.coats[pick.c],
    p.furs[pick.c],
    -- Price within the breed's range, raised 5% a year, rounded to R50
    (round((p.lows[pick.b] + s.r_price * (p.highs[pick.b] - p.lows[pick.b]))
           * power(1.05, extract(epoch FROM s.sold_at - p.first_month) / 31557600) / 50) * 5000)::int,
    'Sample sale record.',
    s.r_vacc < 0.9,
    'sold',
    s.sold_at,
    s.sold_at - (1 + s.r_listed * 40) * interval '1 day', -- listed a few days to weeks before selling
    true
FROM sales s
CROSS JOIN params p
CROSS JOIN LATERAL (
    SELECT p.breed_pick[1 + floor(s.r_breed * array_length(p.breed_pick, 1))::int] AS b,
           1 + floor(s.r_coat * array_length(p.coats, 1))::int AS c
) AS pick;
