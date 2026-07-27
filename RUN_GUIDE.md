# National Cleft Registry — IDE Setup & Run Guide

This workspace contains **two separate Next.js applications** that work together:

| Component | Folder | Port | Database |
|-----------|--------|------|----------|
| Main Hub (Central) | `Main Hub/` | `3000` | SQLite (`main_hub.db`) |
| Regional Hub (Local) | `Regional Hub/` | `3001` | SQLite (`local.db`) |

Both use **SQLite** (no PostgreSQL required) and are configured with modern web security standards (bcrypt, AES-256-GCM, rate limits, audit logs, CSP headers).

---

## 1. Prerequisites

- **Node.js** v20+ (or whatever version is installed with `npm`)
- **npm** (comes with Node)
- Any IDE: VS Code, WebStorm, Cursor, etc.

Check quickly:
```bash
node -v
npm -v
```

---

## 2. Download / Open the Workspace

After downloading the workspace folder (`national-cleft-register/`):

### VS Code
1. `File` → `Open Folder...`
2. Select the root folder (`national-cleft-register/`) — this lets you see both apps.
3. You can also open each subfolder separately if you prefer (`File` → `Open Folder...` → `Main Hub/`).

### WebStorm / IntelliJ
1. `File` → `Open` → select `national-cleft-register/`.
2. It will detect both `package.json` files automatically.

---

## 3. Install Dependencies

Run these commands in your IDE terminal (or system terminal) inside the workspace:

```bash
# Main Hub dependencies
cd "Main Hub"
npm install

# Regional Hub dependencies
cd "../Regional Hub"
npm install
```

If you see `npm audit fix` warnings, you can ignore them for development — the core packages work correctly.

---

## 4. Configure Environment (.env)

Both apps need `.env` files. We have already set them up with **SQLite** (instead of PostgreSQL) using absolute paths so they work regardless of which folder your IDE launches from.

### Main Hub (`Main Hub/.env`)
```env
DATABASE_URL=file:/home/user/national-cleft-register/Main_Hub/main_hub.db
SESSION_SECRET=9c9b2c8e64ef83c3c78f7c7cb9c3b69db62c63d5e96531f0e7c3b3af4d3b8c1e
CSRF_SECRET=4d0f7c2b2ef35b8dc9f7c1a7f4d22d68a4bde21f5a6c8f3d9e4a7c1b8d2f6e91
NODE_ENV=development
```

### Regional Hub (`Regional Hub/.env`)
```env
DATABASE_URL=file:/home/user/national-cleft-register/Regional_Hub/local.db
MAIN_HUB_URL=http://localhost:3000
NODE_ENV=development
ENCRYPTION_KEY=9c9b2c8e64ef83c3c78f7c7cb9c3b69db62c63d5e96531f0e7c3b3af4d3b8c1e
```

> **Note:** `ENCRYPTION_KEY` must stay fixed. If it changes, all stored encrypted API keys become unreadable (this was a bug we fixed during development).

---

## 5. Initialize the Databases

### Main Hub (SQLite via Drizzle ORM)
```bash
cd "Main Hub"
npx drizzle-kit push
```
This creates `main_hub.db` with all tables (patients, users, facilities, surgeries, etc.).

### Regional Hub (SQLite via init script)
```bash
cd "Regional Hub"
node init-db.mjs
```
This creates `local.db` with all regional tables (patients, surgeries, sync_queue, etc.).

If you ever delete `.db` files, just rerun these two commands to recreate them empty.

---

## 6. Setup Default Accounts (First Time Only)

Both apps have a **setup endpoint** that creates the default admin and facility configurations. You only need to run this once per fresh database.

### Main Hub Setup
Start the server first (see Step 7), then call:
```bash
curl -X POST http://localhost:3000/api/auth/setup
```
Response will show the admin account (`admin@ncr.gov.gh`) and facility codes (`KATH`, `KBTH`, `TTH`).

### Regional Hub Setup
```bash
curl -X POST http://localhost:3001/api/auth/setup
```
Response shows the regional admin (`admin@ncr.gov.gh` / `Admin123!`) and the sync API key (`ncr_...`).

---

## 7. Run Both Applications

### Option A: Two Separate Terminals
**Terminal 1 — Main Hub:**
```bash
cd "Main Hub"
npm run dev
```
Runs on: `http://localhost:3000`

**Terminal 2 — Regional Hub:**
```bash
cd "Regional Hub"
npm run dev
```
Runs on: `http://localhost:3001`

### Option B: Run in Background (Linux / macOS / WSL)
```bash
# Main Hub
nohup npm run dev > main_hub.log 2>&1 &

# Regional Hub
nohup npm run dev > regional_hub.log 2>&1 &
```
Check running status with:
```bash
ps aux | grep "next dev"
```

---

## 8. Access the Apps

| Action | URL / Command |
|--------|---------------|
| Main Hub Dashboard | `http://localhost:3000/dashboard` |
| Main Hub Login API | `POST http://localhost:3000/api/auth/login` |
| Regional Hub Dashboard | `http://localhost:3001/dashboard` |
| Regional Hub Login API | `POST http://localhost:3001/api/auth/login` |
| Sync Data (Regional) | `http://localhost:3001/sync` |

