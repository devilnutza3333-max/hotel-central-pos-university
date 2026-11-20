import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const configPath = path.resolve("dist/server/wrangler.json");
const expected = {
  name: "hotel-central-pos-university",
  binding: "DB",
  database_name: "hotel-central-pos-db",
  database_id: "387ccbd0-087e-4714-b3da-d1e58783cee5",
};
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.name !== expected.name) {
  throw new Error(`Refusing deployment: unexpected Worker name ${config.name}`);
}
const bindings = config.d1_databases;
if (!Array.isArray(bindings) || bindings.length === 0) {
  throw new Error("Refusing deployment: generated Worker configuration has no D1 binding");
}
if (!bindings.every((b) =>
  b.binding === expected.binding &&
  b.database_name === expected.database_name &&
  b.database_id === expected.database_id
)) {
  throw new Error(`Refusing deployment: D1 bindings differ from expected POS database: ${JSON.stringify(bindings)}`);
}
config.d1_databases = [bindings[0]];
const flags = config.compatibility_flags ?? [];
if (!Array.isArray(flags) || flags.some((f) => typeof f !== "string" || !f)) {
  throw new Error("Refusing deployment: invalid compatibility flags");
}
config.compatibility_flags = [...new Set(flags)];
config.vars = { ...(config.vars ?? {}), AUTH_PROVIDER: "local" };
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Verified ${bindings.length} matching D1 binding(s), normalized to one (${expected.database_name})`);
