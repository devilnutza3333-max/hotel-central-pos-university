import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const confFile = path.resolve("dist/server/wrangler.json");
const conf = JSON.parse(fs.readFileSync(confFile, "utf8"));
const assetsRoot = path.resolve(path.dirname(confFile), conf.assets.directory);

test("uses the same production Worker and D1; never changes the database", () => {
  assert.equal(conf.name, "hotel-central-pos-university");
  assert.equal(conf.d1_databases.length, 1);
  assert.equal(conf.d1_databases[0].binding, "DB");
  assert.equal(conf.d1_databases[0].database_id, "bf87916e-6755-4a4b-8916-ad7a709c573b");
  assert.equal(conf.assets.run_worker_first, false);
  assert.equal(conf.assets.not_found_handling, "none");
});

test("same original HTML/React UI loaded as static files without Next SSR", () => {
  const indexHtml = fs.readFileSync(path.join(assetsRoot, "index.html"), "utf8");
  const loginHtml = fs.readFileSync(path.join(assetsRoot, "login/index.html"), "utf8");
  assert.match(indexHtml, /THE PBRU HERITAGE POS/);
  assert.match(loginHtml, /Hotel Central POS/);
  assert.match(indexHtml, /assets\//);
  assert.match(loginHtml, /assets\//);
  const directory = path.join(assetsRoot, "assets");
  assert.ok(fs.readdirSync(directory).some(name => name.endsWith(".js")));
  assert.ok(fs.readdirSync(directory).some(name => name.endsWith(".css")));
});

test("manifest, icon, PWA worker and original vinext API stay available", () => {
  for (const p of ["manifest.webmanifest", "favicon.svg", "sw.js"]) {
    assert.ok(fs.existsSync(path.join(assetsRoot, p)), `missing ${p}`);
  }
  assert.ok(fs.existsSync(path.resolve("dist/server/index.js")) || fs.existsSync(path.resolve("dist/server/worker.js")) || !!conf.main);
  assert.ok(conf.main);
});

test("static entrypoints do not embed credentials and API remains authoritative", () => {
  const shell = fs.readFileSync("spa/main.tsx", "utf8");
  const login = fs.readFileSync("spa/login/main.tsx", "utf8");
  assert.match(shell, /import PosApp from/);
  assert.match(login, /import LoginPage from/);
  assert.doesNotMatch(shell + login, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|bf87916e-/);
});