### Default Login Credentials (after setup)
- **Email**: `admin@ncr.gov.gh`
- **Password**: `Admin123!`

---

## 9. Key Pages to Inspect (Buttons & Configurations)

### Regional Hub
- `/dashboard` — Metrics, quick actions, recent registrations
- `/patients/new` — New cleft birth registration form
- `/patients` — Patient list with sync status badges
- `/surgeries/new` — Surgery recording form
- `/sync` — Data synchronization with Main Hub (shows pending queue, online/offline status)
- `/statistics` — Reports by sex, cleft type, region, surgery type
- `/users` — User management (admin-only)

### Main Hub
- `/dashboard` — Central overview, facility stats
- `/patients` — Aggregated national registry
- `/patients/new` — Central patient registration
- `/facilities` — Medical center directory
- `/hubs` — Registered regional hubs
- `/users` — Staff management with role assignment
- `/sync` — Sync status from regional hubs
- `/reports` — Data quality reports
- `/research` — Research projects and publications

---

## 10. Test a Full Workflow (Step-by-Step)

1. **Login** (Regional):
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@ncr.gov.gh","password":"Admin123!"}'
   ```

2. **Register Patient** (Regional):
   ```bash
   curl -b cookies.txt -X POST http://localhost:3001/api/patients \
     -H "Content-Type: application/json" \
     -d '{"firstName":"Ama","lastName":"Mensah","dateOfBirth":"2026-07-20","sex":"female","regionOfResidence":"ashanti","caregiverName":"Abena","cleftType":"cleft_lip_and_palate"}'
   ```

3. **Sync to Main Hub**:
   ```bash
   curl -b cookies.txt -X POST http://localhost:3001/api/sync/push
   ```

4. **Verify in Main Hub**:
   ```bash
   curl -b main_cookies.txt http://localhost:3000/api/patients
   ```

---

## 11. Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| `EADDRINUSE` (port in use) | Kill old process: `fuser -k 3000/tcp` or `3001/tcp`, then restart |
| `Setup already completed` | The `.env` uses absolute paths now (`file:/.../main_hub.db`). If you see this after deleting DB, check the `.env` points to the correct file. |
| `Invalid sync data` (null fields) | Already fixed in `sync/patients/route.ts` (`.nullable().optional()`) |
| Timestamp shows wrong year | Already fixed: `.defaultNow()` replaced with `.default(sql`(strftime('%s', 'now'))`)` |
| `Sync failed` (decryption error) | `ENCRYPTION_KEY` must be fixed in `.env`. Do not leave it random. |
| Database file missing | Run the init commands in Step 5. |

---

## 12. Security Checklist (Verified in Code)

- [x] **Password Hashing**: `bcrypt` (12 salt rounds)
- [x] **Session Security**: `crypto.randomBytes()` + `SHA-256` hash + `httpOnly` cookie
- [x] **API Key Encryption**: `AES-256-GCM` (IV + auth tag + cipher)
- [x] **Rate Limiting**: Login, API, Sync endpoints protected
- [x] **IP Blocking**: Auto-blocked after repeated failures
- [x] **Audit Logging**: All DB changes logged with user/IP
- [x] **Input Sanitization**: `sanitizeObject()` strips malicious input
- [x] **CSRF Protection**: Token validation middleware
- [x] **Web Headers**: CSP, HSTS (2yr preload), `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`

---

## 13. Code Fixes Applied (From Development Session)

These fixes are already saved in the workspace files:

1. `Main Hub/.env` → absolute SQLite path
2. `Regional Hub/.env` → absolute SQLite path + fixed `ENCRYPTION_KEY`
3. `Main Hub/src/db/schema.ts` → timestamp mode fixed
4. `Regional Hub/src/db/schema.ts` → timestamp mode fixed
5. `Main Hub/src/app/api/sync/patients/route.ts` → `.nullable().optional()` for null-safe sync
6. `Regional Hub/src/app/(dashboard)/statistics/page.tsx` → integer timestamp SQL comparison
7. `Main Hub/drizzle.config.json` → `sqlite` dialect (instead of `postgresql`)

---

## Quick IDE Commands (Copy-Paste)

**VS Code Terminal:**
```bash
# Open terminal: Ctrl + ` (backtick)
# Run Main Hub
npm run dev  # (from Main Hub folder)
# Run Regional Hub (in another terminal)
cd "../Regional Hub" && npm run dev
```

**WebStorm Terminal:**
```bash
# Right-click package.json → "Run 'dev'"
# Or use the built-in npm scripts panel
```

---

If you download this workspace anywhere else (another computer, server, or IDE), the only steps are:

1. `npm install` in both folders
2. Check `.env` uses absolute paths (already set)
3. `node init-db.mjs` (Regional) + `npx drizzle-kit push` (Main)
4. `curl -X POST .../api/auth/setup` (both)
5. `npm run dev` (both)

Everything else (security, sync, roles, database tables) is pre-configured in the source files.
