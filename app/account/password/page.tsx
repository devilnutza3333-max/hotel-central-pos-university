"use client";

import { type FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";

export default function ChangeMyPasswordPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oldPassword: form.get("oldPassword"),
          newPassword: form.get("newPassword"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const data = await response.json() as {ok?: boolean;error?: string;redirect?: string};
      if (!response.ok || !data.ok) throw new Error(data.error || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
      window.location.replace(data.redirect || "/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาด");
    } finally { setBusy(false); }
  }
  return <main className="login-shell">
    <section className="login-card pos-password-card">
      <div className="login-brand"><span className="brand-mark">H</span><div><b>Hotel Central POS</b><small>ACCOUNT SECURITY</small></div></div>
      <div className="login-copy"><span><KeyRound size={18}/></span><h1>เปลี่ยนรหัสผ่านของฉัน</h1>
        <p>สำหรับนักศึกษา อาจารย์ ผู้จัดการ และสมาชิกทุกบทบาทใน POS</p></div>
      <form className="pos-password-form" onSubmit={submit}>
        <label>รหัสผ่านปัจจุบัน<input type="password" name="oldPassword" autoComplete="current-password" required /></label>
        <label>รหัสผ่านใหม่<input type="password" name="newPassword" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        <label>ยืนยันรหัสผ่านใหม่<input type="password" name="confirmPassword" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <p className="pos-password-help">อย่างน้อย 10 ตัวอักษร หลังเปลี่ยนสำเร็จ ระบบจะออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย กรุณาเข้าสู่ระบบด้วยรหัสใหม่</p>
        <button type="submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</button>
      </form>
      <a className="pos-password-back" href="/">กลับสู่ระบบ POS</a>
    </section>
  </main>;
}
