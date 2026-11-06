# Installing the National Cleft Registry at a hospital

This guide is for the person setting up the computer that runs the registry: the
**Main Hub** at the national centre (KATH), or a **Regional Hub** at a regional hospital.
No programming tools, internet or administrator knowledge of Node.js is needed.

You need the package for your hub, for example `ncr-regional-hub-win-x64.zip` (built with
`npm run package:windows`, see README.md), and `SHA256SUMS.txt`.

---

## 1. Check the file and unpack it

1. Check the download is intact. In PowerShell, in the folder with the zip:
   `Get-FileHash .\ncr-regional-hub-win-x64.zip -Algorithm SHA256`.
   The long code must match the line in `SHA256SUMS.txt`.
2. Right-click the zip → **Extract All…** to a permanent location, e.g. `C:\NCR\`.
   You get `C:\NCR\regional-hub\` (or `C:\NCR\main-hub\`).
   Do not run it from inside the zip or from a USB stick.

## 2. Start it

Double-click **`start.bat`** (Linux/macOS: run `./start.sh`). On the first start it
automatically:

1. creates the `.env` file with new random secret keys (including the key that encrypts
   the database),
2. creates the encrypted database,
3. starts the server and prints a **SETUP TOKEN**.

Leave the window open: closing it stops the registry. When you see `Ready`, open a browser
on the same computer:

- Main Hub: <http://localhost:3000>
- Regional Hub: <http://localhost:3001>

> If Windows Firewall asks, allow access on **private networks** so other computers in the
> hospital can use the registry.

## 3. ⚠️ Back up the `.env` file now

`.env` holds `DB_ENCRYPTION_KEY`. **If it is lost, the patient database can never be
opened again.** Copy `.env` to a safe place **separate from the database backups**: an
encrypted USB stick in a locked drawer, or a password manager. Never email it.

## 4. Create the administrator (setup wizard)

The browser shows **First-time setup**:

- **Setup token**: from the black start window, or the file `setup-token.txt` in the app
  folder. It stops anyone else on the network from claiming the server first.
- **Regional Hub only**: hospital name, **hospital code** (e.g. `TTH`, which must match
  what the Main Hub registers) and region.
- Your name, email and a strong password (at least 12 characters with upper- and
  lower-case letters, a number and a symbol).

You are now the hub's **administrator**, with access to everything. The token file is
deleted automatically.

## 5. Create accounts for your colleagues

**Users → Add User.** Enter their name and email and pick a **role** (each role's
permissions are shown on that screen and in README.md). Leave the password empty and a
temporary password is generated and shown **once**; give it to the person privately. They
must choose their own password when they first sign in.

On a user's **Edit** page you can change their role, **reset password**, **unlock** (after
5 wrong passwords an account locks for 15 minutes) or **disable** the account. Disable
accounts as soon as someone leaves. Every sign-in and action is recorded under **Audit Log**.

## 6. Connect a Regional Hub to the Main Hub

**On the Main Hub** (administrator): **Regional Hubs → Add Regional Hub**. Enter the
hospital's name and the **same code** used in the Regional Hub's setup. The Main Hub shows
a **sync API key** **once**. Pass it to the regional administrator privately, by phone or
in person, not in a plain email with other details.

**On the Regional Hub** (administrator): **Sync with Main Hub → Edit connection**:

- **Main Hub URL**: the address where the Main Hub can be reached:
  - same hospital network / VPN: `http://<main-hub-pc-ip>:3000`, e.g. `http://10.20.1.5:3000`
  - over the internet: an **https://** address (required; plain http is refused for
    internet addresses so patient data and the key are never sent unencrypted)
- **API key**: the key from the Main Hub.

Press **Save and test**. If the Main Hub is reachable, the key is checked immediately. If
the Main Hub is offline, the settings are saved and used once it is back.

From then on the Regional Hub syncs **automatically** (every 5 minutes and shortly after
each new record). The bar at the top shows "All records synced" or "N records saved here,
waiting to sync". Data entry works normally while offline, and nothing is lost: records
wait in the queue until the Main Hub confirms them.

If a key may have leaked, or a Regional Hub computer is replaced: Main Hub → **Regional
Hubs → New sync key**, then enter the new key on the Regional Hub. The old key stops working
immediately.

## 7. Let other computers in the hospital use it

