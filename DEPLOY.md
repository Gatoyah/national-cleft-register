# Installing National Cleft Registry on a hospital machine

This guide is for installing **one app per machine** — the Main Hub at KATH, and a
Regional Hub at each regional hospital — on a computer that does **not** have Node.js,
npm, git, or any developer tools installed. No internet connection is required to run
the app day-to-day (only for the initial one-time download below, and for the Regional
Hub to sync with the Main Hub).

You do this once per machine, from a technical person's laptop with internet access,
then copy the result over by USB drive.

## What's in this package

```
main-hub/  (or regional-hub/)
├── start.bat / start.sh   <- double-click / run this to launch the app
├── server.js              <- the app itself
├── node_modules/          <- only what's needed to run (not the full dev install)
├── migrate.mjs (or init-db.mjs)  <- sets up the database on first run
├── .env.example           <- copy this to .env and fill in real secrets
└── node/                  <- you add this (see step 1 below)
```

## Step 1 — Add a portable Node.js runtime (one-time, needs internet)

The app needs a JavaScript runtime to run — but you don't need to "install" Node.js
system-wide. Instead, download the portable, no-install version and drop it straight
into the package folder:

1. Go to <https://nodejs.org/en/download> and choose the **LTS** version for the target
   machine's operating system (most hospital PCs: **Windows, 64-bit, .zip**).
2. Extract the downloaded zip. You'll get a folder like `node-v22.x.x-win-x64`.
3. Rename that folder to `node` and place it inside `main-hub/` (and separately inside
   `regional-hub/`, if setting one up too), so you end up with `main-hub/node/node.exe`.

That's it — `start.bat` / `start.sh` will find and use it automatically. (If the target
machine already has Node.js properly installed and on its PATH, you can skip this step
entirely — the launcher scripts fall back to a system-wide `node` if no bundled copy is
found.)

## Step 2 — Configure secrets

Inside the package folder:

```
copy .env.example .env        (Windows)
cp .env.example .env           (Mac/Linux)
```

Open `.env` in Notepad and replace the placeholder secret values
(`SESSION_SECRET`, `CSRF_SECRET`, and — for the Regional Hub — `ENCRYPTION_KEY`) with
your own random values. You can generate one at a time by running, from inside the
package folder:

```
node\node.exe -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it as many times as you have placeholders to fill in, pasting each result in place
of the matching `replace-with-...` text.

You don't need to touch `DATABASE_URL` — `start.bat`/`start.sh` set it automatically
based on wherever you've actually placed this folder, so it works correctly no matter
where you install it.

For the **Regional Hub**, also set `MAIN_HUB_URL` to wherever the Main Hub will actually
be reachable from this machine (e.g. `http://192.168.1.10:3000` on a hospital LAN, or
a public HTTPS URL if connecting across separate sites — see the root `README.md` for
more on cross-site setups).

## Step 3 — Copy to the target machine

Copy the whole package folder (now including your `node/` folder and your `.env`) onto
a USB drive, then onto the hospital computer. Anywhere is fine — e.g.
`C:\NCR\main-hub\`.

## Step 4 — First run

Double-click `start.bat` (Windows) or run `./start.sh` (Mac/Linux) from inside the
folder. On the very first run it will:

1. Create the SQLite database file and set up all tables.
2. Start the server.

You'll see `Ready` in the window once it's up. Leave that window open — closing it
stops the server. Then open a browser to:

- **Main Hub:** <http://localhost:3000>
- **Regional Hub:** <http://localhost:3001>

## Step 5 — Create the admin account

The very first time, from that same machine, open a second terminal/command prompt (or
just visit the URL in a browser — the login page will explain if setup hasn't run yet)
and run:

```
curl -X POST http://localhost:3000/api/auth/setup      (Main Hub)
curl -X POST http://localhost:3001/api/auth/setup      (Regional Hub)
```

This creates the default admin login: **admin@ncr.gov.gh** / **Admin123!** — change the
password immediately after your first login.

## Step 6 — Connect a Regional Hub to the Main Hub

See the root `README.md`'s "Connect the Regional Hub to the Main Hub" section — this is
a one-time setup done from each app's web UI (Main Hub → Regional Hubs → Register New
Regional Hub, then paste the resulting API key into the Regional Hub's Sync Data →
Edit form).

---

## Making it start automatically (optional, recommended for real deployment)

Right now, someone has to double-click `start.bat` and leave the window open. For a
machine that should just always be running the registry, two common options:

**Simplest — Windows Startup folder:** Press `Win + R`, type `shell:startup`, and drop
a shortcut to `start.bat` in the folder that opens. It'll launch automatically (in a
visible window) every time the machine boots and someone logs in.

**More robust — run as a Windows Service:** Use a free tool like
[NSSM](https://nssm.cc/) to register `node.exe server.js` as a background Windows
service, so it starts before login, restarts automatically if it crashes, and doesn't
need a visible terminal window. This is the recommended setup for a machine that acts
as a shared server others connect to over the hospital network.

---

## Troubleshooting

- **"node is not recognized..."** — the `node\` folder is missing or misplaced; see
  Step 1. Make sure the path is exactly `main-hub\node\node.exe`.
- **"Cannot find module '@libsql/win32-x64-msvc'" (or a similar `@libsql`/`sharp`
  platform error)** — the package you're running was built on a different operating
  system than this machine. Get a package rebuilt/downloaded for the right OS; this
  isn't something you can fix by editing files.
- **"Invalid key length" / `ERR_CRYPTO_INVALID_KEYLEN`** — `ENCRYPTION_KEY` in `.env`
  (Regional Hub only) isn't a valid 64-character hex string. Regenerate it with the
  command in Step 3 and paste the *entire* output, with no extra characters.
- **Port already in use** — another program (or a previous, still-running copy of this
  app) is using port 3000/3001. Close it, or edit `start.bat`/`start.sh` to use a
  different `PORT` value.
- **Nothing loads in the browser** — check the terminal window for errors; make sure
  you see the line `Ready` before trying to open the browser.
