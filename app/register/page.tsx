"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { UserRoundPlus, GraduationCap, BookOpen } from "lucide-react";

export default function RegisterPage() {
  const [kind,setKind]=useState<"student"|"teacher">("student");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");setSuccess("");setBusy(true);
    const form=new FormData(event.currentTarget);
    const data=Object.fromEntries(form.entries());
    if (data.password!==data.confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");setBusy(false);return;
    }
    try {
      const response=await fetch("/api/auth/register", {
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({...data,memberType:kind}),
      });
      const payload=await response.json() as {error?:string;message?:string};
      if(!response.ok) throw Error(payload.error||"สมัครสมาชิกไม่สำเร็จ");
      setSuccess(payload.message||"ส่งคำขอสมัครสำเร็จ");
      (event.target as HTMLFormElement).reset();
    } catch(e) {setError(e instanceof Error?e.message:"มีข้อผิดพลาด");}
    finally {setBusy(false);}
  }
  return (
    <main className="login-shell">
      <section className="login-card register-card">
        <div className="login-brand"><span className="brand-mark">H</span><div><b>Hotel Central POS</b><small>UNIVERSITY TRAINING SYSTEM</small></div></div>
        <div className="login-copy"><span><UserRoundPlus size={18}/></span><h1>สมัครสมาชิก</h1>
          <p>ระบบฝึกปฏิบัติด้านอาหารและการบริการ • มหาวิทยาลัยราชภัฏเพชรบุรี</p></div>
        <div className="register-kind">
          <button className={kind==="student"?"active":""} onClick={()=>setKind("student")} type="button"><GraduationCap size={17}/> นักศึกษา</button>
          <button className={kind==="teacher"?"active":""} onClick={()=>setKind("teacher")} type="button"><BookOpen size={17}/> อาจารย์</button>
        </div>
        <form onSubmit={submit} className="register-form">
          <label><span>ชื่อ-นามสกุล</span><input name="fullName" minLength={3} maxLength={120} placeholder="ชื่อจริง นามสกุล" required /></label>
          <label><span>ชื่อผู้ใช้ (ภาษาอังกฤษ)</span><input name="username" minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" autoComplete="username" required /></label>
          <label><span>อีเมล</span><input name="email" type="email" maxLength={180} autoComplete="email" required /></label>
          <label><span>{kind==="student"?"รหัสนักศึกษา":"รหัสบุคลากร"}</span><input name="schoolId" minLength={3} maxLength={32} pattern="[a-zA-Z0-9-]+" required /></label>
          <label><span>{kind==="student"?"สาขาวิชา / หลักสูตร":"สังกัด / สาขาวิชา"}</span><input name="program" minLength={2} maxLength={150} required /></label>
          {kind==="student"&&<label><span>ชั้นปี</span><select name="yearLevel" required defaultValue=""><option value="" disabled>เลือกชั้นปี</option>{[1,2,3,4,5,6].map(y=><option value={y} key={y}>ปี {y}</option>)}</select></label>}
          <label><span>โทรศัพท์ (ไม่บังคับ)</span><input name="phone" type="tel" maxLength={25} /></label>
          <label><span>รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)</span><input name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></label>
          <label><span>ยืนยันรหัสผ่าน</span><input name="confirmPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></label>
          {error&&<p className="login-error" role="alert">{error}</p>}
          {success&&<p className="register-success" role="status">{success}</p>}
          <button type="submit" disabled={busy}>{busy?"กำลังส่งคำขอ...":"สมัครสมาชิก"}</button>
          <p className="register-note">ทุกบัญชีต้องได้รับอนุมัติจากอาจารย์หรือผู้จัดการก่อนใช้งาน และไม่มีการให้สิทธิ์ผู้จัดการโดยอัตโนมัติ</p>
        </form>
        <div className="register-footer"><Link href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</Link></div>
      </section>
    </main>
  );
}
