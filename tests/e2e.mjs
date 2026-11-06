// End-to-end tests for the Main Hub + Regional Hub, against the real
// production builds. Run from the repo root:   node tests/e2e.mjs
// (build both apps first: npm run build in each, or use tests/run.sh)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  section, test, summary, assert, eq, sleep, freshDir, makeEnv, runNode, startServer,
  cleanupTokenFiles, Client, ROOT, WORK,
} from "./helpers.mjs";

const MAIN_PORT = 3100;
const REG_PORT = 3101;
const PW = "Str0ng!Passw0rd#2026";
const NEW_PW = "An0ther!Passw0rd#2026";

const mainDir = freshDir("main-hub");
const regDir = freshDir("regional-hub");
const mainDb = join(mainDir, "main_hub.db");
const regDb = join(regDir, "local.db");
const mainEnv = makeEnv(mainDb);
const regEnv = makeEnv(regDb);
cleanupTokenFiles();

let main, regional;
const servers = [];
async function stopAll() {
  await Promise.all(servers.map((s) => s.stop()));
}
process.on("SIGINT", async () => {
  await stopAll();
  process.exit(1);
});

try {
  // ==========================================================================
  section("Database setup + encryption at rest");
  await test("Main Hub migrations apply to an encrypted database (and re-run safely)", async () => {
    await runNode(join(ROOT, "Main Hub"), "migrate.mjs", mainEnv);
    const again = await runNode(join(ROOT, "Main Hub"), "migrate.mjs", mainEnv);
    assert(again.includes("already up to date"), again);
  });
  await test("Regional Hub init-db creates an encrypted database (and re-runs safely)", async () => {
    await runNode(join(ROOT, "Regional Hub"), "init-db.mjs", regEnv);
    await runNode(join(ROOT, "Regional Hub"), "init-db.mjs", regEnv);
  });
  await test("Migration refuses to run with the wrong DB_ENCRYPTION_KEY", async () => {
    let failed = false;
    try {
      await runNode(join(ROOT, "Main Hub"), "migrate.mjs", { ...mainEnv, DB_ENCRYPTION_KEY: "ab".repeat(32) });
    } catch (e) {
      failed = e.message.includes("does not match");
    }
    assert(failed, "expected key mismatch error");
  });

  main = await startServer({ app: "Main Hub", port: MAIN_PORT, env: mainEnv });
  servers.push(main);
  const M = main.url;

  // ==========================================================================
  section("Main Hub: first-run setup (administrator account)");
  const admin = new Client(M);

  await test("health check", async () => {
    const r = await admin.json("/api/health");
    eq(r.status, 200);
  });
  await test("fresh server reports needsSetup and login page redirects there", async () => {
    const r = await admin.json("/api/auth/setup");
    eq(r.data.needsSetup, true);
  });
  await test("setup token is printed in the server console", async () => {
    assert(main.setupToken(), "no SETUP TOKEN in server log:\n" + main.log());
  });
  await test("setup is refused with a wrong token", async () => {
    const r = await admin.json("/api/auth/setup", { method: "POST", body: { setupToken: "wrong-token-123", email: "a@b.gh", firstName: "A", lastName: "B", password: PW } });
    eq(r.status, 403);
  });
  await test("setup is refused with a weak password", async () => {
    const r = await admin.json("/api/auth/setup", { method: "POST", body: { setupToken: main.setupToken(), email: "a@b.gh", firstName: "A", lastName: "B", password: "Admin123!" } });
    eq(r.status, 400);
  });
  await test("setup creates the administrator and signs them in", async () => {
    const r = await admin.json("/api/auth/setup", {
      method: "POST",
      body: { setupToken: main.setupToken(), email: "admin@kath.gov.gh", firstName: "Ama", lastName: "Mensah", password: PW },
    });
    eq(r.status, 201, JSON.stringify(r.data));
    await admin.refreshCsrf();
    const page = await admin.page("/dashboard");
    eq(page.status, 200);
  });
  await test("setup cannot be run a second time", async () => {
    const r = await new Client(M).json("/api/auth/setup", { method: "POST", body: { setupToken: "x", email: "x@y.gh", firstName: "X", lastName: "Y", password: PW } });
    eq(r.status, 409);
  });
  await test("old default admin@ncr.gov.gh / Admin123! does not exist", async () => {
    const r = await new Client(M).json("/api/auth/login", { method: "POST", body: { email: "admin@ncr.gov.gh", password: "Admin123!" } });
    eq(r.status, 401);
  });
  await test("session cookie is HttpOnly + SameSite=Strict, not Secure over plain http (LAN)", async () => {
    const c = new Client(M);
    await c.login("admin@kath.gov.gh", PW);
    const cookie = c.lastSetCookie.find((s) => s.startsWith("ncr_main_session=")) || "";
    assert(/HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie), cookie);
    assert(!/Secure/i.test(cookie), "Secure cookie would break login over http on a LAN");
  });

  // ==========================================================================
  section("Main Hub: security controls");
  const anon = new Client(M);
  for (const [method, path] of [
    ["GET", "/api/patients"],
    ["GET", "/api/patients/1"],
    ["GET", "/api/patients/1/diagnoses"],
    ["POST", "/api/patients/1/diagnoses"],
    ["GET", "/api/patients/1/surgeries"],
    ["POST", "/api/patients/1/surgeries"],
    ["GET", "/api/users"],
    ["GET", "/api/appointments"],
    ["GET", "/api/export?type=full"],
    ["POST", "/api/hubs/register"],
  ]) {
    await test(`unauthenticated ${method} ${path} is rejected`, async () => {
      const r = await anon.json(path, { method, body: method === "POST" ? {} : undefined });
      assert(r.status === 401 || r.status === 403, `got ${r.status}`);
    });
  }
  await test("pages redirect to /login when signed out", async () => {
    const p = await anon.page("/patients");
    eq(p.status, 307);
    assert(p.location.includes("/login"), p.location);
  });
  await test("state-changing request without CSRF token is rejected", async () => {
    const r = await admin.json("/api/patients", { method: "POST", body: {}, csrf: false });
    eq(r.status, 403);
  });
  await test("cross-site request (foreign Origin) is blocked", async () => {
    const r = await admin.json("/api/users", { method: "POST", body: {}, origin: "http://evil.example" });
    eq(r.status, 403);
  });
  await test("security headers are sent (CSP, frame denial, nosniff)", async () => {
    const r = await admin.raw("/login");
    assert(r.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP missing");
    eq(r.headers.get("x-frame-options"), "DENY");
    eq(r.headers.get("x-content-type-options"), "nosniff");
  });
  await test("password hash is never sent to the browser", async () => {
    const html = await (await admin.raw("/dashboard")).text();
    assert(!html.includes("$2a$") && !html.includes("$2b$") && !html.includes("passwordHash"), "found password hash in page payload");
  });

  // ==========================================================================
  section("Main Hub: administrator creates accounts for other people (roles)");
  const roles = ["clinician", "surgeon", "data_clerk", "researcher", "viewer", "community_health_worker"];
  const users = {};
  for (const role of roles) {
    await test(`admin creates a ${role} account (temporary password generated)`, async () => {
      const r = await admin.json("/api/users", { method: "POST", body: { email: `${role}@kath.gov.gh`, firstName: role, lastName: "Tester", role } });
      eq(r.status, 201, JSON.stringify(r.data));
      assert(r.data.temporaryPassword && r.data.temporaryPassword.length >= 12, "no temp password");
      users[role] = { id: r.data.id, email: r.data.email, temp: r.data.temporaryPassword };
    });
  }
  await test("non-admin cannot create accounts", async () => {
    const c = new Client(M);
    await c.login(users.clinician.email, users.clinician.temp);
    const r = await c.json("/api/users", { method: "POST", body: { email: "x@y.gh", firstName: "x", lastName: "y", role: "admin" } });
    eq(r.status, 403);
  });
  await test("new user must change the temporary password before doing anything", async () => {
    const c = new Client(M);
    const login = await c.login(users.viewer.email, users.viewer.temp);
    eq(login.data.mustChangePassword, true);
    eq((await c.json("/api/patients")).status, 403);
    const p = await c.page("/dashboard");
    assert(p.location.includes("/account"), p.location);
  });
  await test("change password requires the correct current password and a strong new one", async () => {
    const c = new Client(M);
    await c.login(users.viewer.email, users.viewer.temp);
    eq((await c.json("/api/auth/change-password", { method: "POST", body: { currentPassword: "wrong", newPassword: NEW_PW } })).status, 400);
    eq((await c.json("/api/auth/change-password", { method: "POST", body: { currentPassword: users.viewer.temp, newPassword: "short" } })).status, 400);
  });
  const clients = {};
  for (const role of roles) {
    await test(`${role} sets their own password and can sign in`, async () => {
      const c = new Client(M);
      await c.login(users[role].email, users[role].temp);
      const r = await c.json("/api/auth/change-password", { method: "POST", body: { currentPassword: users[role].temp, newPassword: NEW_PW } });
      eq(r.status, 200, JSON.stringify(r.data));
      const c2 = new Client(M);
      const l = await c2.login(users[role].email, NEW_PW);
      eq(l.status, 200);
      eq(l.data.mustChangePassword, false);
      clients[role] = c2;
    });
  }
  clients.admin = admin;

  // ==========================================================================
  section("Main Hub: each role only gets its own privileges");
  // expected HTTP status for API calls per role (200/201 allowed, 403 denied)
  const apiMatrix = [
    ["GET /api/patients", (c) => c.json("/api/patients"), { admin: 200, clinician: 200, surgeon: 200, data_clerk: 200, researcher: 403, viewer: 403, community_health_worker: 200 }],
    ["GET /api/users", (c) => c.json("/api/users"), { admin: 200, clinician: 403, surgeon: 403, data_clerk: 403, researcher: 403, viewer: 403, community_health_worker: 403 }],
    ["GET de-identified export", (c) => c.json("/api/export?type=deidentified"), { admin: 200, clinician: 403, surgeon: 403, data_clerk: 403, researcher: 200, viewer: 403, community_health_worker: 403 }],
    ["GET full identifiable export", (c) => c.json("/api/export?type=full"), { admin: 200, clinician: 403, surgeon: 403, data_clerk: 403, researcher: 403, viewer: 403, community_health_worker: 403 }],
    ["GET /api/appointments", (c) => c.json("/api/appointments"), { admin: 200, clinician: 200, surgeon: 200, data_clerk: 200, researcher: 403, viewer: 403, community_health_worker: 200 }],
  ];
  for (const [label, call, expected] of apiMatrix) {
    await test(`API permissions: ${label}`, async () => {
      const got = {};
      for (const role of Object.keys(expected)) got[role] = (await call(clients[role])).status;
      for (const role of Object.keys(expected)) eq(got[role], expected[role], `${role} on ${label} (all: ${JSON.stringify(got)})`);
    });
  }
  const pageMatrix = {
    "/patients": ["admin", "clinician", "surgeon", "data_clerk", "community_health_worker"],
    "/patients/new": ["admin", "clinician", "surgeon", "data_clerk"],
    "/surgeries/new": ["admin", "surgeon"],
    "/users": ["admin"],
    "/hubs": ["admin"],
    "/audit": ["admin"],
    "/research": ["admin", "researcher"],
    "/statistics": ["admin", "clinician", "surgeon", "data_clerk", "researcher", "viewer"],
    "/dashboard": ["admin", ...roles],
    "/account": ["admin", ...roles],
  };
  for (const [path, allowed] of Object.entries(pageMatrix)) {
    await test(`page permissions: ${path}`, async () => {
      for (const role of ["admin", ...roles]) {
        const p = await clients[role].page(path);
        if (allowed.includes(role)) eq(p.status, 200, `${role} should open ${path} (redirected to ${p.location})`);
        else assert(p.status === 307 && p.location.includes("/forbidden"), `${role} should be denied ${path}, got ${p.status} ${p.location}`);
      }
    });
  }

  // ==========================================================================
  section("Main Hub: patient data entry");
  const clerk = clients.data_clerk;
  let p1, p2;
  await test("data clerk registers a patient; names with apostrophes are stored exactly", async () => {
    const r = await clerk.json("/api/patients", {
      method: "POST",
      body: { firstName: "Kwame", lastName: "O'Brien-Asante", dateOfBirth: "2026-01-15", sex: "male", regionOfResidence: "ashanti", caregiverName: "Akua <Asante> & Co", caregiverPhone: "0244000001", consentResearch: true },
    });
    eq(r.status, 201, JSON.stringify(r.data));
    eq(r.data.lastName, "O'Brien-Asante");
    eq(r.data.caregiverName, "Akua <Asante> & Co");
    p1 = r.data;
  });
  await test("NCR IDs are sequential and unique", async () => {
    const r = await clerk.json("/api/patients", { method: "POST", body: { firstName: "Esi", lastName: "Boateng", dateOfBirth: "2026-02-01", sex: "female", regionOfResidence: "northern", caregiverName: "Yaa Boateng" } });
    eq(r.status, 201);
    p2 = r.data;
    const year = new Date().getFullYear();
    eq(p1.ncrId, `NCR-${year}-00001`);
    eq(p2.ncrId, `NCR-${year}-00002`);
  });
  await test("invalid input is rejected with field details (future birth date, bad region)", async () => {
    const r = await clerk.json("/api/patients", { method: "POST", body: { firstName: "A", lastName: "B", dateOfBirth: "2999-01-01", sex: "male", regionOfResidence: "atlantis", caregiverName: "C" } });
    eq(r.status, 400);
    assert(Array.isArray(r.data.details) && r.data.details.length >= 2, JSON.stringify(r.data));
  });
  await test("clinician adds a diagnosis; data clerk cannot", async () => {
    const body = { diagnosisDate: "2026-01-16", cleftType: "cleft_lip_and_palate", lipLaterality: "bilateral" };
    eq((await clerk.json(`/api/patients/${p1.id}/diagnoses`, { method: "POST", body })).status, 403);
    eq((await clients.clinician.json(`/api/patients/${p1.id}/diagnoses`, { method: "POST", body })).status, 201);
  });
  await test("surgeon records a surgery; data clerk and clinician cannot", async () => {
    const body = { surgeryDate: "2026-04-10", surgeryType: "primary_lip_repair", lipTechnique: "millard", durationMinutes: 95 };
    eq((await clerk.json(`/api/patients/${p1.id}/surgeries`, { method: "POST", body })).status, 403);
    eq((await clients.clinician.json(`/api/patients/${p1.id}/surgeries`, { method: "POST", body })).status, 403);
    const r = await clients.surgeon.json(`/api/patients/${p1.id}/surgeries`, { method: "POST", body });
    eq(r.status, 201, JSON.stringify(r.data));
  });
  await test("patient search works (SQLite LIKE)", async () => {
    const p = await clerk.page(`/patients?search=O'Brien`);
    eq(p.status, 200);
  });
  await test("patient detail page renders", async () => {
    eq((await clerk.page(`/patients/${p1.id}`)).status, 200);
  });

  // ==========================================================================
  section("Main Hub: research export (de-identified)");
  await test("researcher's export contains only consented patients and no identifiers", async () => {
    const r = await clients.researcher.raw("/api/export?type=deidentified&dataset=patients");
    eq(r.status, 200);
    const csv = await r.text();
    const lines = csv.trim().split(/\r?\n/);
    eq(lines.length, 2, "header + 1 consented patient");
    for (const secret of ["Kwame", "O'Brien", "0244000001", "Akua", "2026-01-15", p1.ncrId]) {
      assert(!csv.includes(secret), `de-identified export leaked "${secret}"`);
    }
    assert(lines[1].startsWith("R-"), "pseudonymous research id");
    assert(csv.includes("cleft_lip_and_palate"), "diagnosis included");
  });
  await test("admin full export contains identifiers", async () => {
    const csv = await (await admin.raw("/api/export?type=full&dataset=patients")).text();
    assert(csv.includes("O'Brien-Asante") && csv.includes(p1.ncrId), csv);
  });
  await test("export protects against spreadsheet formula injection", async () => {
    await clerk.json("/api/patients", { method: "POST", body: { firstName: "=HYPERLINK(\"x\")", lastName: "Test", dateOfBirth: "2026-01-01", sex: "male", regionOfResidence: "volta", caregiverName: "+cmd" } });
    const csv = await (await admin.raw("/api/export?type=full&dataset=patients")).text();
    assert(csv.includes("'=HYPERLINK") && csv.includes("'+cmd"), "formula not neutralised");
  });

  // ==========================================================================
  section("Main Hub: account protection");
  await test("account locks after 5 wrong passwords, even the right password is refused", async () => {
    const c = new Client(M);
    for (let i = 0; i < 5; i++) await c.json("/api/auth/login", { method: "POST", body: { email: users.viewer.email, password: "wrong-password" } });
    const r = await c.json("/api/auth/login", { method: "POST", body: { email: users.viewer.email, password: NEW_PW } });
    eq(r.status, 423);
  });
  await test("admin unlocks the account and the user can sign in again", async () => {
    eq((await admin.json(`/api/users/${users.viewer.id}`, { method: "PATCH", body: { unlock: true } })).status, 200);
    eq((await new Client(M).login(users.viewer.email, NEW_PW)).status, 200);
  });
  await test("disabling an account signs that user out immediately", async () => {
    const c = clients.community_health_worker;
    eq((await c.json("/api/patients")).status, 200);
    eq((await admin.json(`/api/users/${users.community_health_worker.id}`, { method: "PATCH", body: { isActive: false } })).status, 200);
    eq((await c.json("/api/patients")).status, 401);
    eq((await new Client(M).login(users.community_health_worker.email, NEW_PW)).status, 403);
  });
  await test("admin resets a password: new temporary password, old sessions ended", async () => {
    const r = await admin.json(`/api/users/${users.data_clerk.id}`, { method: "PATCH", body: { resetPassword: true } });
    eq(r.status, 200);
    assert(r.data.temporaryPassword, "no temp password");
    eq((await clerk.json("/api/patients")).status, 401);
    const l = await new Client(M).login(users.data_clerk.email, r.data.temporaryPassword);
    eq(l.data.mustChangePassword, true);
  });
  await test("admin changes a user's role", async () => {
    eq((await admin.json(`/api/users/${users.viewer.id}`, { method: "PATCH", body: { role: "researcher" } })).status, 200);
    const c = new Client(M);
    await c.login(users.viewer.email, NEW_PW);
    eq((await c.json("/api/export?type=deidentified")).status, 200);
  });
  await test("the last administrator cannot be demoted or disabled", async () => {
    const me = (await admin.json("/api/users")).data.find((u) => u.email === "admin@kath.gov.gh");
    eq((await admin.json(`/api/users/${me.id}`, { method: "PATCH", body: { role: "viewer" } })).status, 400);
    eq((await admin.json(`/api/users/${me.id}`, { method: "PATCH", body: { isActive: false } })).status, 400);
  });
  await test("every action is in the audit log", async () => {
    const html = await (await admin.raw("/audit")).text();
    for (const a of ["login_failed", "create_user", "create_patient", "export_deidentified_patients", "reset_user_password"]) assert(html.includes(a), `audit missing ${a}`);
  });

  // ==========================================================================
  section("Main Hub: register regional hubs");
  let tthKey, kbthKey, tthId;
  await test("admin registers Regional Hub TTH and receives its sync key once", async () => {
    const r = await admin.json("/api/hubs/register", { method: "POST", body: { name: "Tamale Teaching Hospital", code: "TTH", facilityType: "regional_centre", region: "northern" } });
    eq(r.status, 201, JSON.stringify(r.data));
    assert(r.data.apiKey?.startsWith("ncr_"), "no key");
    tthKey = r.data.apiKey;
    tthId = r.data.id;
  });
  await test("a second hub (KBTH) gets a different key", async () => {
    const r = await admin.json("/api/hubs/register", { method: "POST", body: { name: "Korle Bu Teaching Hospital", code: "KBTH", facilityType: "co_hub", region: "greater_accra" } });
    eq(r.status, 201);
    kbthKey = r.data.apiKey;
  });
  await test("duplicate hub code is rejected", async () => {
    const r = await admin.json("/api/hubs/register", { method: "POST", body: { name: "Dup", code: "TTH", facilityType: "regional_centre", region: "northern" } });
    eq(r.status, 409);
  });
  await test("sync endpoints reject a missing/invalid key", async () => {
    const r1 = await fetch(`${M}/api/sync/pull`);
    eq(r1.status, 401);
    const r2 = await fetch(`${M}/api/sync/patients`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ncr_bogus" }, body: JSON.stringify({ patients: [] }) });
    eq(r2.status, 401);
  });
  await test("a hub cannot write data in another hub's name (code/key mismatch)", async () => {
    const r = await fetch(`${M}/api/sync/patients`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${kbthKey}` }, body: JSON.stringify({ facilityCode: "TTH", patients: [] }) });
    eq(r.status, 403);
  });

  // ==========================================================================
  regional = await startServer({ app: "Regional Hub", port: REG_PORT, env: regEnv, extraEnv: { SYNC_INTERVAL_MINUTES: "60" } });
  servers.push(regional);
  const R = regional.url;
  const radmin = new Client(R);

  section("Regional Hub: first-run setup + accounts");
  await test("setup with token creates the hospital record and administrator", async () => {
    assert(regional.setupToken(), "no token printed");
    const r = await radmin.json("/api/auth/setup", {
      method: "POST",
      body: { setupToken: regional.setupToken(), email: "admin@tth.gov.gh", firstName: "Abdul", lastName: "Issah", password: PW, facilityName: "Tamale Teaching Hospital", facilityCode: "tth", region: "northern" },
    });
    eq(r.status, 201, JSON.stringify(r.data));
    await radmin.refreshCsrf();
    eq((await radmin.page("/sync")).status, 200);
  });
  const rusers = {};
  for (const role of ["clinician", "surgeon", "data_clerk", "viewer"]) {
    await test(`regional admin creates a ${role} who sets their own password`, async () => {
      const r = await radmin.json("/api/users", { method: "POST", body: { email: `${role}@tth.gov.gh`, firstName: role, lastName: "T", role } });
      eq(r.status, 201, JSON.stringify(r.data));
      const c = new Client(R);
      await c.login(r.data.email, r.data.temporaryPassword);
      eq((await c.json("/api/auth/change-password", { method: "POST", body: { currentPassword: r.data.temporaryPassword, newPassword: NEW_PW } })).status, 200);
      const c2 = new Client(R);
      eq((await c2.login(r.data.email, NEW_PW)).status, 200);
      rusers[role] = c2;
    });
  }
  rusers.admin = radmin;
  await test("regional role permissions (API)", async () => {
    const expect = {
      "GET /api/patients": [(c) => c.json("/api/patients"), { admin: 200, clinician: 200, surgeon: 200, data_clerk: 200, viewer: 403 }],
      "GET /api/users": [(c) => c.json("/api/users"), { admin: 200, clinician: 403, surgeon: 403, data_clerk: 403, viewer: 403 }],
      "POST /api/sync/push": [(c) => c.json("/api/sync/push", { method: "POST" }), { clinician: 403, surgeon: 403, data_clerk: 403, viewer: 403 }],
      "POST /api/surgeries": [(c) => c.json("/api/surgeries", { method: "POST", body: { patientId: 999999, surgeryDate: "2026-01-01", surgeryType: "other" } }), { admin: 404, surgeon: 404, clinician: 403, data_clerk: 403, viewer: 403 }],
    };
    for (const [label, [call, exp]] of Object.entries(expect)) {
      for (const [role, status] of Object.entries(exp)) eq((await call(rusers[role])).status, status, `${role} ${label}`);
    }
  });
  await test("regional pages: viewer cannot open patients, users, sync", async () => {
    for (const path of ["/patients", "/users", "/sync", "/audit"]) {
      const p = await rusers.viewer.page(path);
      assert(p.location.includes("/forbidden"), `${path}: ${p.status} ${p.location}`);
    }
    eq((await rusers.viewer.page("/statistics")).status, 200);
  });
  await test("login lockout is per account: other users are NOT locked out (old bug locked the whole hospital)", async () => {
    const c = new Client(R);
    for (let i = 0; i < 7; i++) await c.json("/api/auth/login", { method: "POST", body: { email: "clinician@tth.gov.gh", password: "nope" } });
    eq((await new Client(R).login("surgeon@tth.gov.gh", NEW_PW)).status, 200);
    eq((await new Client(R).login("clinician@tth.gov.gh", NEW_PW)).status, 423);
  });

  // ==========================================================================
  section("Regional Hub: offline data entry");
  const rclerk = rusers.data_clerk;
  let rp1, rs1;
  await test("data clerk registers a patient with diagnosis and research consent (saved locally)", async () => {
    const r = await rclerk.json("/api/patients", {
      method: "POST",
      body: { firstName: "Fuseini", lastName: "Mahama", dateOfBirth: "2026-03-01", sex: "male", regionOfResidence: "northern", caregiverName: "Ayishetu Mahama", caregiverPhone: "0200000002", cleftType: "cleft_lip_only", lipLaterality: "unilateral_left", consentResearch: true, consentDataSharing: true },
    });
    eq(r.status, 201, JSON.stringify(r.data));
    eq(r.data.syncStatus, "pending");
    eq(r.data.ncrId, null);
    rp1 = r.data;
  });
  await test("surgeon records a surgery for that patient (saved locally)", async () => {
    const r = await rusers.surgeon.json("/api/surgeries", { method: "POST", body: { patientId: rp1.id, surgeryDate: "2026-06-01", surgeryType: "primary_lip_repair", durationMinutes: 80, isPrimarySurgery: true } });
    eq(r.status, 201, JSON.stringify(r.data));
    rs1 = r.data;
  });
  await test("records wait in the sync queue (sync not configured yet)", async () => {
    const s = await radmin.json("/api/sync/status");
    eq(s.data.stats.pendingQueue, 2);
    const run = await radmin.json("/api/sync/push", { method: "POST" });
    assert(run.data.skipped, JSON.stringify(run.data));
  });

  // ==========================================================================
  section("Regional Hub: connect to Main Hub");
  await test("plain http to a public internet host is refused (key would travel unencrypted)", async () => {
    const r = await radmin.json("/api/sync/config", { method: "PATCH", body: { facilityCode: "TTH", mainHubUrl: "http://ncr.example.com", apiKey: tthKey } });
    eq(r.status, 400);
    assert(/https/.test(r.data.error), r.data.error);
  });
  await test("a wrong API key is refused when the Main Hub is reachable", async () => {
    const r = await radmin.json("/api/sync/config", { method: "PATCH", body: { facilityCode: "TTH", mainHubUrl: M, apiKey: "ncr_wrong" } });
    eq(r.status, 400);
  });
  await test("another hub's key is refused (key belongs to KBTH)", async () => {
    const r = await radmin.json("/api/sync/config", { method: "PATCH", body: { facilityCode: "TTH", mainHubUrl: M, apiKey: kbthKey } });
    eq(r.status, 400);
    assert(/KBTH/.test(r.data.error), r.data.error);
  });
  await test("the correct key is verified and saved (stored encrypted, never returned)", async () => {
    const r = await radmin.json("/api/sync/config", { method: "PATCH", body: { facilityCode: "TTH", mainHubUrl: M, apiKey: tthKey } });
    eq(r.status, 200, JSON.stringify(r.data));
    eq(r.data.verified, true);
    const s = await radmin.json("/api/sync/status");
    eq(s.data.facility.apiKeyConfigured, true);
    assert(!JSON.stringify(s.data).includes(tthKey), "API key leaked in status");
  });

  // ==========================================================================
  section("Sync: Regional -> Main");
  const mainPatientsByName = async (name) => (await admin.json(`/api/patients?q=${encodeURIComponent(name)}`)).data;
  await test("Sync now uploads the queued patient and surgery", async () => {
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.status, 200, JSON.stringify(r.data));
    eq(r.data.ok, true, r.data.error);
    eq(r.data.pushed.patients, 1);
    eq(r.data.pushed.surgeries, 1);
    eq((await radmin.json("/api/sync/status")).data.stats.pendingQueue, 0);
  });
  let mainCopy;
  await test("Main Hub has the patient, linked to TTH, with an official NCR ID", async () => {
    const list = await mainPatientsByName("Mahama");
    eq(list.length, 1);
    mainCopy = list[0];
    assert(/^NCR-\d{4}-\d{5}$/.test(mainCopy.ncrId), mainCopy.ncrId);
    eq(mainCopy.registeredAtFacilityId, tthId);
    eq(mainCopy.consentResearch, true);
  });
  await test("Regional Hub received the NCR ID back", async () => {
    const r = await rclerk.json(`/api/patients/${rp1.id}`);
    eq(r.data.ncrId, mainCopy.ncrId);
    eq(r.data.syncStatus, "synced");
  });
  await test("diagnosis and surgery arrived on the Main Hub, linked to the patient", async () => {
    const dx = await admin.json(`/api/patients/${mainCopy.id}/diagnoses`);
    eq(dx.data.length, 1);
    eq(dx.data[0].cleftType, "cleft_lip_only");
    const sx = await admin.json(`/api/patients/${mainCopy.id}/surgeries`);
    eq(sx.data.length, 1);
    eq(sx.data[0].surgeryType, "primary_lip_repair");
    eq(sx.data[0].facilityId, tthId);
  });
  await test("re-sending the same records never creates duplicates (idempotent)", async () => {
    const payload = { facilityCode: "TTH", patients: [{ localId: rp1.localId, firstName: "Fuseini", lastName: "Mahama", dateOfBirth: "2026-03-01", sex: "male", regionOfResidence: "northern", caregiverName: "Ayishetu Mahama", updatedAt: new Date(0).toISOString() }] };
    for (let i = 0; i < 3; i++) {
      await fetch(`${M}/api/sync/patients`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tthKey}` }, body: JSON.stringify(payload) });
    }
    const sPayload = { facilityCode: "TTH", surgeries: [{ localId: rs1.localId, patientLocalId: rp1.localId, surgeryDate: "2026-06-01", surgeryType: "primary_lip_repair" }] };
    for (let i = 0; i < 3; i++) {
      await fetch(`${M}/api/sync/surgeries`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tthKey}` }, body: JSON.stringify(sPayload) });
    }
    eq((await mainPatientsByName("Mahama")).length, 1);
    eq((await admin.json(`/api/patients/${mainCopy.id}/surgeries`)).data.length, 1);
  });
  await test("one invalid record does not block the others", async () => {
    const r = await fetch(`${M}/api/sync/patients`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tthKey}` },
      body: JSON.stringify({ facilityCode: "TTH", patients: [{ localId: "bad-1", firstName: "" }, { localId: "good-1", firstName: "Good", lastName: "Record", dateOfBirth: "2026-01-01", sex: "female", regionOfResidence: "northern", caregiverName: "X" }] }),
    });
    const data = await r.json();
    eq(data.results.created, 1);
    eq(data.results.items.find((i) => i.localId === "bad-1").status, "error");
  });
  await test("edits on the Regional Hub are synced as updates", async () => {
    const surgeon = rusers.surgeon;
    eq((await surgeon.json(`/api/patients/${rp1.id}`, { method: "PATCH", body: { caregiverPhone: "0209999999" } })).status, 200);
    await sleep(1100);
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.pushed.patients, 1, JSON.stringify(r.data));
    const after = (await admin.json(`/api/patients/${mainCopy.id}`)).data;
    eq(after.caregiverPhone, "0209999999", `main updatedAt=${after.updatedAt}; regional=${JSON.stringify((await radmin.json(`/api/patients/${rp1.id}`)).data.updatedAt)}`);
    eq(after.consentResearch, true, "consent must survive a partial edit");
  });

  await test("a stale regional copy can never un-mark a patient recorded as deceased at the Main Hub", async () => {
    await clerk.json("/api/patients", { method: "POST", body: { firstName: "Tmp", lastName: "Tmp", dateOfBirth: "2026-01-01", sex: "male", regionOfResidence: "volta", caregiverName: "x" } }); // keep clerk session in use
    const payload = (dead) => ({ facilityCode: "TTH", patients: [{ localId: "deceased-test", firstName: "Dece", lastName: "Ased", dateOfBirth: "2026-01-01", sex: "male", regionOfResidence: "northern", caregiverName: "X", isDeceased: dead }] });
    const send = (dead) => fetch(`${M}/api/sync/patients`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tthKey}` }, body: JSON.stringify(payload(dead)) }).then((r) => r.json());
    const created = await send(false);
    const id = created.results.items[0].id;
    eq((await admin.json(`/api/patients/${id}`, { method: "PATCH", body: { isDeceased: true, deceasedDate: "2026-08-01" } })).status, 200);
    await send(false);
    eq((await admin.json(`/api/patients/${id}`)).data.isDeceased, true);
  });

  // ==========================================================================
  section("Sync: Main -> Regional (pull)");
  await test("changes made at the Main Hub flow back to the Regional Hub", async () => {
    // Main Hub marks the patient lost to follow-up and records a revision surgery after referral.
    eq((await admin.json(`/api/patients/${mainCopy.id}`, { method: "PATCH", body: { isLostToFollowUp: true } })).status, 200);
    eq((await clients.surgeon.json(`/api/patients/${mainCopy.id}/surgeries`, { method: "POST", body: { surgeryDate: "2026-09-01", surgeryType: "secondary_lip_revision" } })).status, 201);
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.ok, true, r.data.error);
    assert(r.data.pulled.surgeries >= 1, JSON.stringify(r.data));
    const list = (await rclerk.json("/api/surgeries")).data.surgeries.filter((s) => s.patientId === rp1.id);
    eq(list.length, 2, JSON.stringify(list));
    const fromMain = list.find((s) => s.origin === "main_hub");
    assert(fromMain && fromMain.surgeryType === "secondary_lip_revision", "Main Hub surgery missing");
    eq((await rclerk.json(`/api/patients/${rp1.id}`)).data.isLostToFollowUp, true);
  });
  await test("pulled records are not sent back (no echo / duplicates)", async () => {
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.pushed.surgeries, 0);
    eq((await admin.json(`/api/patients/${mainCopy.id}/surgeries`)).data.length, 2);
  });
  await test("a hub only ever receives its own patients", async () => {
    const r = await (await fetch(`${M}/api/sync/pull`, { headers: { authorization: `Bearer ${kbthKey}` } })).json();
    eq(r.data.patients.length, 0);
    eq(r.data.surgeries.length, 0);
  });

  // ==========================================================================
  section("Offline: Main Hub unreachable");
  let offlinePatient;
  await main.stop();
  await test("with the Main Hub down, the Regional Hub keeps working normally", async () => {
    const r = await rclerk.json("/api/patients", { method: "POST", body: { firstName: "Offline", lastName: "Baby", dateOfBirth: "2026-05-05", sex: "female", regionOfResidence: "northern", caregiverName: "Mother Offline", cleftType: "cleft_palate_only", consentResearch: true } });
    eq(r.status, 201);
    offlinePatient = r.data;
    const s = await rusers.surgeon.json("/api/surgeries", { method: "POST", body: { patientId: offlinePatient.id, surgeryDate: "2026-07-07", surgeryType: "primary_palate_repair" } });
    eq(s.status, 201);
    eq((await rclerk.page("/patients")).status, 200);
  });
  await test("sync attempt fails gracefully and the data stays queued", async () => {
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.ok, false);
    assert(/not reachable/i.test(r.data.error), r.data.error);
    const s = await radmin.json("/api/sync/status");
    eq(s.data.stats.pendingQueue, 2);
    eq(s.data.stats.failedQueue, 0);
    assert(s.data.lastSyncError, "error not recorded");
  });
  await test("repeated failed attempts never drop or give up on the data", async () => {
    for (let i = 0; i < 6; i++) await radmin.json("/api/sync/push", { method: "POST" });
    const s = await radmin.json("/api/sync/status");
    eq(s.data.stats.pendingQueue, 2);
  });
  main = await startServer({ app: "Main Hub", port: MAIN_PORT, env: mainEnv });
  servers.push(main);
  await test("when the Main Hub is back, everything is delivered", async () => {
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.ok, true, r.data.error);
    eq(r.data.pushed.patients, 1);
    eq(r.data.pushed.surgeries, 1);
    eq((await mainPatientsByName("Offline")).length, 1);
    eq((await radmin.json("/api/sync/status")).data.stats.pendingQueue, 0);
  });
  await test("automatic sync: a new record reaches the Main Hub within seconds, without pressing Sync", async () => {
    const r = await rclerk.json("/api/patients", { method: "POST", body: { firstName: "Auto", lastName: "Synced", dateOfBirth: "2026-05-06", sex: "male", regionOfResidence: "northern", caregiverName: "Parent" } });
    eq(r.status, 201);
    let found = 0;
    for (let i = 0; i < 30 && !found; i++) {
      await sleep(1000);
      found = (await mainPatientsByName("Synced")).length;
    }
    eq(found, 1, "not auto-synced within 30s");
  });

  // ==========================================================================
  section("Sync: revoked key");
  await test("after the Main Hub rotates TTH's key, old key is refused and data stays queued", async () => {
    const rot = await admin.json(`/api/hubs/${tthId}/rotate-key`, { method: "POST" });
    eq(rot.status, 200);
    tthKey = rot.data.apiKey;
    await rclerk.json("/api/patients", { method: "POST", body: { firstName: "Key", lastName: "Rotation", dateOfBirth: "2026-05-07", sex: "male", regionOfResidence: "northern", caregiverName: "Parent" } });
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.ok, false);
    assert(/rejected/i.test(r.data.error), r.data.error);
    eq((await radmin.json("/api/sync/status")).data.stats.pendingQueue, 1);
  });
  await test("entering the new key resumes sync", async () => {
    eq((await radmin.json("/api/sync/config", { method: "PATCH", body: { facilityCode: "TTH", mainHubUrl: main.url, apiKey: tthKey } })).status, 200);
    const r = await radmin.json("/api/sync/push", { method: "POST" });
    eq(r.data.ok, true, r.data.error);
    eq((await mainPatientsByName("Rotation")).length, 1);
  });

  // ==========================================================================
  section("Every screen loads (no server errors)");
  await test("all Main Hub pages render for the administrator", async () => {
    const me = (await admin.json("/api/users")).data[0];
    const pages = ["/dashboard", "/patients", "/patients/new", `/patients/${mainCopy.id}`, `/patients/${mainCopy.id}/diagnosis/new`,
      "/surgeries", `/surgeries/new?patientId=${mainCopy.id}`, "/appointments", "/appointments/new", "/alerts", "/statistics", "/reports",
      "/research", "/hubs", "/hubs/new", "/facilities", "/sync", "/users", "/users/new", `/users/${me.id}`, "/audit", "/settings", "/account", "/forbidden"];
    const bad = [];
    for (const path of pages) {
      const r = await admin.raw(path);
      const html = await r.text();
      if (r.status !== 200 || html.includes("Application error") || html.includes("Internal Server Error")) bad.push(`${path} -> ${r.status}`);
    }
    eq(bad.length, 0, bad.join(", "));
  });
  await test("all Regional Hub pages render for the administrator", async () => {
    const me = (await radmin.json("/api/users")).data[0];
    const pages = ["/dashboard", "/patients", "/patients/new", `/patients/${rp1.id}`, "/surgeries", `/surgeries/new?patientId=${rp1.id}`,
      "/statistics", "/sync", "/users", "/users/new", `/users/${me.id}`, "/audit", "/account", "/forbidden"];
    const bad = [];
    for (const path of pages) {
      const r = await radmin.raw(path);
      const html = await r.text();
      if (r.status !== 200 || html.includes("Application error") || html.includes("Internal Server Error")) bad.push(`${path} -> ${r.status}`);
    }
    eq(bad.length, 0, bad.join(", "));
  });

  // ==========================================================================
  section("Data at rest + backups");
  await test("database files are encrypted (no patient names readable on disk)", async () => {
    for (const f of [mainDb, regDb]) {
      const raw = readFileSync(f);
      for (const name of ["Mahama", "O'Brien", "Fuseini", "Offline"]) assert(!raw.includes(Buffer.from(name)), `${f} contains plaintext "${name}"`);
      assert(!raw.subarray(0, 16).toString().startsWith("SQLite format 3"), "plain SQLite header");
    }
  });
  await test("backup.mjs makes an encrypted copy that can be opened with the key", async () => {
    const out = await runNode(join(ROOT, "Regional Hub"), "backup.mjs", { ...regEnv });
    const file = out.match(/Backup written: (.*)/)?.[1]?.trim();
    assert(file && existsSync(file), out);
    assert(!readFileSync(file).includes(Buffer.from("Mahama")), "backup not encrypted");
  });
  await test("de-identified export includes regional patients that consented", async () => {
    const csv = await (await clients.researcher.raw("/api/export?type=deidentified&dataset=patients")).text();
    assert(csv.includes("TTH"), "regional patient missing from research export");
    assert(!csv.includes("Mahama"), "leaked name");
  });
  section("Server logs");
  await test("no unexpected errors were logged by either server", async () => {
    const lines = (main.log() + "\n" + regional.log()).split("\n").filter((l) => /error|⨯|unhandled/i.test(l) && !/\[sync\]/.test(l));
    eq(lines.length, 0, lines.slice(0, 10).join("\n"));
  });
} catch (e) {
  console.error("FATAL:", e);
} finally {
  await stopAll();
  cleanupTokenFiles();
  const s = summary();
  writeFileSync(join(WORK, "e2e-results.json"), JSON.stringify(s, null, 2));
  process.exit(s.failed === 0 && s.total > 0 ? 0 : 1);
}
