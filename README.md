# Cat-Website
Cat website made by me

## Selling Cats

A cosy online shop for cats. Anyone can browse; people with an account can list cats, reserve them, mark them sold, and see the monthly sales report.

## Run it

```
npm start
```

Then open http://localhost:3001 (the Lego catalog uses port 3000).

## First-time setup

1. Install Node.js and PostgreSQL.
2. Copy `.env.example` to `.env` and put in your PostgreSQL password.
3. `npm install`
4. `npm run setup-db` creates the `selling_cats` database, the tables and some starter cats. It is safe to run again.
5. Optional: `npm run seed-sales` adds about 10,000 sample sales over the last 10 years so the report has history to show. Run it again to re-create them, or `npm run seed-sales -- --remove` to delete them. Your own cats are never touched.

## Pages

- `index.html` – the shop, with search, filters and sorting
- `cat.html?id=…` – one cat; logged-in users can reserve, mark sold or delete
- `login.html`, `signup.html` – accounts
- `report.html` – cats sold this month, money made, daily and 6-month charts, sales by breed

## API

| Method | Path                         | Login? | What it does                              |
| ------ | ---------------------------- | ------ | ----------------------------------------- |
| POST   | /api/signup                  | no     | Create an account and log in              |
| POST   | /api/login                   | no     | Log in                                    |
| POST   | /api/logout                  | no     | Log out                                   |
| GET    | /api/me                      | no     | The logged-in user, or `null`             |
| GET    | /api/cats?q=&status=&sort=   | no     | Up to 60 matching cats, plus the total    |
| GET    | /api/cats/:id                | no     | One cat                                   |
| POST   | /api/cats                    | yes    | List a cat                                |
| PATCH  | /api/cats/:id                | yes    | Change `status` and/or `price_cents`      |
| DELETE | /api/cats/:id                | yes    | Remove a listing                          |
| GET    | /api/reports/sales?month=YYYY-MM | yes | Sales report (defaults to this month)    |
| GET    | /api/reports/trend?group=day\|month\|year&from=YYYY-MM-DD&to=YYYY-MM-DD | yes | Sales per period with growth |

Prices are stored in cents and shown in Rand. Passwords are hashed with scrypt; the session cookie is HttpOnly and only its hash is stored.
