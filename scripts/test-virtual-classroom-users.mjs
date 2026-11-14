// Safe classroom concurrency test: ALL POS writes use isolated local D1, never production.
// Cloudflare live test fetches public static HTML only: no auth, no POS API, no sale mutation.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const HOST = "http://127.0.0.1:8799";
const LIVE = "https://hotel-central-pos-university.markparametbubchaiya.workers.dev";
const PERSIST = path.resolve(".wrangler/classroom-virtual-test");
const CLI = path.resolve("node_modules/wrangler/bin/wrangler.js");
const CONF = path.resolve("dist/server/wrangler.json");
const sleep = (ms) => new Promise(ok => setTimeout(ok, ms));
const stats = [];
const baseline = Date.now();
const sessions = [];
function cli(args) {
  const x = spawnSync(process.execPath, [CLI, ...args], {
    encoding:"utf8", timeout:60000, maxBuffer:2_000_000,
    env:{...process.env,WRANGLER_SEND_METRICS:"false"}
  });
  if(x.status !== 0) throw new Error("Local Wrangler command failed: " + args.join(" ") + "\n" + (x.stderr || x.stdout).slice(-3000));
  return x.stdout;
}
function sqlEscape(s) { return String(s).replaceAll("'","''"); }
function d1File(file) {
  return cli(["d1","execute","hotel-central-pos-db","--local","--config",CONF,"--persist-to",PERSIST,"--file",file]);
}
function report(name, results) {
  const times = results.filter(v=>v.ok).map(v=>v.ms).sort((a,b)=>a-b);
  const percentile=(p)=>times.length?Math.round(times[Math.min(times.length-1,Math.ceil(p*times.length)-1)]):null;
  const failures=results.filter(v=>!v.ok);
  const row={scenario:name,total:results.length,success:times.length,failed:failures.length,p50_ms:percentile(.5),p95_ms:percentile(.95),worst_ms:times.length?Math.ceil(times.at(-1)):null};
  stats.push(row);
  console.log(JSON.stringify(row));
  if(failures.length) console.error("EXAMPLES",JSON.stringify(failures.slice(0,4)));
  return row;
}
async function fetchMeasured(url,options={}) {
  const start=performance.now();
  try {
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000),redirect:"manual"});
    const text=await response.text();
    return {ok:response.ok, status:response.status, ms:performance.now()-start, text};
  } catch(e) {return {ok:false,status:0,ms:performance.now()-start,error:String(e)}}
}
function cookie(index){return {cookie:"hotel_pos_session="+sessions[index].token};}
async function apiGet(index,scope="tables") {
  const result=await fetchMeasured(HOST+"/api/pos?scope="+scope+"&mode=live",{headers:cookie(index)});
  if(result.status!==200 || !result.text.startsWith("{")) result.ok=false;
  return result;
}
async function apiPost(index,body) {
  const r=await fetchMeasured(HOST+"/api/pos",{method:"POST",headers:{...cookie(index),"content-type":"application/json"},body:JSON.stringify({...body,clientRequestId:randomBytes(16).toString("hex")})});
  let data;try{data=JSON.parse(r.text)}catch{data={error:r.text.slice(0,220)}}
  assert.equal(r.status,200,JSON.stringify({body:{action:body.action},http:r.status,response:data}));
  assert.equal(data.ok,true,JSON.stringify({action:body.action,response:data}));
  return data;
}
let server=null, output="";
try {
  // Refuse remote writes. No GitHub/Cloudflare API tokens are needed for this test.
  assert.ok(fs.existsSync(CONF),"Build required");
  const config=JSON.parse(fs.readFileSync(CONF,"utf8"));
  assert.equal(config.d1_databases.find(d=>d.binding==="DB")?.database_id,"bf87916e-6755-4a4b-8916-ad7a709c573b");
  fs.rmSync(PERSIST,{recursive:true,force:true});
  fs.mkdirSync(PERSIST,{recursive:true});
  const combined=fs.readdirSync("drizzle").filter(n=>/^00\d\d.*\.sql$/.test(n)).sort().map(n=>fs.readFileSync(path.join("drizzle",n),"utf8").replaceAll("--> statement-breakpoint","")).join("\n");
  const schemaFile=path.resolve(".wrangler/virtual-classroom-schema.sql");
  fs.mkdirSync(path.dirname(schemaFile),{recursive:true});
  fs.writeFileSync(schemaFile,combined);
  d1File(schemaFile);
  console.log("PASS: created isolated local D1 schema with 15 migrations.");

  const now=Math.floor(Date.now()/1000);
  const statements=[];
  for(let i=0;i<30;i++){
    const token=randomBytes(32).toString("base64url");
    const digest=createHash("sha256").update(token).digest("base64url");
    const userId="virtual-"+String(i+1).padStart(2,"0");
    const role=i===0?"instructor":"student";
    sessions.push({token,userId,role});
    statements.push("INSERT INTO users (id,email,name,role,active,last_seen_at,created_at) VALUES ('"+sqlEscape(userId)+"','virtual"+i+"@example.invalid','Classroom virtual "+(i+1)+"','"+role+"',1,"+now+","+now+");");
    statements.push("INSERT INTO auth_sessions (id,user_id,expires_at,created_at,last_seen_at) VALUES ('"+sqlEscape(digest)+"','"+sqlEscape(userId)+"',"+(now+3600)+","+now+","+now+");");
  }
  const seedFile=path.resolve(".wrangler/virtual-classroom-seed.sql");
  fs.writeFileSync(seedFile,statements.join("\n"));
  d1File(seedFile);
  console.log("PASS: created 30 isolated virtual user sessions; no actual customer data.");

  server=spawn(process.execPath,[CLI,"dev","--config",CONF,"--local","--persist-to",PERSIST,"--ip","127.0.0.1","--port","8799","--inspector-port","0","--var","AUTH_PROVIDER:local"],{
    stdio:["ignore","pipe","pipe"],env:{...process.env,WRANGLER_SEND_METRICS:"false"}
  });
  for(const pipe of [server.stdout,server.stderr])pipe.on("data",c=>{output+=String(c);output=output.slice(-10000)});
  let ready=false;
  for(let j=0;j<50;j++){
    if(server.exitCode!==null)throw new Error("Local server exited: "+output);
    const result=await fetchMeasured(HOST+"/");
    if(result.status===200){ready=true;break}
    await sleep(1000);
  }
  assert.ok(ready,"Local POS did not start: "+output);
  // Trigger seed via a single authenticated request to avoid first-load races.
  const warm=await fetchMeasured(HOST+"/api/pos?scope=tables",{headers:cookie(0)});
  assert.equal(warm.status,200,"Authenticated first snapshot failed: "+warm.text.slice(0,700));
  const snapshot=JSON.parse(warm.text);
  assert.equal(snapshot.profile.role,"instructor");
  assert.ok(snapshot.tables.length>=20);
  assert.ok(snapshot.menu.length>=10);
  console.log("PASS: authenticated POS loads original table/menu data in isolated local D1.");

  // Exercise the real API end-to-end locally (not on live Cloudflare).
  const opened=await apiPost(0,{action:"openOrder",tableId:1});
  await apiPost(0,{action:"addItem",orderId:opened.orderId,menuItemId:4});
  await apiPost(0,{action:"sendKitchen",orderId:opened.orderId});
  for(const status of ["preparing","ready","served"]) {
    await apiPost(0,{action:"setDepartmentStatus",orderId:opened.orderId,status,departments:["ครัวร้อน"]});
  }
  await apiPost(0,{action:"openShift",openingCash:0});
  const receipt=await apiPost(0,{action:"settleOrder",orderId:opened.orderId,confirmed:true,method:"cash",amountTendered:220});
  assert.match(receipt.receiptNumber,/^RC/);
  const finance=await fetchMeasured(HOST+"/api/pos?scope=finance",{headers:cookie(0)});
  assert.equal(finance.status,200,"finance snapshot failed");
  const data=JSON.parse(finance.text);
  assert.ok(data.orders.some(o=>o.id===opened.orderId && o.status==="paid" && o.receiptNumber===receipt.receiptNumber));
  console.log("PASS: open table > add food > kitchen > preparing > ready > served > cash checkout > persistent receipt in LOCAL D1.");

  // Parallel browser sessions, read-only snapshots only.
  for (const n of [3,10,20,30]) {
    const results=await Promise.all(Array.from({length:n},(_,i)=>apiGet(i,i%3===0?"kitchen":"tables")));
    const row=report("LOCAL authenticated parallel sessions "+n,results);
    if(row.failed)throw new Error("Local authenticated concurrent test failed at "+n+" users");
  }

  // Remote Cloudflare *static HTML* only. Keep below a small, finite number of
  // requests and do not touch /api on the live Worker during concurrency testing.
  for(const n of [3,10,20,30]) {
    const results=await Promise.all(Array.from({length:n},()=>fetchMeasured(LIVE+"/")));
    for(const v of results)if(!v.text?.includes("THE PBRU HERITAGE POS"))v.ok=false;
    const row=report("LIVE public static HTML parallel requests "+n,results);
    if(row.failed)throw new Error("Live static test failed at "+n+" simultaneous requests");
    await sleep(600);
  }

  // Access control check against production is a single safe unauthenticated GET.
  const protectedResult=await fetchMeasured(LIVE+"/api/pos?scope=tables");
  assert.equal(protectedResult.status,401,"Live auth guard did not return 401");
  console.log("PASS: production read-only auth guard still rejects guest");

  console.log("FINAL_REPORT "+JSON.stringify({status:"PASS",note:"No remote POS login, payment, kitchen writes, or real D1 mutations; local capacity does not imply Cloudflare CPU guarantees.",stats,elapsed_s:Math.round((Date.now()-baseline)/1000)}));
} catch(err){
  console.error("FINAL_REPORT "+JSON.stringify({status:"FAIL",error:String(err),stats,elapsed_s:Math.round((Date.now()-baseline)/1000),local_worker_logs:output.slice(-1800)}));
  process.exitCode=1;
} finally{
  server?.kill("SIGTERM");
}
