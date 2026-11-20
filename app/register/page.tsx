"use client";

import { type FormEvent, useState } from "react";
import { BookOpen, CheckCircle2, Copy, GraduationCap, UserPlus } from "lucide-react";

type Kind = "student" | "teacher";
type Result = { username: string; password: string; approved: boolean; message: string };

export default function RegisterPage() {
  const [kind, setKind] = useState<Kind>("student");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true); setError(""); setResult(null);
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), memberType: kind }),
      });
      const data = await response.json() as Result & {error?: string};
      if (!response.ok) throw new Error(data.error || "สมัครสมาชิกไม่สำเร็จ");
      setResult(data);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "สมัครสมาชิกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  const copy = (value: string) => { void navigator.clipboard?.writeText(value); };
  return <main className="login-shell"><section className="login-card pos-register-card">
    <div className="login-brand"><span className="brand-mark">H</span><div><b>Hotel Central POS</b><small>UNIVERSITY TRAINING SYSTEM</small></div></div>
    <div className="login-copy"><span><UserPlus size={18}/></span><h1>สมัครสมาชิก</h1><p>เลือกประเภทผู้สมัครและกรอกข้อมูลสั้น ๆ ไม่ต้องมีรหัสนักศึกษา</p></div>
    <div className="pos-register-kind">
      <button type="button" className={kind==="student"?"active":""} onClick={()=>{setKind("student");setResult(null);setError("");}}><GraduationCap size={18}/> นักศึกษา</button>
      <button type="button" className={kind==="teacher"?"active":""} onClick={()=>{setKind("teacher");setResult(null);setError("");}}><BookOpen size={18}/> อาจารย์</button>
    </div>
    {!result ? <form key={kind} onSubmit={submit} className="pos-register-form">
      {kind==="teacher" ? <label><span>ชื่ออาจารย์</span><input name="fullName" placeholder="ชื่อ-นามสกุล" minLength={2} maxLength={100} required /></label> : <>
        <label><span>สาขาวิชา</span><input name="program" placeholder="เช่น อาหารสร้างสรรค์ฯ" minLength={2} maxLength={100} required /></label>
        <label><span>ชั้นปี</span><select name="yearLevel" defaultValue="" required><option value="" disabled>เลือกชั้นปี</option>{[1,2,3,4,5,6].map(year=><option key={year} value={year}>ปี {year}</option>)}</select></label>
      </>}
      <label><span>เบอร์โทรศัพท์ (ใช้เป็น ID เข้าระบบ)</span><input name="phone" type="tel" inputMode="numeric" autoComplete="tel" pattern="0[0-9]{9}" maxLength={10} placeholder="08XXXXXXXX" required /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button disabled={busy} type="submit">{busy?"กำลังสมัคร...":"สมัครสมาชิกและรับรหัสผ่าน"}</button>
      <p className="pos-register-note">{kind==="teacher" ? "บัญชีอาจารย์ต้องได้รับอนุมัติก่อน จึงจะมีสิทธิ์จัดการ POS ทุกส่วน" : "นักศึกษาเข้าใช้สิทธิ์พื้นฐานได้ก่อน อาจารย์เป็นผู้มอบหมายสิทธิ์ผู้จัดการหรือแคชเชียร์"}</p>
    </form> : <div className="pos-register-result" role="status">
      <CheckCircle2 size={32}/><h2>สมัครสมาชิกสำเร็จ</h2>
      <p>{result.message}</p>
      <p className="pos-register-warning">โปรดคัดลอกรหัสผ่านเก็บไว้ทันที ระบบจะแสดงรหัสนี้เพียงครั้งเดียว</p>
      <div className="pos-register-credential"><span>ID / เบอร์โทร</span><strong>{result.username}</strong><button type="button" onClick={()=>copy(result.username)} aria-label="คัดลอก ID"><Copy size={16}/></button></div>
      <div className="pos-register-credential"><span>รหัสผ่าน</span><strong>{result.password}</strong><button type="button" onClick={()=>copy(result.password)} aria-label="คัดลอกรหัสผ่าน"><Copy size={16}/></button></div>
      <a className="pos-register-login" href="/login">{result.approved?"เข้าสู่ระบบ POS":"กลับไปหน้าเข้าสู่ระบบหลังได้รับอนุมัติ"}</a>
      <button className="pos-register-another" type="button" onClick={()=>setResult(null)}>สมัครบัญชีอื่น</button>
    </div>}
    <div className="register-footer"><a className="pos-native-login-link" href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</a></div>
  </section></main>;
}
