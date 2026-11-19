// Execute an end-to-end delivery workflow against an isolated LOCAL D1 only.
// No requests to real Cloudflare database, customer orders, or user accounts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const BASE="http://127.0.0.1:8799";
const persist=path.resolve(".wrangler/delivery-regression-local");
const wrangler=path.resolve("node_modules/wrangler/bin/wrangler.js");
const config=path.resolve("dist/server/wrangler.json");
const sleep=(ms)=>new Promise(ok=>setTimeout(ok,ms));

function cli(args) {
  const p=spawnSync(process.execPath,[wrangler,...args],{
    encoding:"utf8",timeout:65000,maxBuffer:2_000_000,
    env:{...process.env,WRANGLER_SEND_METRICS:"false"}
  });
  if(p.status!==0)throw new Error("wrangler local failed: "+(p.stderr||p.stdout).slice(-2500));
}
function localSql(text,name) {
  const file=path.resolve(".wrangler/"+name+".sql");
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,text);
  cli(["d1","execute","hotel-central-pos-db","--local","--config",config,"--persist-to",persist,"--file",file]);
}
function tokenFor(id){
  const token=randomBytes(32).toString("base64url");
  const digest=createHash("sha256").update(token).digest("base64url");
  return {token,digest,id};
}
async function call(pathname,options={}){
  const result=await fetch(BASE+pathname,{...options,signal:AbortSignal.timeout(20000)});
  const content=await result.text();
  let json=null;
  try{json=JSON.parse(content)}catch{}
  return {status:result.status,content,json,headers:result.headers};
}
async function action(token,actionName,fields={},expected=200) {
  const r=await call("/api/pos",{
    method:"POST",headers:{"content-type":"application/json",cookie:"hotel_pos_session="+token},
    body:JSON.stringify({action:actionName,clientRequestId:randomBytes(16).toString("hex"),...fields})
  });
  assert.equal(r.status,expected,actionName+" status: "+r.status+" "+r.content.slice(0,450));
  if(expected===200)assert.equal(r.json?.ok,true,actionName+" response: "+r.content.slice(0,450));
  return r;
}
let child=null,output="";
try {
  const configJson=JSON.parse(fs.readFileSync(config,"utf8"));
  assert.equal(configJson.d1_databases[0].database_id,"bf87916e-6755-4a4b-8916-ad7a709c573b");
  fs.rmSync(persist,{recursive:true,force:true});
  fs.mkdirSync(persist,{recursive:true});
  const migrations=fs.readdirSync("drizzle").filter(p=>/^00\d\d.*\.sql$/.test(p)).sort()
    .map(p=>fs.readFileSync(path.join("drizzle",p),"utf8").replaceAll("--> statement-breakpoint","")).join("\n");
  localSql(migrations,"delivery-regression-migrations");
  const manager=tokenFor("delivery-manager");
  const rider=tokenFor("delivery-student");
  const now=Math.floor(Date.now()/1000);
  const people=[manager,rider];
  const q=[];
  for(const [i,u] of people.entries()){
    const role=i===0?"instructor":"student";
    q.push("INSERT INTO users (id,email,name,role,active,last_seen_at,created_at) VALUES ('"+u.id+"','virtual"+i+"@example.invalid','Virtual "+(i===0?"Manager":"Rider")+"','"+role+"',1,"+now+","+now+");");
    q.push("INSERT INTO auth_sessions (id,user_id,expires_at,created_at,last_seen_at) VALUES ('"+u.digest+"','"+u.id+"',"+(now+3600)+","+now+","+now+");");
  }
  q.push("INSERT INTO duty_shifts (id,label,service_date,status,opened_by,opened_at) VALUES ('test-shift','Training','2026-11-19','open','"+manager.id+"',"+now+");");
  q.push("INSERT INTO duty_assignments (id,duty_shift_id,user_id,station,status,assigned_by,assigned_at,checked_in_at) VALUES ('test-rider-assignment','test-shift','"+rider.id+"','delivery','checked_in','"+manager.id+"',"+now+","+now+");");
  localSql(q.join("\n"),"delivery-regression-seed");
  child=spawn(process.execPath,[wrangler,"dev","--config",config,"--local","--persist-to",persist,"--ip","127.0.0.1","--port","8799","--inspector-port","0","--var","AUTH_PROVIDER:local"],{
    stdio:["ignore","pipe","pipe"],env:{...process.env,WRANGLER_SEND_METRICS:"false"}
  });
  for(const pipe of [child.stdout,child.stderr]) pipe.on("data",b=>{output=(output+String(b)).slice(-10000)});
  let ready=false;
  for(let i=0;i<50;i++){
    if(child.exitCode!==null)break;
    try{const r=await call("/delivery");if(r.status===200){ready=true;break}}catch{}
    await sleep(900);
  }
  assert.ok(ready,"local worker not ready: "+output.slice(-1800));
  const page=await call("/delivery");
  assert.equal(page.status,200);
  assert.match(page.content,/Hotel Central Delivery/);
  assert.match(page.content,/\/assets\//);
  console.log("PASS static delivery page");
  const catalog=await call("/api/delivery");
  assert.equal(catalog.status,200,"catalog error: "+catalog.content.slice(0,200));
  assert.ok(catalog.json?.menu?.length>=10);
  console.log("PASS delivery catalog loaded from local D1");
  const order=await call("/api/delivery",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
      customerName:"Student Delivery Test",phone:"0812345678",building:"Campus Building 7",
      deliveryPoint:"Room 705",note:"classroom test only",campusConfirmed:true,
      items:[{menuItemId:4,quantity:1}],
    })
  });
  assert.equal(order.status,200,"order creation: "+order.content.slice(0,300));
  assert.equal(order.json?.ok,true);
  assert.match(order.json?.trackingToken||"",/^[a-f0-9]{32}$/i);
  console.log("PASS public order creation in LOCAL D1");
  const tracking=await call("/api/delivery?track="+order.json.trackingToken);
  assert.equal(tracking.status,200);
  assert.equal(tracking.json?.tracking?.status,"pending");
  assert.equal(tracking.json?.tracking?.items?.length,1);
  console.log("PASS customer tracking link and saved food items");
  const orderId=(()=>{return null})();
  // The public API intentionally returns a tracking token rather than an internal ID.
  // Retrieve ID through the authenticated management snapshot only.
  const snapshot=await call("/api/pos?scope=delivery",{headers:{cookie:"hotel_pos_session="+manager.token}});
  assert.equal(snapshot.status,200,"management snapshot: "+snapshot.content.slice(0,300));
  const opened=snapshot.json?.deliveryOrders?.find(v=>v.orderNumber===order.json.orderNumber);
  assert.ok(opened?.id);
  assert.ok(snapshot.json?.deliveryItems?.some(x=>x.orderId===opened.id));
  console.log("PASS management receives new order and line items");
  await action(manager.token,"setDeliveryStatus",{orderId:opened.id,status:"confirmed"});
  await action(manager.token,"setDeliveryStatus",{orderId:opened.id,status:"preparing"});
  const tooEarly=await action(rider.token,"setDeliveryStatus",{orderId:opened.id,status:"out_for_delivery"},400);
  assert.match(tooEarly.json?.error||"",/สถานะ|ไม่ได้/);
  console.log("PASS rider cannot collect food still preparing");
  await action(manager.token,"setDeliveryStatus",{orderId:opened.id,status:"ready_for_pickup"});
  await action(rider.token,"setDeliveryStatus",{orderId:opened.id,status:"out_for_delivery"});
  await action(rider.token,"setDeliveryStatus",{orderId:opened.id,status:"near_arrival"});
  await action(rider.token,"setDeliveryStatus",{orderId:opened.id,status:"delivered"});
  const delivered=await call("/api/delivery?track="+order.json.trackingToken);
  assert.equal(delivered.status,200);
  assert.equal(delivered.json?.tracking?.status,"delivered");
  assert.equal(delivered.json?.tracking?.riderName,"Virtual Rider");
  console.log("PASS manager prepare > food ready > rider pickup > near arrival > delivered");
  console.log("FINAL_REPORT "+JSON.stringify({status:"PASS",scope:"isolated local D1 only",steps:10,no_remote_mutations:true}));
} catch(err){
  console.error("FINAL_REPORT "+JSON.stringify({status:"FAIL",error:String(err),workerLog:output.slice(-1800)}));
  process.exitCode=1;
} finally {child?.kill("SIGTERM");}
