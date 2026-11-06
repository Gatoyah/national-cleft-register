// Test helpers: start/stop the real production servers, an HTTP client with a
// cookie jar + CSRF handling, and a tiny test runner.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export const ROOT = new URL("..", import.meta.url).pathname;
export const WORK = join(ROOT, "test-results");

// ---------------------------------------------------------------- runner
const results = [];
let currentSection = "";
export function section(name) {
  currentSection = name;
  console.log(`\n=== ${name}`);
}
export async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ section: currentSection, name, ok: true });
    console.log(`  ✓ ${name} (${Date.now() - started}ms)`);
  } catch (e) {
    results.push({ section: currentSection, name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split("\n").join("\n      ")}`);
  }
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
  for (const f of failed) console.log(`  FAILED: [${f.section}] ${f.name}: ${f.error}`);
  return { total: results.length, failed: failed.length, results };
}
export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
export function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || "values differ"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- servers
export function freshDir(name) {
  const dir = join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeEnv(dbFile) {
  return {
    DATABASE_URL: `file:${dbFile}`,
    DB_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    CSRF_SECRET: randomBytes(32).toString("hex"),
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  };
}

export function runNode(cwd, script, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script], { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${script} exited ${code}: ${out}`))));
  });
}

/**
 * Start `next start` for an app. Returns { url, stop(), log(), setupToken() }.
 * The server's stdout is captured so the test can read the printed setup token
 * exactly like an operator would from the console window.
 */
export async function startServer({ app, port, env, extraEnv = {} }) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    throw new Error(`Port ${port} is already in use - stop whatever is running there first.`);
  } catch (e) {
    if (e.message.startsWith("Port")) throw e;
  }
  const cwd = join(ROOT, app);
  const nextBin = join(cwd, "node_modules", "next", "dist", "bin", "next");
  const proc = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd,
    env: { ...process.env, NODE_ENV: "production", ...env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (proc.exitCode !== null) throw new Error(`${app} exited early:\n${log}`);
    await sleep(250);
  }
  return {
    url,
    proc,
    log: () => log,
    setupToken: () => log.match(/SETUP TOKEN:\s+(\S+)/)?.[1],
    stop: () =>
      new Promise((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.on("exit", () => resolve());
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5000);
      }),
  };
}

export function cleanupTokenFiles() {
  for (const app of ["Main Hub", "Regional Hub"]) {
    const f = join(ROOT, app, "setup-token.txt");
    if (existsSync(f)) rmSync(f);
  }
}

// ---------------------------------------------------------------- HTTP client
/** A browser-like client: keeps cookies, sends same-origin Origin header, fetches CSRF tokens. */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = null;
    this.lastSetCookie = [];
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  storeCookies(res) {
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) this.lastSetCookie = set;
    for (const c of set) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
  async raw(path, { method = "GET", body, headers = {}, origin = this.base, redirect = "manual", csrf = true } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    if (method !== "GET" && method !== "HEAD") {
      if (origin) h.origin = origin;
      if (body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
      if (csrf && this.csrf) h["x-csrf-token"] = this.csrf;
    }
    const res = await fetch(this.base + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect,
    });
    this.storeCookies(res);
    return res;
  }
  async json(path, opts) {
    const res = await this.raw(path, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  async refreshCsrf() {
    const r = await this.json("/api/auth/csrf");
    this.csrf = r.data?.csrfToken ?? null;
    return this.csrf;
  }
  async login(email, password) {
    const r = await this.json("/api/auth/login", { method: "POST", body: { email, password } });
    if (r.status === 200) await this.refreshCsrf();
    return r;
  }
  /** Status + redirect target for a page load. */
  async page(path) {
    const res = await this.raw(path);
    return { status: res.status, location: res.headers.get("location") || "" };
  }
}
