// Attach browser-only POS pages to the *existing* Cloudflare Worker bundle.
// The original Next/Vinext worker still handles /api/* and all unmatched URLs.
// Vite-built / and /login/ HTML, CSS and JS are served as static assets directly
// by Cloudflare, so opening the POS no longer performs Next server-side rendering.
// This does NOT modify, migrate, or seed any database.
import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve("dist/server/wrangler.json");
const configDir = path.dirname(configPath);
const spaDir = path.resolve("dist/spa");
const required = ["index.html", "login/index.html"];
if (!fs.existsSync(configPath)) throw new Error("Build vinext server before attaching static POS");
for (const asset of required) {
  if (!fs.existsSync(path.join(spaDir, asset))) throw new Error(`Missing SPA asset: ${asset}`);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (config.name !== "hotel-central-pos-university") throw new Error("Unexpected Worker target");
const expectedD1 = "bf87916e-6755-4a4b-8916-ad7a709c573b";
const bindings = config.d1_databases ?? [];
if (!bindings.length || !bindings.every((b) => b.binding === "DB" && b.database_id === expectedD1)) {
  throw new Error("D1 target mismatch - refusing to build static shell bundle");
}

// Keep original framework files for other existing SSR pages, QR endpoints and
// framework-generated assets. The SPA's own index and login pages take priority.
const oldDir = config.assets?.directory;
if (oldDir) {
  const oldAssets = path.resolve(configDir, oldDir);
  if (!fs.existsSync(oldAssets)) {
    throw new Error(`Original vinext static assets not found: ${oldAssets}`);
  }
  if (oldAssets !== spaDir) {
    fs.cpSync(oldAssets, spaDir, { recursive: true, force: false, errorOnExist: false });
  }
}

config.assets = {
  directory: path.relative(configDir, spaDir).replaceAll(path.sep, "/"),
  // Asset first. Calls to /api/* have no matching file and reach the Worker;
  // if missing, all other original server routes also reach the Worker.
  run_worker_first: false,
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log("Static POS and login ready:", config.assets.directory);
console.log("Original API Worker and D1 binding preserved. No deployment performed.");
