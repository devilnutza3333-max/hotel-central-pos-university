// Smoke test the assembled static POS + unchanged server locally.
// No Cloudflare deploy, remote D1 access, or data writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const host = "http://127.0.0.1:8788";
const child = spawn(process.execPath, [
  "./node_modules/wrangler/bin/wrangler.js", "dev",
  "--config", "dist/server/wrangler.json",
  "--ip", "127.0.0.1", "--port", "8788", "--local",
  "--persist-to", ".wrangler/state",
  "--inspector-port", "0",
], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

let output = "";
for (const pipe of [child.stdout, child.stderr]) pipe.on("data", chunk => {
  output += String(chunk);
  if (output.length > 20000) output = output.slice(-20000);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error("Wrangler exited before ready: " + output.slice(-4000));
    try {
      const r = await fetch(host + "/", { signal: AbortSignal.timeout(2500) });
      if (r.status === 200) return;
    } catch { /* starting */ }
    await sleep(1200);
  }
  throw new Error("Wrangler not ready: " + output.slice(-4500));
}
try {
  await ready();
  const home = await fetch(host + "/");
  assert.equal(home.status, 200, "POS root must be static and available");
  const posHtml = await home.text();
  assert.match(posHtml, /THE PBRU HERITAGE POS/);
  assert.match(posHtml, /assets\//);
  const login = await fetch(host + "/login", { redirect: "follow" });
  assert.equal(login.status, 200, "static login must load");
  const loginHtml = await login.text();
  assert.match(loginHtml, /เข้าสู่ระบบ – Hotel Central POS/);
  const api = await fetch(host + "/api/pos?scope=tables", { redirect: "manual" });
  const apiText = await api.text();
  assert.equal(api.status, 401, `private POS API must reject guest (HTTP ${api.status}: ${apiText.slice(0,250)})`);
  assert.match(api.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(JSON.parse(apiText).error, "กรุณาเข้าสู่ระบบ");
  console.log("PASS: original POS shell and login serve statically; private API still uses authorization");
} catch (error) {
  console.error("SMOKE FAILED", error, "\nWRANGLER LOGS\n", output.slice(-4500));
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}
