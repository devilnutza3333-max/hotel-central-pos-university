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

  // Member profile and avatar tests, all in ISOLATED LOCAL D1.
  const studentProfile=await call("/api/account/profile",{headers:{cookie:studentCookie}});
  assert.equal(studentProfile.status,200,"Student profile details: "+studentProfile.raw.slice(0,300));
  assert.equal(studentProfile.body?.phone,"0812345670");
  assert.equal(studentProfile.body?.program,"Creative Food");
  assert.equal(studentProfile.body?.yearLevel,"2");
  assert.equal(studentProfile.body?.role,"student");
  assert.equal(studentProfile.body?.avatarData,"");
  const unauthorizedProfile=await call("/api/account/profile");
  assert.equal(unauthorizedProfile.status,401,"Anonymous profile access must be rejected");
  const unauthorizedPhoto=await call("/api/account/profile",{
    method:"PUT",headers:{"content-type":"application/json"},
    body:JSON.stringify({avatarData:null}),
  });
  assert.equal(unauthorizedPhoto.status,401,"Anonymous photo modification must be rejected");
  // The Wrangler local D1 filesystem watcher may restart the Worker after the
  // first profile GET creates the optional table. Let that local restart settle.
  await sleep(1500);
  const testPng="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+YcAAAAASUVORK5CYII=";
  // The local Wrangler filesystem watcher can restart the Worker just after
  // its first new D1 table appears. Retry this one idempotent photo upsert
  // only on the watcher's documented transient 503, never on app errors.
  let uploadPhoto;
  for (let attempt=0; attempt<6; attempt++) {
    uploadPhoto=await call("/api/account/profile",{
      method:"PUT",headers:{"content-type":"application/json",cookie:studentCookie},
      body:JSON.stringify({avatarData:testPng,userId:"someone-else"}),
    });
    if (uploadPhoto.status!==503) break;
    await sleep(1000+attempt*500);
  }
  assert.equal(uploadPhoto.status,200,"Student photo upload: "+uploadPhoto.raw.slice(0,350));
  const savedPhoto=await call("/api/account/profile",{headers:{cookie:studentCookie}});
  assert.equal(savedPhoto.body?.avatarData,testPng,"Photo stored for signed-in member only");
  const badAvatar=await call("/api/account/profile",{
    method:"PUT",headers:{"content-type":"application/json",cookie:studentCookie},
    body:JSON.stringify({avatarData:"data:image/svg+xml;base64,PGh0bWw+"}),
  });
  assert.equal(badAvatar.status,400,"SVG and unsafe image formats must be rejected");
  console.log("PASS: individual student profile, phone/year/program, photo upload, and authorization guards");

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
  const teacherProfile=await call("/api/account/profile",{headers:{cookie:teacherCookie}});
  assert.equal(teacherProfile.status,200);
  assert.equal(teacherProfile.body?.role,"instructor");
  assert.equal(teacherProfile.body?.avatarData,"","Instructor cannot see student avatar in own profile");
  assert.equal(teacherProfile.body?.name,"Test Teacher");
  const removePhoto=await call("/api/account/profile",{
    method:"PUT",headers:{"content-type":"application/json",cookie:studentCookie},
    body:JSON.stringify({avatarData:null}),
  });
  assert.equal(removePhoto.status,200,"Member may remove own photo");
  const removedPhoto=await call("/api/account/profile",{headers:{cookie:studentCookie}});
  assert.equal(removedPhoto.body?.avatarData,"");
  console.log("PASS: teacher's profile is separate; student can remove their own photo");

  const team=await call("/api/pos?scope=team",{headers:{cookie:teacherCookie}});
  assert.equal(team.status,200,"Team view: "+team.raw.slice(0,350));
  assert.equal(team.body?.profile?.role,"instructor");
  const student=team.body?.users?.find(u=>u.email==="0812345670@local.pos");
  assert.ok(student,"Student should appear in team list");
  console.log("PASS: initial manager approval grants full instructor role");

  const promote=await post("/api/pos",{action:"setRole",userId:student.id,role:"manager",clientRequestId:randomBytes(16).toString("hex")},{cookie:teacherCookie});
  assert.equal(promote.status,200,"Teacher promotion: "+promote.raw.slice(0,400));
  // Promotion must not permit access to the user list: never send roster for any scope.
  const traineeTeam=await call("/api/pos?scope=team",{headers:{cookie:studentCookie}});
  assert.equal(traineeTeam.status,403,"Student manager must be blocked from team API");
  assert.equal(traineeTeam.body?.users,undefined,"Forbidden team API must return no user roster");
  for (const scope of ["dashboard","duty","audit"]) {
    const view=await call("/api/pos?scope="+scope,{headers:{cookie:studentCookie}});
    assert.equal(view.status,200,"Trainee manager should keep restaurant access for "+scope);
    assert.equal(view.body?.profile?.role,"manager");
    assert.equal(view.body?.users,undefined,"No roster must be exposed to trainee via "+scope);
  }
  const studentManagement=await call("/api/pos?scope=dashboard",{headers:{cookie:studentCookie}});
  assert.equal(studentManagement.body?.profile?.role,"manager");
  const controllerTeam=await call("/api/pos?scope=team",{headers:{cookie:rootCookie}});
  assert.equal(controllerTeam.status,200,"Original controller must retain team visibility");
  assert.ok(controllerTeam.body?.users?.some(user=>user.id===student.id),"Controller sees user roster");
  console.log("PASS: trainee manager denied team roster from all scopes; instructor and controller retain access");
  const forbidden=await call("/api/auth/registrations",{headers:{cookie:studentCookie}});
  assert.equal(forbidden.status,403,"Student trainee manager must not approve teachers");
  console.log("PASS: instructor assigns student as trainee manager; trainee cannot grant teacher role");

  const revert=await post("/api/pos",{action:"setRole",userId:student.id,role:"student",clientRequestId:randomBytes(16).toString("hex")},{cookie:teacherCookie});
  assert.equal(revert.status,200);
  console.log("PASS: instructor can restore original student role");

  const signedOut=await call("/api/auth/logout",{
    method:"POST",headers:{cookie:studentCookie,origin:BASE},
    redirect:"manual",
  });
  assert.equal(signedOut.status,303,"Logout POST should redirect to login");
  assert.ok(signedOut.headers.get("location")?.endsWith("/login"));
  const loggedOut=await call("/api/account/profile",{headers:{cookie:studentCookie}});
  assert.equal(loggedOut.status,401,"Logout must revoke current session");
  console.log("PASS: member Logout invalidates session and redirects to Login");
  console.log("ALL POS REGISTRATION, PROFILE PHOTO AND LOGOUT TESTS PASSED ON LOCAL D1 — no production changes");
}catch(error){
  console.error("REGISTRATION LOCAL TEST FAILED:",error instanceof Error?error.message:String(error));
  console.error("LOCAL WORKER LOG EXCERPT:",logs.slice(-1700));
  process.exitCode=1;
}finally{
  if(server?.pid){server.kill("SIGTERM");await sleep(500);}
}
