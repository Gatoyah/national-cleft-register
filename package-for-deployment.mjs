#!/usr/bin/env node
// Build ready-to-install packages of the Main Hub and Regional Hub.
//
//   node package-for-deployment.mjs --target win-x64 --with-node
//
// Options
//   --target <t>   Operating system of the HOSPITAL machine (default: this machine)
//                  win-x64 | linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64
//   --with-node    Download a portable Node.js for the target into each package,
//                  so the hospital machine needs nothing installed (recommended).
//   --skip-build   Reuse the existing builds in .next/ instead of rebuilding.
//   --hubs <list>  main,regional (default: both)
//
// Output: dist/<target>/ncr-main-hub-<target>.zip, ncr-regional-hub-<target>.zip
// and SHA256SUMS.txt to verify the files after copying/sending them.
// Works on Windows, macOS and Linux (needs internet only for --with-node or a
// cross-platform --target).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, createReadStream, renameSync, statSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const HOST = `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
const TARGET = opt("target", HOST);
const TARGETS = {
  "win-x64": { libsql: ["win32-x64-msvc"], node: "win-x64", ext: "zip" },
  "linux-x64": { libsql: ["linux-x64-gnu", "linux-x64-musl"], node: "linux-x64", ext: "tar.xz" },
  "linux-arm64": { libsql: ["linux-arm64-gnu", "linux-arm64-musl"], node: "linux-arm64", ext: "tar.xz" },
  "darwin-x64": { libsql: ["darwin-x64"], node: "darwin-x64", ext: "tar.gz" },
  "darwin-arm64": { libsql: ["darwin-arm64"], node: "darwin-arm64", ext: "tar.gz" },
};
if (!TARGETS[TARGET]) {
  console.error(`Unknown --target ${TARGET}. Use one of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}
const T = TARGETS[TARGET];
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const HUBS = {
  main: { dir: "Main Hub", pkg: "main-hub", db: "main_hub.db", files: ["migrate.mjs", "drizzle"] },
  regional: { dir: "Regional Hub", pkg: "regional-hub", db: "local.db", files: ["init-db.mjs"] },
};
const selected = opt("hubs", "main,regional").split(",").map((s) => s.trim());

const OUT = join(ROOT, "dist", TARGET);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const run = (cmd, argv, cwd) => execFileSync(cmd, argv, { cwd, stdio: "inherit", shell: isWin });
const version = (() => {
  try {
    return execFileSync("git", ["describe", "--always", "--dirty"], { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
})();

/** Fetch an npm package tarball and unpack it to dest (used for the target's native SQLite driver). */
function installNpmPackage(spec, dest) {
  const tmp = join(tmpdir(), `ncr-pack-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const file = execFileSync(npm, ["pack", spec, "--silent"], { cwd: tmp, shell: isWin }).toString().trim().split(/\r?\n/).pop();
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", join(tmp, file), "-C", dest, "--strip-components=1"]);
  rmSync(tmp, { recursive: true, force: true });
}

/** Download portable Node.js (same version as this machine's) for the target. */
async function downloadNode(dest) {
  const v = process.version;
  const name = `node-${v}-${T.node}`;
  const url = `https://nodejs.org/dist/${v}/${name}.${T.ext}`;
  const cache = join(ROOT, "dist", ".cache");
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, `${name}.${T.ext}`);
  if (!existsSync(archive)) {
    console.log(`  downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    // Verify against the official checksums published by nodejs.org.
    const sums = await (await fetch(`https://nodejs.org/dist/${v}/SHASUMS256.txt`)).text();
    const expected = sums.split("\n").find((l) => l.endsWith(`${name}.${T.ext}`))?.split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (!expected || expected !== actual) {
      rmSync(archive);
      throw new Error("Node.js download failed checksum verification");
    }
  }
  const tmp = join(cache, `x-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  execFileSync("tar", ["-xf", archive, "-C", tmp]); // bsdtar on Windows 10+ also handles .zip
  renameSync(join(tmp, name), dest);
  rmSync(tmp, { recursive: true, force: true });
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

function archive(folder, name) {
  const base = join(OUT, name);
  if (TARGET.startsWith("win")) {
    const zip = `${base}.zip`;
    if (isWin) execFileSync("tar", ["-a", "-cf", zip, "-C", OUT, folder]);
    else execFileSync("zip", ["-qr", zip, folder], { cwd: OUT });
    return zip;
  }
  const tgz = `${base}.tar.gz`;
  execFileSync("tar", ["-czf", tgz, "-C", OUT, folder]);
  return tgz;
}

const outputs = [];
for (const key of selected) {
  const hub = HUBS[key];
  if (!hub) throw new Error(`Unknown hub ${key}`);
  const src = join(ROOT, hub.dir);
  const folder = `${hub.pkg}`;
  const dest = join(OUT, folder);
  console.log(`\n== ${hub.dir} -> ${TARGET}`);

  if (!flag("skip-build")) {
    if (!existsSync(join(src, "node_modules"))) run(npm, ["ci", "--no-audit", "--no-fund"], src);
    run(npm, ["run", "build"], src);
  }
  const standalone = join(src, ".next", "standalone");
  if (!existsSync(join(standalone, "server.js"))) throw new Error(`${hub.dir}: no standalone build found - run without --skip-build`);

  // 1. The server + its minimal node_modules. dereference: turn symlinks into real
  //    files so the package survives zip files, USB sticks and Windows.
  cpSync(standalone, dest, { recursive: true, dereference: true });
  for (const f of readdirSync(dest)) {
    if (f.endsWith(".db") || f === ".env" || f === "setup-token.txt" || f === "backups") rmSync(join(dest, f), { recursive: true, force: true });
  }
  // 2. Static assets (not part of the standalone output).
  cpSync(join(src, ".next", "static"), join(dest, ".next", "static"), { recursive: true });
  if (existsSync(join(src, "public"))) cpSync(join(src, "public"), join(dest, "public"), { recursive: true });

  // 3. Native SQLite driver for the target OS.
  const libsqlVersion = JSON.parse(readFileSync(join(dest, "node_modules", "libsql", "package.json"), "utf-8")).version;
  const libsqlDir = join(dest, "node_modules", "@libsql");
  for (const d of readdirSync(libsqlDir)) {
    const isNative = Object.values(TARGETS).some((t) => t.libsql.includes(d));
    if (isNative && !T.libsql.includes(d)) rmSync(join(libsqlDir, d), { recursive: true, force: true });
  }
  for (const native of T.libsql) {
    if (!existsSync(join(libsqlDir, native))) {
      console.log(`  adding native driver @libsql/${native}@${libsqlVersion}`);
      installNpmPackage(`@libsql/${native}@${libsqlVersion}`, join(libsqlDir, native));
    }
  }

  // 4. Setup / maintenance scripts, launchers and docs.
  for (const f of [...hub.files, "setup-env.mjs", "backup.mjs", ".env.example"]) cpSync(join(src, f), join(dest, f), { recursive: true });
  if (TARGET.startsWith("win")) cpSync(join(src, "deploy", "start.bat"), join(dest, "start.bat"));
  else {
    cpSync(join(src, "deploy", "start.sh"), join(dest, "start.sh"));
    chmodSync(join(dest, "start.sh"), 0o755);
  }
  cpSync(join(ROOT, "DEPLOY.md"), join(dest, "DEPLOY.md"));
  writeFileSync(
    join(dest, "VERSION.txt"),
    `National Cleft Registry - ${hub.dir}\nVersion: ${version}\nBuilt: ${new Date().toISOString()}\nTarget: ${TARGET}\nNode.js: ${process.version}\n`
  );

  // 5. Optional portable Node.js runtime.
  if (flag("with-node")) await downloadNode(join(dest, "node"));

  const size = (() => {
    let total = 0;
    const walk = (p) => {
      const s = statSync(p);
      if (s.isDirectory()) for (const c of readdirSync(p)) walk(join(p, c));
      else total += s.size;
    };
    walk(dest);
    return `${(total / 1024 / 1024).toFixed(0)} MB`;
  })();
  const file = archive(folder, `ncr-${hub.pkg}-${TARGET}`);
  outputs.push(file);
  console.log(`  packaged ${folder}/ (${size}) -> ${file}`);
}

const sums = [];
for (const f of outputs) sums.push(`${await sha256(f)}  ${f.split(/[\\/]/).pop()}`);
writeFileSync(join(OUT, "SHA256SUMS.txt"), sums.join("\n") + "\n");
console.log(`\nDone. Send the files in ${OUT} (and SHA256SUMS.txt so the receiver can check them).`);
if (!flag("with-node")) console.log("Tip: add --with-node so the hospital machine does not need Node.js installed.");
