import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const databaseId = process.env.CLOUDFLARE_D1_ID;
const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
const audience = process.env.CLOUDFLARE_ACCESS_AUD;
const accessReady = process.env.CLOUDFLARE_ACCESS_READY === "true";
const authProvider = process.env.AUTH_PROVIDER ?? "local";

if (!databaseId) {
  throw new Error("Set CLOUDFLARE_D1_ID before preparing the deployment config.");
}
if (accessReady && (!teamDomain || !audience)) {
  throw new Error("Cloudflare Access requires CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD.");
}

const sourcePath = path.resolve("dist/server/wrangler.json");
const targetPath = path.resolve("dist/server/wrangler.cloudflare.json");
const config = JSON.parse(readFileSync(sourcePath, "utf8"));

config.name = "hotel-central-pos-university";
config.topLevelName = config.name;
config.vars = {
  ...(config.vars ?? {}),
  AUTH_PROVIDER: authProvider,
  ...(authProvider === "cloudflare-access" ? {
    ACCESS_READY: accessReady ? "true" : "false",
    ...(teamDomain ? { ACCESS_TEAM_DOMAIN: teamDomain.replace(/\/$/, "") } : {}),
    ...(audience ? { ACCESS_AUD: audience } : {}),
  } : {}),
};
config.d1_databases = [
  {
    binding: "DB",
    database_name: "hotel-central-pos-db",
    database_id: databaseId,
    migrations_dir: "../../drizzle",
  },
];

writeFileSync(targetPath, `${JSON.stringify(config, null, 2)}\n`);
process.stdout.write(`${targetPath}\n`);
