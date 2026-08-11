# National Cleft Registry — Ghana

A two-part registry system for tracking cleft lip/palate patients:

- **Main Hub** — the national-level app (patients, surgeries, diagnoses, appointments,
  reports, statistics, and regional hub management). Runs on port `3000`.
- **Regional Hub** — a facility-level app for offline-first data entry, which syncs its
  records up to the Main Hub. Runs on port `3001`.

Both are separate Next.js applications with their own local SQLite database, in the
`Main Hub/` and `Regional Hub/` folders.

---

## 1. Clone the repo

```bash
git clone https://github.com/Gatoyah/national-cleft-register.git
cd national-cleft-register
```

## 2. Install dependencies

```bash
cd "Main Hub" && npm install
cd "../Regional Hub" && npm install
cd ..
```

## 3. Configure environment variables

Neither app ships with a `.env` file (they're git-ignored, since they hold secrets) —
you need to create one for each app from the provided `.env.example`.

```bash
cp "Main Hub/.env.example" "Main Hub/.env"
cp "Regional Hub/.env.example" "Regional Hub/.env"
```

Then open each `.env` and replace the placeholder secret values
(`SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`) with your own random hex strings,
e.g.:

```bash
openssl rand -hex 32
```

The `DATABASE_URL` defaults (`file:main_hub.db` and `file:local.db`) are fine for local
development — they create a SQLite file inside each app's own folder.

## 4. Initialize the databases

```bash
cd "Main Hub" && npx drizzle-kit push
cd "../Regional Hub" && node init-db.mjs
cd ..
```

## 5. Start both apps

In two separate terminals:

```bash
cd "Main Hub" && npm run dev          # http://localhost:3000
cd "Regional Hub" && npm run dev -- -p 3001   # http://localhost:3001
```

## 6. Create the default admin accounts

Each app needs a one-time setup call to create its first admin user. **Do this after**
the server is running:

```bash
curl -X POST http://localhost:3000/api/auth/setup   # Main Hub
curl -X POST http://localhost:3001/api/auth/setup   # Regional Hub
```

Both create the same default login:

- **Email:** `admin@ncr.gov.gh`
- **Password:** `Admin123!`

The Regional Hub's setup response also returns a one-time sync API key — you don't need
to save it manually, since you'll generate a fresh, correctly-linked one in step 7.

You can now log in to both apps at `http://localhost:3000/login` and
`http://localhost:3001/login`.

## 7. Connect the Regional Hub to the Main Hub (enable sync)

The Main Hub and Regional Hub don't know about each other until you link them
explicitly — each `/api/auth/setup` call only sets up that app in isolation.

1. **On the Main Hub**, log in as admin and go to **Regional Hubs → Register New
   Regional Hub**. Fill in a name and code for your regional facility (e.g. name
   `Regional Cleft Centre`, code `RCC`) and submit.
2. The Main Hub will show you a **sync API key** — copy it now, it's only shown once.
3. **On the Regional Hub**, log in as admin and go to **Sync Data**, then click
   **Edit** on the "Facility Configuration" card. Enter:
   - **Facility Code** — the code you used in step 1 (e.g. `RCC`)
   - **Main Hub URL** — `http://localhost:3000`
   - **API Key** — the key copied in step 2
4. Save. The Regional Hub can now sync — any patient or surgery you register there will
   appear in the queue on the **Sync Data** page, ready to push with **Sync Now**.

Once synced, a patient registered on the Regional Hub is assigned an official NCR ID by
the Main Hub, which syncs back down to the Regional Hub's own record.

---

## Project structure

```
national-cleft-register/
├── Main Hub/          # National-level Next.js app (port 3000)
│   ├── src/app/        # Pages and API routes
│   ├── src/db/         # Drizzle schema + SQLite client
│   └── .env.example
├── Regional Hub/       # Facility-level Next.js app (port 3001)
│   ├── src/app/
│   ├── src/db/
│   └── .env.example
└── README.md
```

## Tech stack

- Next.js 16 (App Router, Turbopack)
- Drizzle ORM + SQLite (via `@libsql/client`)
- Tailwind CSS
- Zod for request validation
- bcrypt for password hashing, HMAC-based CSRF tokens, AES-256-GCM for API key
  encryption at rest

## Security notes

- Passwords are hashed with bcrypt (12 rounds).
- Sessions use SHA-256-hashed tokens stored in HTTP-only cookies.
- The Regional Hub's sync API key is encrypted at rest (AES-256-GCM) and only ever
  shown in plaintext once, at issuance.
- All state-changing requests require a CSRF token fetched from `/api/auth/csrf`.
- Rate limiting applies to login (5 attempts / 15 min) and sync (10 requests / min).
- All create/update/delete actions are written to an audit log.

## Troubleshooting

- **"Setup already completed" from `/api/auth/setup`**: the database already has an
  admin user. Either use the existing `admin@ncr.gov.gh` login, or delete the `.db`
  file and re-run steps 4 and 6 for a clean slate.
- **Sync always shows 0 records uploaded**: the Regional Hub's Facility Configuration
  (facility code, Main Hub URL, API key) hasn't been set, or doesn't match a hub
  actually registered on the Main Hub. Repeat step 7.
- **A page shows a blank/500 error after pulling new code**: stop and restart
  `npm run dev` — Turbopack's dev cache can occasionally get out of sync after schema
  or route changes.
