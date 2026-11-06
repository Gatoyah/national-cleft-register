# National Cleft Registry — Ghana

A registry for cleft lip/palate patients, made of two applications:

| App | Where it runs | Port | What it does |
|---|---|---|---|
| **Main Hub** (`Main Hub/`) | National centre (KATH) | 3000 | National registry: patients, diagnoses, surgeries, appointments, statistics, reports, research exports, regional hub management |
| **Regional Hub** (`Regional Hub/`) | Each regional hospital | 3001 | Data entry that works **without internet**; syncs with the Main Hub whenever it can reach it |

Each app is a self-contained Next.js server with its own **encrypted** SQLite database.

```
 Regional Hub (TTH) ─┐   push: patients, diagnoses, surgeries        ┌─ Main Hub (KATH)
 Regional Hub (KBTH) ┼──────────────────────────────────────────────►│  national registry
 Regional Hub (...)  ┘◄──────────────────────────────────────────────┘
                         pull: NCR IDs, status changes, surgeries done at the Main Hub
```

- **Hospital installation (no developer tools needed):** see **[DEPLOY.md](DEPLOY.md)**.
- **Building the installable packages and sending them:** see [Compile, package and send](#compile-package-and-send).

---

## Accounts and roles

On first start, each hub shows a **setup wizard** that creates that hub's **administrator**.
The administrator has access to everything and **creates the accounts for everyone else**
(Users → Add User). Each person gets a temporary password and must choose their own at
first sign-in. The administrator can later change a user's role, reset their password,
unlock them after failed logins, or disable the account (which signs them out at once).
There is always at least one active administrator.

### Main Hub roles

| Role | Can do |
|---|---|
| Administrator | Everything: users, regional hubs and sync keys, audit log, settings, full exports |
| Surgeon | Register/edit patients, diagnoses, **record surgeries**, appointments, statistics, reports |
| Clinician | Register/edit patients, diagnoses, appointments, statistics, reports |
| Data clerk | Register/edit patients and appointments, view surgeries, statistics |
| Community health worker | View patients, appointments and follow-up alerts |
| Researcher | Statistics, reports, research page and **de-identified** exports only, no names |
| Viewer | Statistics and reports only, no names |

### Regional Hub roles

| Role | Can do |
|---|---|
| Administrator | Everything: users, sync with the Main Hub, audit log |
| Surgeon | Register/view/edit patients and **record surgeries** |
| Clinician | Register/view/edit patients |
| Data clerk | Register and view patients |
| Viewer | Statistics only, no names |

The rules live in one file per app (`src/lib/permissions.ts`). Every API route, every
page and the menu follow it. Opening a page you are not allowed to see shows
"Access not permitted".

---

## Offline sync

- Everything is saved on the Regional Hub first, in its own database, so data entry
  never depends on the internet.
- Every new or edited patient/surgery goes into a **sync queue** on the Regional Hub.
- The Regional Hub syncs **automatically** every 5 minutes (`SYNC_INTERVAL_MINUTES`) and a
  few seconds after something is saved. Admins can also press **Sync now**.
- A record leaves the queue **only after the Main Hub confirms it saved that record**. If
  the Main Hub is down or the internet is off, records stay queued and are retried
  indefinitely. They are never dropped.
- Records the Main Hub rejects (invalid data) are listed on the Sync page with the reason,
  and can be retried after fixing.
- Sync is idempotent: sending the same record twice never creates duplicates.
- The Main Hub assigns the official **NCR ID** (`NCR-YYYY-NNNNN`, sequential), which flows
  back to the Regional Hub. Status changes (deceased, lost to follow-up) and surgeries done
  at the Main Hub after referral also flow back.
- A hub can only send data under its own name and only receives its own patients.

---

## Security

| Area | Protection |
|---|---|
| Data at rest | Both databases are **encrypted** (`DB_ENCRYPTION_KEY`). Backups are encrypted too. A copied disk, USB stick or backup is unreadable without the key. |
| First run | No default password. Setup requires a one-time **setup token** shown only on the server machine. |
| Passwords | bcrypt; at least 12 characters with upper/lower case, digit and symbol; forced change after an admin creates or resets an account |
| Login | Per-account lockout after 5 failures (15 min, admin can unlock); per-IP throttling; no account enumeration |
| Sessions | Random token in an HttpOnly, SameSite=Strict cookie (Secure under HTTPS); only a hash stored; 12 h lifetime; ended on password change, role change or disable |
| Requests | CSRF tokens + same-origin check on every state-changing request; strict security headers (CSP, frame denial, nosniff) |
| Access | Role checks on every API route and page; patient names hidden from researcher/viewer roles |
| Sync | Per-hub API key (only a hash stored on the Main Hub; encrypted on the Regional Hub); key verified when saved; key rotation; refuses plain `http://` to internet hosts |
| Research | De-identified export contains **only patients with research consent**: no names, phones, ID numbers, exact birth dates, towns or GPS, and a pseudonymous research ID |
| Accountability | Audit log of every login, change, patient view, export and sync (Audit Log page) |
| Integrity | Input validated with Zod; parameterised SQL; stored data never altered by "sanitising"; CSV formula-injection protection |

**Your responsibilities when deploying** (see DEPLOY.md):
- Keep a safe copy of each hub's `.env`. **Without `DB_ENCRYPTION_KEY` the data can never be recovered.**
- Use **HTTPS** whenever the Main Hub is reached over the internet.
- Keep the server machines physically secure and up to date.

---

## Development

Requirements: Node.js 20+ (22 LTS recommended), npm.

```bash
git clone https://github.com/Gatoyah/national-cleft-register.git
cd national-cleft-register
```

```bash
npm run install:all
```

Start each app in its own terminal. `npm run dev` creates `.env` with fresh secrets and
sets up the database automatically:

```bash
cd "Main Hub" && npm run dev
```

```bash
cd "Regional Hub" && npm run dev
```

Open <http://localhost:3000> and <http://localhost:3001>. Each shows the setup wizard. The
**setup token** is printed in that app's terminal (and saved in `setup-token.txt`).

To connect them: on the Main Hub go to **Regional Hubs → Add Regional Hub** (use the same
code you gave the Regional Hub in its setup, e.g. `TTH`) and copy the API key. On the
Regional Hub go to **Sync with Main Hub → Edit connection**, enter `http://localhost:3000`
and the key, then **Save and test**.

Schema changes (Main Hub): edit `src/db/schema.ts`, then `npm run db:generate`. The new
migration in `drizzle/` is applied automatically on the next start. Regional Hub: add the
column to `src/db/schema.ts` and to `ADDED_COLUMNS` in `init-db.mjs`.

### Tests

```bash
npm run build
```

```bash
npm run check
```

```bash
npm test
```

`npm test` starts both production servers on throwaway encrypted databases and runs:

- `tests/e2e.mjs` (118 checks): setup, every role's API and page permissions, account
  lockout/reset/disable, patient data entry, sync both ways, offline queueing and recovery,
  automatic sync, key rotation, idempotency, encryption at rest, backups, research export
  de-identification, and every page loading without errors.
- `tests/ui.mjs` (18 checks, real Chromium browser via Playwright): setup wizard, creating a
  user, forced password change, role-filtered menus, patient forms, connecting and syncing
  from the Sync page, and downloading a research export. Screenshots go to
  `test-results/screenshots/`. Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`.

---

## Compile, package and send

The packager builds both apps and produces ready-to-install archives that contain the
server, only the files it needs, the native database driver **for the target operating
system**, and (with `--with-node`) a portable Node.js. The hospital machine needs
**nothing installed** and no internet.

Run it on any Windows, macOS or Linux machine with Node.js and internet access:

```bash
npm run install:all
```

For Windows hospital PCs (most common):

```bash
npm run package:windows
```

For Linux servers:

```bash
npm run package:linux
```

Other targets: `node package-for-deployment.mjs --target <win-x64|linux-x64|linux-arm64|darwin-x64|darwin-arm64> --with-node`.

Output, e.g. in `dist/win-x64/`:

```
ncr-main-hub-win-x64.zip        about 42 MB, for the national centre
ncr-regional-hub-win-x64.zip    about 42 MB, one copy for each regional hospital
SHA256SUMS.txt                  checksums to verify the files arrived intact
```

### Sending the packages to someone

1. Send the `.zip` files **and** `SHA256SUMS.txt` by USB drive, a shared drive (Google
   Drive/OneDrive/SharePoint link), or any file transfer. They contain **no patient data and
   no secrets**: each installation generates its own keys on first start.
2. The receiver checks the files are intact:
   - Windows (PowerShell): `Get-FileHash .\ncr-regional-hub-win-x64.zip -Algorithm SHA256`
   - Linux/macOS: `sha256sum -c SHA256SUMS.txt`

   and compares the result with `SHA256SUMS.txt`.
3. The receiver follows **DEPLOY.md** (also included inside each package).
4. For each Regional Hub, the Main Hub administrator separately sends the hub's **sync API
   key** through a different, private channel (phone call or in person, not in the same
   email as the files).

**Never send** a hub's `.env` file, `*.db` database files or the `backups/` folder by email
or chat. They are the keys to patient data and the data itself.

### Updating an installation

Build new packages the same way. On the hospital machine: stop the app, back up the
folder, then copy the new files **over** the old folder, keeping `.env`, the `.db` file
and `backups/`. On the next start, `start.bat`/`start.sh` backs up the database and applies
any database upgrades automatically.

---

## Project structure

```
national-cleft-register/
├── Main Hub/                  National app (Next.js, port 3000)
│   ├── src/app/               Pages and API routes
│   ├── src/lib/               auth, permissions, sync auth, export, setup, backup
│   ├── src/db/schema.ts       Database schema (Drizzle ORM)
│   ├── drizzle/               Database migrations (applied by migrate.mjs)
│   ├── deploy/start.bat|.sh   Launchers copied into the package
│   └── setup-env.mjs, migrate.mjs, backup.mjs
├── Regional Hub/              Facility app (Next.js, port 3001)
│   ├── src/lib/sync.ts        Offline queue + sync engine
│   └── setup-env.mjs, init-db.mjs, backup.mjs, deploy/
├── tests/                     End-to-end and browser tests
├── package-for-deployment.mjs Builds the installable packages
└── DEPLOY.md                  Hospital installation guide
```

Tech: Next.js 16, React 19, Drizzle ORM, SQLite via libsql (encrypted), Zod, Tailwind CSS.
