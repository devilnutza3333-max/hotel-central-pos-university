import fs from "node:fs";
import { randomBytes, createHash } from "node:crypto";

const dbId = process.env.STAGING_DATABASE_ID;
const dbName = "hotel-pos-delivery-lab-20261119";
const stageWorker = "hotel-central-pos-delivery-lab";
const originalPath="dist/server/wrangler.json";
const targetPath="dist/server/wrangler.staging.json";
const data=JSON.parse(fs.readFileSync(originalPath,"utf8"));
const productionD1="bf87916e-6755-4a4b-8916-ad7a709c573b";
if(data.name!=="hotel-central-pos-university" ||
    data.d1_databases?.length!==1 || data.d1_databases[0].database_id!==productionD1){
  throw Error("STOP: unexpected production config; no staging deployment");
}
if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(dbId||"") || dbId===productionD1){
  throw Error("STOP: invalid or production D1 ID");
}
data.name=stageWorker;
data.d1_databases=[{binding:"DB",database_name:dbName,database_id:dbId}];
data.vars={...data.vars,AUTH_PROVIDER:"local"};
data.keep_vars=false;
fs.writeFileSync(targetPath,JSON.stringify(data,null,2)+"\n");
const token=randomBytes(32).toString("base64url");
const digest=createHash("sha256").update(token).digest("base64url");
const now=Math.floor(Date.now()/1000);
// Local test manager has no password and cannot log in through the public UI.
// Only this ephemeral GitHub Actions runner knows the bearer token. Never log it.
const sql="INSERT OR IGNORE INTO users (id,email,name,role,active,last_seen_at,created_at) VALUES ('stage-delivery-manager','stage@example.invalid','Stage Delivery Manager','manager',1,"+now+","+now+");\n"
+"INSERT INTO auth_sessions (id,user_id,expires_at,created_at,last_seen_at) VALUES ('"+digest+"','stage-delivery-manager',"+(now+7200)+","+now+","+now+");\n";
fs.writeFileSync("/tmp/hotel-delivery-stage-seed.sql",sql,{mode:0o600});
fs.writeFileSync("/tmp/hotel-delivery-stage-token",token,{mode:0o600});
console.log(JSON.stringify({stageWorker,dbName,assets:data.assets?.directory,hasIsolatedDB:dbId!==productionD1,authentication:"local",seed:"synthetic only"}));
