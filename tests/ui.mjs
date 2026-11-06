// Browser tests (Playwright + Chromium) of the real screens of both hubs.
// Run from the repo root after building both apps:   node tests/ui.mjs
// Screenshots are saved in test-results/screenshots/.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { section, test, summary, assert, eq, freshDir, makeEnv, runNode, startServer, cleanupTokenFiles, Client, ROOT, WORK } from "./helpers.mjs";

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error('Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const PW = "Str0ng!Passw0rd#2026";
const NEW_PW = "An0ther!Passw0rd#2026";
const shots = join(WORK, "screenshots");
mkdirSync(shots, { recursive: true });

const mainDir = freshDir("ui-main");
const regDir = freshDir("ui-regional");
const mainEnv = makeEnv(join(mainDir, "main_hub.db"));
const regEnv = makeEnv(join(regDir, "local.db"));
cleanupTokenFiles();
await runNode(join(ROOT, "Main Hub"), "migrate.mjs", mainEnv);
await runNode(join(ROOT, "Regional Hub"), "init-db.mjs", regEnv);

const main = await startServer({ app: "Main Hub", port: 3200, env: mainEnv });
const regional = await startServer({ app: "Regional Hub", port: 3201, env: regEnv, extraEnv: { SYNC_INTERVAL_MINUTES: "60" } });
const browser = await chromium.launch();
const M = main.url;
const R = regional.url;

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });

async function login(page, base, email, password) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

