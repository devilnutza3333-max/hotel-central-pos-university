// Hotel Central POS delivery load test. ALL writes use isolated LOCAL D1; never production.
// Three ACCELERATED simulated days at 200 orders each, including peak concurrent users.
// Timings are HTTP wall-clock, not Cloudflare Workers Free CPU or remote D1 performance.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const CONFIG=path.resolve("dist/server/wrangler.json");
const CLI=path.resolve("node_modules/wrangler/bin/wrangler.js");
const PERSIST=path.resolve(".wrangler/delivery-200-per-day-isolated");
const REMOTE=process.env.TEST_BASE_URL?.trim() || "";
// Never let this test write to the existing Hotel Central production Worker.
if (REMOTE && !/^https:\/\/hotel-central-pos-delivery-lab\.[a-z0-9-]+\.workers\.dev\/?$/i.test(REMOTE)) {
  throw new Error("Remote delivery load test permits ONLY the isolated staging Worker.");
}
if (REMOTE && !process.env.TEST_SESSION_TOKEN) throw new Error("Missing staging-only session token");
const BASE=REMOTE || "http://127.0.0.1:8799";
const OUT="test-results";
const DAYS=[
 {day:1,name:"normal",periods:[["offpeak",60,5],["lunch-peak",80,10],["dinner-peak",60,10]]},
 {day:2,name:"busy",periods:[["offpeak",40,5],["lunch-peak",100,20],["dinner-peak",60,12]]},
 {day:3,name:"high-peak",periods:[["offpeak",30,5],["lunch-peak",120,30],["dinner-peak",50,15]]},
];
const stats=[];
let server=null,workerLogs="",orderCreated=0,orderDelivered=0,trackingOk=0;
const started=performance.now();
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function runSql(source,name){
 fs.mkdirSync(".wrangler",{recursive:true});
 const file=path.resolve(".wrangler/"+name+".sql");
 fs.writeFileSync(file,source);
 const cmd=spawnSync(process.execPath,[CLI,"d1","execute","hotel-central-pos-db","--local","--config",CONFIG,"--persist-to",PERSIST,"--file",file],{
  encoding:"utf8",timeout:90000,maxBuffer:3000000,env:{...process.env,WRANGLER_SEND_METRICS:"false"}
 });
 if(cmd.status!==0)throw Error("LOCAL D1 failed: "+(cmd.stderr||cmd.stdout).slice(-1200));
}
function quantile(rows,q){
 if(!rows.length)return null;
 const sorted=rows.toSorted((a,b)=>a-b);
 return Math.round(sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]);
}
function summary(results){
 const ok=results.filter(r=>r.ok),failed=results.filter(r=>!r.ok);
 return {sent:results.length,ok:ok.length,failed:failed.length,p50_ms:quantile(ok.map(r=>r.ms),.5),p95_ms:quantile(ok.map(r=>r.ms),.95),p99_ms:quantile(ok.map(r=>r.ms),.99),
   max_ms:ok.length?Math.round(Math.max(...ok.map(r=>r.ms))):null,
   examples:failed.slice(0,3).map(r=>({http:r.status||0,reason:r.body?.error||r.error||r.preview}))};
}
async function request(route,options={}){
 const start=performance.now();
 try{
  const response=await fetch(BASE+route,{...options,signal:AbortSignal.timeout(25000)});
  const text=await response.text();
  let body;
  try{body=JSON.parse(text)}catch{body=null}
  return {ok:response.ok&&!!body&&!body.error,status:response.status,ms:performance.now()-start,body,preview:text.slice(0,200)};
 }catch(e){return {ok:false,status:0,ms:performance.now()-start,error:String(e)}}
}
async function inChunks(inputs,maxParallel,handler){
 const outcomes=[];
 for(let index=0;index<inputs.length;index+=maxParallel){
  outcomes.push(...await Promise.all(inputs.slice(index,index+maxParallel).map(handler)));
 }
 return outcomes;
}
async function runWave(day,periodName,count,concurrency,startIndex,manager,menu){
 const waveStarted=performance.now(),ids=Array.from({length:count},(_,j)=>startIndex+j);
 const creation=await inChunks(ids,concurrency,async i=>{
  const phone="08"+String(10000000+day*1000+i).slice(-8);
  const items=[{menuItemId:menu[i%menu.length].id,quantity:i%3===0?2:1}];
  if(i%4===0)items.push({menuItemId:menu[(i+1)%menu.length].id,quantity:1});
  const r=await request("/api/delivery",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({customerName:"Student Test "+day+"-"+i,phone,
      building:"Training Campus Building",deliveryPoint:"Room "+(100+i),campusConfirmed:true,
      note:"ISOLATED test",items})});
  return {...r,ok:r.ok&&r.body?.ok===true&&/^[a-f0-9]{32}$/.test(r.body.trackingToken||""),
   orderNumber:r.body?.orderNumber,trackingToken:r.body?.trackingToken};
 });
 const created=creation.filter(r=>r.ok);
 orderCreated+=created.length;
 const snapshot=await request("/api/pos?scope=delivery",{headers:{cookie:"hotel_pos_session="+manager.token}});
 const lookup=new Map((snapshot.body?.deliveryOrders||[]).map(o=>[o.orderNumber,o.id]));
 const found=created.map(r=>({...r,id:lookup.get(r.orderNumber)})).filter(r=>r.id);
 let active=found;
 const transitions=[],failureSamples=[];
 for(const status of ["confirmed","preparing","ready_for_pickup","out_for_delivery","near_arrival","delivered"]){
  const result=await inChunks(active,Math.min(concurrency,20),async order=>{
   const r=await request("/api/pos",{method:"POST",headers:{"content-type":"application/json",cookie:"hotel_pos_session="+manager.token},
    body:JSON.stringify({action:"setDeliveryStatus",orderId:order.id,status,clientRequestId:randomBytes(16).toString("hex")})});
   return {...r,ok:r.ok&&r.body?.ok===true,order};
  });
  transitions.push(...result);
  const invalid=result.filter(r=>!r.ok);
  failureSamples.push(...invalid.slice(0,3).map(r=>({status,http:r.status,reason:r.body?.error||r.error||r.preview})));
  active=result.filter(r=>r.ok).map(r=>r.order);
  if(!active.length)break;
 }
 orderDelivered+=active.length;
 const tracking=await inChunks(active,Math.min(concurrency,20),async order=>{
  const r=await request("/api/delivery?track="+order.trackingToken);
  return {...r,ok:r.ok&&r.body?.tracking?.status==="delivered"&&r.body.tracking.orderNumber===order.orderNumber};
 });
 trackingOk+=tracking.filter(r=>r.ok).length;
 const wave={day,period:periodName,orders_attempted:count,peak_parallel:concurrency,created:created.length,
   staff_board_found:found.length,delivered:active.length,tracking_verified:tracking.filter(r=>r.ok).length,
   create:summary(creation),manager_refresh:summary([snapshot]),status:summary(transitions),tracking:summary(tracking),
   elapsed_s:Math.round((performance.now()-waveStarted)/100)/10,failures:failureSamples.slice(0,3)};
 stats.push(wave);
 console.log("WAVE_REPORT",JSON.stringify(wave));
 return wave;
}
function report(state,reason){
 fs.mkdirSync(OUT,{recursive:true});
 const days=DAYS.map(d=>{
  const waves=stats.filter(s=>s.day===d.day);
  const count=k=>waves.reduce((n,v)=>n+v[k],0);
  return {day:d.day,name:d.name,attempted:count("orders_attempted"),created:count("created"),
   delivered:count("delivered"),tracked:count("tracking_verified"),peak_parallel:d.periods[1][2],lunch_peak_orders:d.periods[1][1]};
 });
 const output={result:state,reason:reason||null,expected:600,created:orderCreated,delivered:orderDelivered,tracked:trackingOk,
  days,waves:stats,seconds:Math.round((performance.now()-started)/1000),
  limitations:["Simulated days are accelerated scenarios, not real calendar days.",
  REMOTE ? "All delivery writes went to an isolated Cloudflare D1 staging database; live production D1 data untouched." : "All delivery writes went to isolated local Wrangler D1; live Cloudflare D1 data untouched.",
  REMOTE ? "Remote staging is on Cloudflare Free and includes real Worker CPU limits; staging does not perfectly represent production traffic." : "Local HTTP wall time is not Workers Free CPU time; cannot prove absence of Error 1102 in live production.",
  "Management status changes use one logged-in manager account; no real payment service or courier route." ]};
 fs.writeFileSync(path.join(OUT,"delivery-200-peak-report.json"),JSON.stringify(output,null,2)+"\n");
 const lines=[
  "# Delivery 200 orders/day and lunch peak load test",
  "All data is isolated local D1. Day labels are accelerated scenarios, not elapsed actual days.",
  "",
  "| Simulated day | Attempted | Created | Delivered | Tracking | Lunch peak orders | Peak parallel |",
  "|---|---:|---:|---:|---:|---:|---:|",
  ...days.map(d=>"| "+d.day+" | "+d.attempted+" | "+d.created+" | "+d.delivered+" | "+d.tracked+" | "+d.lunch_peak_orders+" | "+d.peak_parallel+" |"),
  "",
  "| Day | Period | Sent | Created | Delivered | Create p95 ms | Status p95 ms | Elapsed seconds |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
  ...stats.map(w=>"| "+w.day+" | "+w.period+" | "+w.orders_attempted+" | "+w.created+" | "+w.delivered+" | "+(w.create.p95_ms??"—")+" | "+(w.status.p95_ms??"—")+" | "+w.elapsed_s+" |"),
  "",
  "Result: "+state+". "+(reason||"")+" Created: "+orderCreated+"; delivered: "+orderDelivered+"; tracking verified: "+trackingOk,
  ...output.limitations.map(s=>"- "+s)
 ];
 fs.writeFileSync(path.join(OUT,"delivery-200-peak-report.md"),lines.join("\n")+"\n");
 console.log("FINAL_REPORT",JSON.stringify({result:state,expected:600,created:orderCreated,delivered:orderDelivered,tracked:trackingOk,seconds:output.seconds,days,reason}));
}
try{
 const conf=JSON.parse(fs.readFileSync(CONFIG,"utf8"));
 assert.equal(conf.name,"hotel-central-pos-university");
 assert.equal(conf.d1_databases.find(d=>d.binding==="DB")?.database_id,"bf87916e-6755-4a4b-8916-ad7a709c573b");
 let manager=REMOTE ? {token:process.env.TEST_SESSION_TOKEN} : null;
 if (!REMOTE) {
 fs.rmSync(PERSIST,{recursive:true,force:true});
 fs.mkdirSync(PERSIST,{recursive:true});
 const files=fs.readdirSync("drizzle").filter(p=>/^00\d\d.*\.sql$/.test(p)).sort();
 assert.equal(files.length,16);
 runSql(files.map(p=>fs.readFileSync(path.join("drizzle",p),"utf8").replaceAll("--> statement-breakpoint","")).join("\n"),"delivery-200-schema");
 const token=randomBytes(32).toString("base64url");
 const digest=createHash("sha256").update(token).digest("base64url");
 manager={token};
 const time=Math.floor(Date.now()/1000);
 runSql("INSERT INTO users (id,email,name,role,active,last_seen_at,created_at) VALUES ('load-manager','manager@example.invalid','Delivery Load Manager','manager',1,"+time+","+time+");\n"+
        "INSERT INTO auth_sessions (id,user_id,expires_at,created_at,last_seen_at) VALUES ('"+digest+"','load-manager',"+(time+3*3600)+","+time+","+time+");",
        "delivery-200-staff");
 server=spawn(process.execPath,[CLI,"dev","--config",CONFIG,"--local","--persist-to",PERSIST,"--ip","127.0.0.1","--port","8799","--inspector-port","0","--var","AUTH_PROVIDER:local"],{
  stdio:["ignore","pipe","pipe"],env:{...process.env,WRANGLER_SEND_METRICS:"false"}});
 for(const pipe of [server.stdout,server.stderr])pipe.on("data",b=>{workerLogs=(workerLogs+String(b)).slice(-9000)});
 let ready=false;
 for(let j=0;j<60;j++){if(server.exitCode!==null)throw Error("Local Worker exited "+workerLogs.slice(-900));
  try{const r=await request("/delivery");if(r.status===200){ready=true;break}}catch{}
  await sleep(900);
 }
 assert.ok(ready,"Local Worker not ready");

 }
 assert.ok(manager && manager.token,"Missing manager test session");
  const warm=await request("/api/pos?scope=tables",{headers:{cookie:"hotel_pos_session="+manager.token}});
 assert.ok(warm.ok&&warm.body?.profile?.role==="manager","Failed to seed demo menu with logged-in manager: "+warm.preview);
 const menuResult=await request("/api/delivery");
 assert.ok(menuResult.ok&&menuResult.body?.menu?.length>=10,"Delivery menu missing");
 const menu=menuResult.body.menu;
 console.log("LOAD_SETUP",JSON.stringify({test:"isolated local D1",menus:menu.length,days:DAYS}));
 for(const d of DAYS){
  let position=0;
  for(const [period,count,parallel] of d.periods){
   let left=count;
   while(left>0){
    // During lunch rush, let all pending orders accumulate before staff actions.
    // This verifies the board can show 80/100/120 ACTIVE orders at once.
    const batch=Math.min(left,period==="lunch-peak"?120:50);
    await runWave(d.day,period,batch,parallel,position,manager,menu);
    position+=batch;
    left-=batch;
   }
  }
  assert.equal(position,200);
  const day=stats.filter(s=>s.day===d.day);
  console.log("DAY_REPORT",JSON.stringify({day:d.day,created:day.reduce((x,v)=>x+v.created,0),delivered:day.reduce((x,v)=>x+v.delivered,0)}));
 }
 assert.equal(orderCreated,600,"Not all 600 orders were accepted");
 assert.equal(orderDelivered,600,"Not all 600 orders were delivered");
 assert.equal(trackingOk,600,"Some delivery tracking responses failed");
 report("PASS",null);
}catch(e){report("FAIL",String(e));console.error("LOCAL_WORKER_TAIL",workerLogs.slice(-2500));process.exitCode=1;
}finally{server?.kill("SIGTERM");}