Find the server's IP address (Windows: run `ipconfig`, look for "IPv4 Address"). Other
computers on the hospital network open `http://<that-ip>:3001` (Regional Hub) or
`http://<that-ip>:3000` (Main Hub). Give the server a fixed IP address in your router or
DHCP so the address does not change.

## 8. HTTPS (required when the Main Hub is on the internet)

The registry itself speaks plain HTTP, which is fine inside a hospital network or VPN. For
access over the internet, put it behind HTTPS, e.g. with [Caddy](https://caddyserver.com/)
(free, automatic certificates). Example `Caddyfile` on the Main Hub server:

```
registry.example.gov.gh {
    reverse_proxy localhost:3000
}
```

Then add `COOKIE_SECURE=true` to that hub's `.env` and restart. Regional Hubs then use
`https://registry.example.gov.gh` as the Main Hub URL.

Alternatively, connect the sites with a VPN (WireGuard, Tailscale, or the ministry network)
and use the private address.

## 9. Backups

- A backup is made **every time the app starts** and **once a day** while it runs, into the
  `backups\` folder (the 30 newest are kept). Backups are encrypted with the same key as the
  database.
- Make an extra copy any time, e.g. straight onto a USB drive:
  `node\node.exe backup.mjs E:\` (Linux/macOS: `node/bin/node backup.mjs /media/usb`).
- Copy the `backups\` folder off the machine regularly (weekly at least). Keep the `.env`
  copy **somewhere else**.

**Restoring:** stop the app, rename the broken `main_hub.db` / `local.db`, copy a backup
file into the app folder with that name, make sure `.env` is the original one, and start
again.

## 10. Start automatically (recommended)

**Simple:** press `Win + R`, type `shell:startup`, and put a shortcut to `start.bat` in the
folder that opens. The registry starts whenever someone logs in.

**Better, as a Windows service** (starts before login, restarts if it crashes): use
[NSSM](https://nssm.cc/). In an administrator command prompt:

```
nssm install NCR-RegionalHub "C:\NCR\regional-hub\start.bat"
nssm set NCR-RegionalHub AppDirectory "C:\NCR\regional-hub"
nssm start NCR-RegionalHub
```

When running as a service, read the setup token from `setup-token.txt` in the app folder.

Linux: create a systemd service that runs `/opt/ncr/main-hub/start.sh`.

## 11. Updating to a new version

1. Stop the app (close the window, or `nssm stop NCR-RegionalHub`).
2. Copy the whole app folder somewhere safe (a full backup).
3. Extract the new package **over** the existing folder. Keep your `.env`, the `.db` file
   and `backups\`; the new package does not contain them.
4. Start the app. It backs up the database and upgrades it automatically.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Node.js not found` | The `node` folder is missing. Use a package built with `--with-node`. |
| `Cannot find module '@libsql/win32-x64-msvc'` (or another `@libsql/...`) | The package was built for another operating system. Rebuild with the right `--target`. |
| `DB_ENCRYPTION_KEY does not match this database file` | The `.env` file was replaced or edited. Put back the original `.env` (your safe copy). |
| `DB_ENCRYPTION_KEY is missing/invalid` | Run `node\node.exe setup-env.mjs`, or restore your `.env` copy. Do not generate a new key for an existing database. |
| Setup page asks for a token I don't have | It is in the start window and in `setup-token.txt` in the app folder. Restarting prints it again. |
| "Account temporarily locked" | Wait 15 minutes, or an administrator presses **Unlock account** on the user's Edit page. |
| Admin forgot their password | Another administrator can reset it. If there is no other admin, contact the registry's technical team. |
| Sync page: "Main Hub not reachable" | Normal while offline: data is kept. Check the Main Hub is running and the URL is reachable from this PC (open it in a browser). |
| Sync page: "rejected this hub's credentials" | The key was rotated or mistyped. Get the current key from the Main Hub admin and enter it again. |
| Sync page: records "failed" | The Main Hub refused the data; the reason is listed. Fix the record, then press **Retry failed**. |
| "Use https:// for a Main Hub on the internet" | See section 8. |
| Port already in use | Another copy is running. Close it, or set another port: `set PORT=3005` before `start.bat`. |
| Other PCs can't open it | Allow the app in Windows Firewall (private networks) and use the server's IP address, not `localhost`. |