let hubKey = "";
try {
  // ==========================================================================
  section("Main Hub UI");
  const admin = await newPage();

  await test("a fresh server sends the operator from /login to the setup wizard", async () => {
    await admin.goto(`${M}/login`);
    await admin.waitForURL(/\/setup/, { timeout: 15000 });
    await shot(admin, "01-main-setup-wizard");
  });
  await test("setup wizard creates the administrator and opens the dashboard", async () => {
    await admin.fill('input[name="setupToken"]', main.setupToken());
    await admin.fill('input[name="firstName"]', "Ama");
    await admin.fill('input[name="lastName"]', "Mensah");
    await admin.fill('input[name="email"]', "admin@kath.gov.gh");
    await admin.fill('input[name="password"]', PW);
    await admin.fill('input[name="confirm"]', PW);
    await admin.click('button[type="submit"]');
    await admin.waitForURL(/\/dashboard/, { timeout: 15000 });
    await admin.getByRole("heading", { name: "Registry Dashboard" }).waitFor();
    await shot(admin, "02-main-dashboard-admin");
  });
  await test("admin sees every menu item", async () => {
    for (const name of ["Patient Registry", "Users", "Regional Hubs", "Audit Log", "Research & Export", "Settings"]) {
      assert(await admin.getByRole("link", { name, exact: true }).isVisible(), `missing menu ${name}`);
    }
  });

  let viewerTemp = "";
  await test("admin creates a Viewer account from the Users screen and sees the temporary password", async () => {
    await admin.goto(`${M}/users/new`);
    await admin.fill('input[name="firstName"]', "Kofi");
    await admin.fill('input[name="lastName"]', "Viewer");
    await admin.fill('input[name="email"]', "viewer@kath.gov.gh");
    await admin.selectOption('select[name="role"]', "viewer");
    await admin.click('button:has-text("Create User")');
    const code = admin.locator("code").first();
    await code.waitFor({ timeout: 10000 });
    viewerTemp = (await code.textContent()).trim();
    assert(viewerTemp.length >= 12, viewerTemp);
    await shot(admin, "03-main-user-created");
  });

  await test("admin registers a patient through the form", async () => {
    await admin.goto(`${M}/patients/new`);
    await admin.fill('input[name="firstName"]', "Yaw");
    await admin.fill('input[name="lastName"]', "O'Neil");
    await admin.fill('input[name="dateOfBirth"]', "2026-02-14");
    await admin.selectOption('select[name="sex"]', "male");
    await admin.click('button:has-text("Next: Location")');
    await admin.selectOption('select[name="regionOfResidence"]', "ashanti");
    await admin.click('button:has-text("Next: Caregiver")');
    await admin.fill('input[name="caregiverName"]', "Abena O'Neil");
    await admin.click('button:has-text("Next: Consent")');
    await admin.check('input[name="consentResearch"]');
    await admin.click('button[type="submit"]');
    await admin.waitForURL(/\/patients\/\d+$/, { timeout: 15000 });
    await admin.getByText("O'Neil").first().waitFor();
    await shot(admin, "04-main-patient-detail");
  });

  await test("admin registers a Regional Hub and gets its sync key", async () => {
    await admin.goto(`${M}/hubs/new`);
    await admin.fill('input[name="name"]', "Tamale Teaching Hospital");
    await admin.fill('input[name="code"]', "TTH");
    const type = admin.locator('select[name="facilityType"]');
    if (await type.count()) await type.selectOption("regional_centre");
    await admin.selectOption('select[name="region"]', "northern");
    await admin.click('button[type="submit"]');
    await admin.getByText(/ncr_[0-9a-f]{64}/).first().waitFor({ timeout: 10000 });
    hubKey = (await admin.content()).match(/ncr_[0-9a-f]{64}/)[0];
    await shot(admin, "05-main-hub-registered");
  });

  const viewer = await newPage();
  await test("new Viewer is forced to choose their own password at first sign-in", async () => {
    await login(viewer, M, "viewer@kath.gov.gh", viewerTemp);
    await viewer.waitForURL(/\/account/, { timeout: 15000 });
    await shot(viewer, "06-main-forced-password-change");
    await viewer.fill('input[name="currentPassword"]', viewerTemp);
    await viewer.fill('input[name="newPassword"]', NEW_PW);
    await viewer.fill('input[name="confirm"]', NEW_PW);
    await viewer.click('button:has-text("Change password")');
    await viewer.waitForURL(/\/dashboard/, { timeout: 15000 });
  });
  await test("Viewer's menu hides patient, user and admin screens; no patient names on dashboard", async () => {
    await viewer.getByRole("heading", { name: "Registry Dashboard" }).waitFor();
    for (const name of ["Patient Registry", "Users", "Regional Hubs", "Audit Log"]) {
      eq(await viewer.getByRole("link", { name, exact: true }).count(), 0, `viewer should not see ${name}`);
    }
    assert(!(await viewer.content()).includes("O'Neil"), "patient name visible to viewer");
    await shot(viewer, "07-main-dashboard-viewer");
  });
  await test("Viewer typing a patient URL directly gets 'Access not permitted'", async () => {
    await viewer.goto(`${M}/patients`);
    await viewer.waitForURL(/\/forbidden/);
    await viewer.getByText("Access not permitted").waitFor();
  });
  await test("Sign out returns to the login page", async () => {
    await viewer.goto(`${M}/account`);
    await viewer.click('button:has-text("Sign out")');
    await viewer.waitForURL(/\/login/);
    await viewer.goto(`${M}/dashboard`);
    await viewer.waitForURL(/\/login/);
  });
  await test("wrong password shows an error, no sign-in", async () => {
    await login(viewer, M, "viewer@kath.gov.gh", "wrong-password");
    await viewer.getByText("Invalid email or password").waitFor();
  });

  // ==========================================================================
  section("Regional Hub UI");
  const radmin = await newPage();
  await test("setup wizard records the hospital and its administrator", async () => {
    await radmin.goto(`${R}/login`);
    await radmin.waitForURL(/\/setup/, { timeout: 15000 });
    await radmin.fill('input[name="setupToken"]', regional.setupToken());
    await radmin.fill('input[name="facilityName"]', "Tamale Teaching Hospital");
    await radmin.fill('input[name="facilityCode"]', "TTH");
    await radmin.selectOption('select[name="region"]', "northern");
    await radmin.fill('input[name="firstName"]', "Abdul");
    await radmin.fill('input[name="lastName"]', "Issah");
    await radmin.fill('input[name="email"]', "admin@tth.gov.gh");
    await radmin.fill('input[name="password"]', PW);
    await radmin.fill('input[name="confirm"]', PW);
    await shot(radmin, "08-regional-setup-wizard");
    await radmin.click('button[type="submit"]');
    await radmin.waitForURL(/\/dashboard/, { timeout: 15000 });
  });
  await test("registering a patient works offline (Main Hub not connected yet)", async () => {
    await radmin.goto(`${R}/patients/new`);
    await radmin.fill('input[name="firstName"]', "Fuseini");
    await radmin.fill('input[name="lastName"]', "Mahama");
    await radmin.fill('input[name="dateOfBirth"]', "2026-03-01");
    await radmin.selectOption('select[name="sex"]', "male");
    await radmin.selectOption('select[name="cleftType"]', "cleft_lip_and_palate");
    await radmin.selectOption('select[name="regionOfResidence"]', "northern");
    await radmin.fill('input[name="caregiverName"]', "Ayishetu Mahama");
    await radmin.check('input[name="consentResearch"]');
    await radmin.check('input[name="consentDataSharing"]');
    await shot(radmin, "09-regional-register-patient");
    await radmin.click('button[type="submit"]');
    await radmin.waitForURL(/\/patients\/\d+$/, { timeout: 15000 });
    await radmin.getByText("Mahama").first().waitFor();
  });
  await test("header shows the record is saved here and waiting to sync", async () => {
    await radmin.goto(`${R}/dashboard`);
    await radmin.getByText(/waiting to sync/).waitFor({ timeout: 10000 });
    await shot(radmin, "10-regional-waiting-to-sync");
  });
  await test("admin connects to the Main Hub from the Sync page (key verified)", async () => {
    await radmin.goto(`${R}/sync`);
    await radmin.click('button:has-text("Edit connection")');
    await radmin.fill('input[name="mainHubUrl"]', M);
    await radmin.fill('input[name="apiKey"]', hubKey);
    await radmin.click('button:has-text("Save and test")');
    await radmin.getByText(/Connected to the Main Hub/).waitFor({ timeout: 15000 });
  });
  await test("Sync now delivers the patient; header turns to 'All records synced'", async () => {
    await radmin.click('button:has-text("Sync now")');
    await radmin.getByText("Sync completed.").waitFor({ timeout: 20000 });
    await shot(radmin, "11-regional-sync-completed");
    await radmin.goto(`${R}/dashboard`);
    await radmin.getByText("All records synced").waitFor({ timeout: 10000 });
  });
  await test("patient now appears on the Main Hub with an NCR ID", async () => {
    await admin.goto(`${M}/patients?search=Mahama`);
    await admin.getByText("Mahama").first().waitFor({ timeout: 10000 });
    assert(/NCR-\d{4}-\d{5}/.test(await admin.content()), "no NCR ID");
    await shot(admin, "12-main-patient-from-regional");
  });
  await test("researcher can download a de-identified CSV from Research & Export", async () => {
    const c = new Client(M);
    await c.login("admin@kath.gov.gh", PW);
    const r = await c.json("/api/users", { method: "POST", body: { email: "res@kath.gov.gh", firstName: "R", lastName: "S", role: "researcher", password: PW } });
    eq(r.status, 201);
    const rp = await newPage();
    await login(rp, M, "res@kath.gov.gh", PW);
    await rp.waitForURL(/\/account/);
    await rp.fill('input[name="currentPassword"]', PW);
    await rp.fill('input[name="newPassword"]', NEW_PW);
    await rp.fill('input[name="confirm"]', NEW_PW);
    await rp.click('button:has-text("Change password")');
    await rp.waitForURL(/\/dashboard/);
    await rp.goto(`${M}/research`);
    await shot(rp, "13-main-research-export");
    const [download] = await Promise.all([rp.waitForEvent("download"), rp.click('a[href*="type=deidentified&dataset=patients"]')]);
    const path = await download.path();
    const csv = (await import("node:fs")).readFileSync(path, "utf-8");
    assert(csv.startsWith("research_id"), csv.slice(0, 80));
    assert(!csv.includes("Mahama") && !csv.includes("O'Neil"), "names leaked");
    eq(csv.trim().split(/\r?\n/).length, 3, "2 consented patients + header");
  });
} catch (e) {
  console.error("FATAL:", e);
} finally {
  await browser.close();
  await main.stop();
  await regional.stop();
  cleanupTokenFiles();
  const s = summary();
  writeFileSync(join(WORK, "ui-results.json"), JSON.stringify(s, null, 2));
  process.exit(s.failed === 0 && s.total > 0 ? 0 : 1);
}
