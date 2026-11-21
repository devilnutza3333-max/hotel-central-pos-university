"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, RefreshCw, Search, ShieldCheck, ShieldAlert, UserRound, X } from "lucide-react";

type Member = {
  userId: string; name: string; username: string | null;
  phone: string | null; program: string | null; yearLevel: string | null;
  role: "instructor" | "manager" | "cashier" | "student"; active: boolean;
  lastSeenAt: string; memberType: string | null; registrationStatus: string | null;
};
type Issued = { userId: string; name: string; username: string; temporaryPassword: string; active: boolean; message: string };
const roleName: Record<Member["role"], string> = {
  instructor: "อาจารย์", manager: "ผู้จัดการ", cashier: "แคชเชียร์", student: "นักศึกษา",
};
const ROOT = "pos_mgr_cb5d4d0b40dadedb79c21010";

export default function ControllerAccountsPage() {
  const [accounts,setAccounts] = useState<Member[]>([]);
  const [loading,setLoading] = useState(true);
  const [query,setQuery] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState("");
  const [issued,setIssued] = useState<Issued | null>(null);
  const [forbidden,setForbidden] = useState(false);

  async function load() {
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/controller/accounts",{cache:"no-store"});
      if (response.status === 403) {setForbidden(true);return;}
      if (!response.ok) throw new Error("ไม่สามารถโหลดรายชื่อบัญชี");
      const data=await response.json() as {accounts:Member[]};
      setAccounts(data.accounts || []);
    }catch(cause){setError(cause instanceof Error?cause.message:"เกิดข้อผิดพลาด");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>{
    const term=query.trim().toLowerCase();
    if(!term)return accounts;
    return accounts.filter(person=>
      [person.name,person.username,person.phone,person.program,roleName[person.role]]
      .some(value=>String(value||"").toLowerCase().includes(term)));
  },[accounts,query]);

  async function issue(person:Member) {
    if (!person.username || busy) return;
    if (!window.confirm(`ยืนยันออกรหัสผ่านใหม่ให้ ${person.name} (@${person.username})? รหัสเดิมและทุกอุปกรณ์ที่ล็อกอินอยู่จะถูกออกจากระบบทันที`)) return;
    setBusy(person.userId);setError("");setIssued(null);
    try {
      const response=await fetch("/api/controller/accounts",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"issueTemporaryPassword",userId:person.userId}),
        cache:"no-store",
      });
      const result=await response.json() as Issued & {error?:string;ok?:boolean};
      if(!response.ok||!result.ok)throw new Error(result.error||"ออกรหัสผ่านใหม่ไม่สำเร็จ");
      setIssued({...result,userId:person.userId});
    }catch(cause){setError(cause instanceof Error?cause.message:"ออกรหัสผ่านไม่ได้");}
    finally{setBusy("");}
  }
  async function copy(value:string) {
    try{await navigator.clipboard.writeText(value);}catch{setError("ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกจากช่องแสดงรหัส");}
  }

  return <main className="pos-controller-shell"><section className="pos-controller-card">
    <header className="pos-controller-header"><a href="/" className="pos-profile-back"><ArrowLeft size={17}/> กลับไป POS</a><span><ShieldCheck size={19}/> ศูนย์บัญชีผู้ควบคุม</span></header>
    <div className="pos-controller-intro"><h1>บัญชีสมาชิกทั้งหมด</h1>
      <p>เฉพาะผู้ควบคุมระบบหลักเท่านั้นที่ดูข้อมูลบัญชีและออกรหัสผ่านใหม่ได้</p>
      <div className="pos-controller-notice"><ShieldAlert size={19}/><span>รหัสผ่านเดิมไม่สามารถแสดงได้ เพราะระบบเข้ารหัสแบบทางเดียว หากสมาชิกลืมรหัส ให้กด “ออกรหัสใหม่” รหัสที่ออกใหม่จะแสดงครั้งเดียวสำหรับคัดลอกส่งให้สมาชิก</span></div>
    </div>
    {forbidden ? <div className="pos-controller-forbidden"><ShieldAlert size={32}/><h2>เฉพาะผู้ควบคุมระบบหลัก</h2><p>บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลหรือรีเซ็ตรหัสผ่านของสมาชิกทั้งหมด</p><a href="/">กลับไป POS</a></div> : <>
      <div className="pos-controller-tools"><label><Search size={19}/><input aria-label="ค้นหาบัญชีสมาชิก" placeholder="ค้นหาชื่อ ID เบอร์โทร หรือสาขา" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/> รีเฟรช</button></div>
      <p className="pos-controller-count">พบ {filtered.length} จาก {accounts.length} บัญชี</p>
      {loading && <p className="pos-controller-loading">กำลังโหลดรายชื่อบัญชี...</p>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="pos-controller-list">{filtered.map(person=><article className="pos-controller-person" key={person.userId}>
        <div className="pos-controller-person-title"><span className="pos-controller-initial"><UserRound size={21}/></span><div><strong>{person.name}</strong><small>{roleName[person.role]} · {person.active?"ใช้งานได้":"ยังไม่อนุมัติ/ปิดบัญชี"}</small></div></div>
        <dl><div><dt>ID เข้าระบบ</dt><dd>{person.username||"ยังไม่มี"}</dd></div>
          {person.phone && <div><dt>เบอร์โทร</dt><dd>{person.phone}</dd></div>}
          {person.program && <div><dt>สาขา</dt><dd>{person.program}</dd></div>}
          {person.yearLevel && <div><dt>ชั้นปี</dt><dd>{person.yearLevel}</dd></div>}
          <div><dt>รหัสผ่านปัจจุบัน</dt><dd>ไม่แสดงเพื่อความปลอดภัย</dd></div>
        </dl>
        {person.userId === ROOT ? <span className="pos-controller-self">บัญชีผู้ควบคุมหลัก — เปลี่ยนรหัสผ่านตัวเองในหน้าโปรไฟล์</span> :
          <button type="button" className="pos-controller-reset" onClick={()=>void issue(person)} disabled={!person.username||!!busy}><KeyRound size={16}/>{busy===person.userId?"กำลังออกรหัส...":"ออกรหัสผ่านใหม่"}</button>}
      </article>)}</div>
    </>}
    {issued&&<div className="pos-controller-modal-backdrop" role="presentation">
      <div className="pos-controller-modal" role="dialog" aria-modal="true" aria-label="รหัสผ่านใหม่ของสมาชิก">
        <div className="pos-controller-modal-title"><Check size={22}/><h2>รหัสผ่านใหม่ออกแล้ว</h2></div>
        <p>{issued.name}</p><p className="pos-controller-once">รหัสใหม่แสดงเฉพาะครั้งนี้ เมื่อปิดหน้าต่างจะไม่สามารถเรียกดูซ้ำได้</p>
        <label>ID / เบอร์โทร</label><div className="pos-controller-copy"><code>{issued.username}</code><button type="button" onClick={()=>void copy(issued.username)} aria-label="คัดลอก ID"><Copy size={19}/></button></div>
        <label>รหัสผ่านใหม่</label><div className="pos-controller-copy"><code>{issued.temporaryPassword}</code><button type="button" onClick={()=>void copy(issued.temporaryPassword)} aria-label="คัดลอกรหัสผ่าน"><Copy size={19}/></button></div>
        <p>{issued.message}</p>
        <button type="button" className="pos-controller-close" onClick={()=>setIssued(null)}><X size={17}/> ปิดและซ่อนรหัส</button>
      </div>
    </div>}
  </section></main>;
}
