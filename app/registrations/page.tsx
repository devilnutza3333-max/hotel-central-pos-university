"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Entry={
 userId:string;memberType:"teacher"|"student";schoolId:string;program:string;yearLevel:string;
 status:"pending"|"approved"|"rejected";name:string;email:string;createdAt:string;
};
export default function RegistrationsPage(){
 const [rows,setRows]=useState<Entry[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async()=>{
   const r=await fetch("/api/auth/registrations",{cache:"no-store"});
   const j=await r.json() as {requests?:Entry[];error?:string};
   if(!r.ok)throw Error(j.error||"ไม่มีสิทธิ์เรียกดู");
   setRows(j.requests||[]);
 },[]);
 useEffect(()=>{load().catch(e=>setError(String(e)));},[load]);
 async function decide(userId:string,decision:"approve"|"reject"){
   if(!window.confirm(decision==="approve"?"ยืนยันอนุมัติบัญชีนี้?":"ยืนยันปฏิเสธบัญชีนี้?"))return;
   setBusy(userId);setError("");
   try{
    const r=await fetch("/api/auth/registrations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,decision})});
    const j=await r.json() as {error?:string};
    if(!r.ok)throw Error(j.error||"ดำเนินการไม่สำเร็จ");
    await load();
   }catch(e){setError(String(e));}finally{setBusy(null);}
 }
 return <main className="registration-admin">
  <div className="registration-admin-head"><h1>ตรวจสอบคำขอสมัครสมาชิก</h1><Link href="/">กลับระบบ POS</Link></div>
  <p>สำหรับอาจารย์และผู้จัดการเท่านั้น • นักศึกษาจะได้รับสิทธิ์ student ส่วนอาจารย์ที่อนุมัติจะได้รับสิทธิ์ instructor</p>
  {error&&<p role="alert" className="login-error">{error}</p>}
  {rows.length===0&&!error&&<p>ไม่มีคำขอสมัครสมาชิก</p>}
  <div className="registration-list">{rows.map(r=><article key={r.userId}>
   <div><strong>{r.name}</strong><small>{r.email} • {r.memberType==="teacher"?"อาจารย์":"นักศึกษา"}</small>
   <small>รหัส: {r.schoolId} • {r.program} {r.yearLevel? "• ปี "+r.yearLevel:""}</small></div>
   <span>{r.status==="pending"?"รออนุมัติ":r.status==="approved"?"อนุมัติแล้ว":"ปฏิเสธ"}</span>
   {r.status==="pending"&&<div className="registration-actions">
    <button disabled={busy===r.userId} onClick={()=>decide(r.userId,"approve")}>อนุมัติ</button>
    <button disabled={busy===r.userId} onClick={()=>decide(r.userId,"reject")}>ปฏิเสธ</button>
   </div>}
  </article>)}</div>
 </main>;
}
