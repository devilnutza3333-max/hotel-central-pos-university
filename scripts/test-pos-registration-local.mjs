// Full registration-and-permissions test in an ISOLATED LOCAL Cloudflare D1.
// Never accesses the live Cloudflare D1 or creates production users/orders.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const BASE="http://127.0.0.1:8798";
const persist=path.resolve(".wrangler/pos-registration-e2e-local");
const wrangler=path.resolve("node_modules/wrangler/bin/wrangler.js");
const config=path.resolve("dist/server/wrangler.json");
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function cli(args){
  const p=spawnSync(process.execPath,[wrangler,...args],{encoding:"utf8",timeout:60000,maxBuffer:3_000_000,env:{...process.env,WRANGLER_SEND_METRICS:"false"}});
  if(p.status!==0)throw Error("local Wrangler D1 command failed: "+(p.stderr||p.stdout).slice(-1600));
}
function sqlFile(contents,name){
  const file=path.resolve(".wrangler/"+name+".sql");
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,contents);
  cli(["d1","execute","hotel-central-pos-db","--local","--config",config,"--persist-to",persist,"--file",file]);
}
async function call(url,options={}){
  const res=await fetch(BASE+url,{...options,signal:AbortSignal.timeout(20000)});
  const raw=await res.text();
  let json=null;try{json=JSON.parse(raw)}catch{}
  return {status:res.status,body:json,raw,headers:res.headers};
}
const post=(url,payload,headers={})=>call(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(payload)});
const cookie=r=>{
  const header=r.headers.get("set-cookie")||"";
  const found=header.match(/hotel_pos_session=([^;]+)/);
  assert.ok(found,"expected secure local session cookie");
  return "hotel_pos_session="+found[1];
};
let server=null,logs="";
try{
  const conf=JSON.parse(fs.readFileSync(config,"utf8"));
  assert.equal(conf.name,"hotel-central-pos-university");
  assert.equal(conf.d1_databases[0].database_id,"387ccbd0-087e-4714-b3da-d1e58783cee5");
  fs.rmSync(persist,{recursive:true,force:true});
  fs.mkdirSync(persist,{recursive:true});
  const migrationNames=fs.readdirSync("drizzle").filter(name=>/^\d{4}_.*\.sql$/.test(name)&&Number(name.slice(0,4))<=15).sort();
  assert.equal(migrationNames.length,16,"expected source migrations 0000-0015");
  const allSql="CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);\n"+
    migrationNames.map(name=>fs.readFileSync(path.join("drizzle",name),"utf8").replaceAll("--> statement-breakpoint","\n")).join("\n");
  sqlFile(allSql,"pos-registration-base-migrations");
  const rootToken=randomBytes(32).toString("base64url");
  const rootHash=createHash("sha256").update(rootToken).digest("base64url");
  const now=Math.floor(Date.now()/1000);
  sqlFile(`INSERT INTO users (id,email,name,role,active,last_seen_at,created_at)
    VALUES ('pos_mgr_cb5d4d0b40dadedb79c21010','root@example.invalid','Local Test Approver','manager',1,${now},${now});
    INSERT INTO auth_sessions (id,user_id,expires_at,created_at,last_seen_at)
    VALUES ('${rootHash}','pos_mgr_cb5d4d0b40dadedb79c21010',${now+7200},${now},${now});`,"pos-registration-local-approver");
  server=spawn(process.execPath,[wrangler,"dev","--config",config,"--local","--persist-to",persist,"--ip","127.0.0.1","--port","8798","--inspector-port","0","--var","AUTH_PROVIDER:local"],{
    stdio:["ignore","pipe","pipe"],env:{...process.env,WRANGLER_SEND_METRICS:"false"}
  });
  for(const stream of [server.stdout,server.stderr])stream.on("data",bytes=>{logs=(logs+String(bytes)).slice(-7000);});
  let ready=false;
  for(let i=0;i<60;i++){
    if(server.exitCode!==null)break;
    try{const r=await call("/register");if(r.status===200){ready=true;break}}catch{}
    await sleep(1000);
  }
  assert.ok(ready,"local POS Worker did not start: "+logs.slice(-1200));

  let response=await post("/api/auth/register",{memberType:"student",program:"Creative Food",yearLevel:"2",phone:"0812345670"});
  assert.equal(response.status,201,"Student registration: "+response.raw.slice(0,400));
  assert.equal(response.body?.approved,true);
  assert.equal(response.body?.username,"0812345670");
  assert.ok(response.body.password.length>=16);
  const studentPassword=response.body.password;
  console.log("PASS: student registered with branch, year and phone only");

  response=await post("/api/auth/register",{memberType:"student",program:"Creative Food",yearLevel:"2",phone:"0812345670"});
  assert.equal(response.status,409,"Duplicate phone must be rejected");
  response=await post("/api/auth/register",{memberType:"teacher",fullName:"Test Teacher",phone:"0822345670"});
  assert.equal(response.status,201,"Teacher registration: "+response.raw.slice(0,400));
  assert.equal(response.body?.approved,false);
  const teacherPassword=response.body.password;
  console.log("PASS: teacher registered as inactive, pending independent approval");

  const studentLogin=await post("/api/auth/login",{username:"0812345670",password:studentPassword});
  assert.equal(studentLogin.status,200,"Student login: "+studentLogin.raw.slice(0,300));
  const studentCookie=cookie(studentLogin);
  const pendingLogin=await post("/api/auth/login",{username:"0822345670",password:teacherPassword});
  assert.equal(pendingLogin.status,403,"Unapproved teacher must not login");
  const denied=await call("/api/auth/registrations",{headers:{cookie:studentCookie}});
  assert.equal(denied.status,403,"Student must not review teacher applications");
  console.log("PASS: low-privilege student login and pending teacher denial");

  const rootCookie="hotel_pos_session="+rootToken;
  const approvals=await call("/api/auth/registrations",{headers:{cookie:rootCookie}});
  assert.equal(approvals.status,200,"Approver requests: "+approvals.raw.slice(0,400));
  const teacherRequest=approvals.body?.requests?.find(x=>x.phone==="0822345670");
  assert.ok(teacherRequest,"Teacher request must appear on approval screen");
  const approved=await call("/api/auth/registrations",{method:"PATCH",headers:{"content-type":"application/json",cookie:rootCookie},body:JSON.stringify({userId:teacherRequest.userId,decision:"approve"})});
  assert.equal(approved.status,200,"Teacher approval: "+approved.raw.slice(0,400));
  const teacherLogin=await post("/api/auth/login",{username:"0822345670",password:teacherPassword});
  assert.equal(teacherLogin.status,200,"Approved instructor login: "+teacherLogin.raw.slice(0,350));
  const teacherCookie=cookie(teacherLogin);
  const team=await call("/api/pos?scope=team",{headers:{cookie:teacherCookie}});
  assert.equal(team.status,200,"Team view: "+team.raw.slice(0,350));
  assert.equal(team.body?.profile?.role,"instructor");
  const student=team.body?.users?.find(u=>u.email==="0812345670@local.pos");
  assert.ok(student,"Student should appear in team list");
  console.log("PASS: initial manager approval grants full instructor role");

  const promote=await post("/api/pos",{action:"setRole",userId:student.id,role:"manager",clientRequestId:randomBytes(16).toString("hex")},{cookie:teacherCookie});
  assert.equal(promote.status,200,"Teacher promotion: "+promote.raw.slice(0,400));
  const studentManagement=await call("/api/pos?scope=team",{headers:{cookie:studentCookie}});
  assert.equal(studentManagement.body?.profile?.role,"manager");
  const forbidden=await call("/api/auth/registrations",{headers:{cookie:studentCookie}});
  assert.equal(forbidden.status,403,"Student trainee manager must not approve teachers");
  console.log("PASS: instructor assigns student as trainee manager; trainee cannot grant teacher role");

  // Self-service password change for a student temporarily acting as manager.
  // None of these requests touches Cloudflare production users or sessions.
  const noSession = await post("/api/auth/change-password",{
    oldPassword:"untrusted",newPassword:"ChangedNewPass2026!",confirmPassword:"ChangedNewPass2026!",
  });
  assert.equal(noSession.status,401,"Not logged in must be denied");
  const badOld = await post("/api/auth/change-password",{
    oldPassword:"incorrect-current-password",newPassword:"ChangedNewPass2026!",confirmPassword:"ChangedNewPass2026!",
  },{cookie:studentCookie});
  assert.equal(badOld.status,403,"Current password required");
  const mismatch = await post("/api/auth/change-password",{
    oldPassword:studentPassword,newPassword:"ChangedNewPass2026!",confirmPassword:"different-confirmation",
  },{cookie:studentCookie});
  assert.equal(mismatch.status,400,"New passwords must match");
  const studentNewPassword="StudentNewPass2026!random";
  const changedStudent=await post("/api/auth/change-password",{
    oldPassword:studentPassword,newPassword:studentNewPassword,confirmPassword:studentNewPassword,
  },{cookie:studentCookie});
  assert.equal(changedStudent.status,200,"Trainee manager password change: "+changedStudent.raw.slice(0,300));
  assert.equal(changedStudent.body?.ok,true);
  const staleSession=await call("/api/pos?scope=team",{headers:{cookie:studentCookie}});
  assert.equal(staleSession.status,401,"Prior session must be revoked");
  const oldLogin=await post("/api/auth/login",{username:"0812345670",password:studentPassword});
  assert.equal(oldLogin.status,401,"Prior password must no longer work");
  const newLogin=await post("/api/auth/login",{username:"0812345670",password:studentNewPassword});
  assert.equal(newLogin.status,200,"New password should permit sign-in");
  const updatedStudentCookie=cookie(newLogin);
  const activeManager=await call("/api/pos?scope=team",{headers:{cookie:updatedStudentCookie}});
  assert.equal(activeManager.body?.profile?.role,"manager");
  console.log("PASS: trainee manager can change own password, old login and sessions revoked");

  const revert=await post("/api/pos",{action:"setRole",userId:student.id,role:"student",clientRequestId:randomBytes(16).toString("hex")},{cookie:teacherCookie});
  assert.equal(revert.status,200);
  console.log("PASS: instructor can restore original student role");
  const teacherNewPassword="TeacherNewPass2026!secure";
  const changedTeacher=await post("/api/auth/change-password",{
    oldPassword:teacherPassword,newPassword:teacherNewPassword,confirmPassword:teacherNewPassword,
  },{cookie:teacherCookie});
  assert.equal(changedTeacher.status,200,"Instructor can change own password");
  const priorTeacherSession=await call("/api/pos?scope=team",{headers:{cookie:teacherCookie}});
  assert.equal(priorTeacherSession.status,401,"Old teacher session should be revoked");
  const teacherNewLogin=await post("/api/auth/login",{username:"0822345670",password:teacherNewPassword});
  assert.equal(teacherNewLogin.status,200,"Teacher can sign in with changed password");
  console.log("PASS: verified instructor can also change password; all prior sessions revoked");
  console.log("ALL POS REGISTRATION TESTS PASSED ON LOCAL D1 — no production changes");
}catch(error){
  console.error("REGISTRATION LOCAL TEST FAILED:",error instanceof Error?error.message:String(error));
  console.error("LOCAL WORKER LOG EXCERPT:",logs.slice(-1700));
  process.exitCode=1;
}finally{
  if(server?.pid){server.kill("SIGTERM");await sleep(500);}
}
