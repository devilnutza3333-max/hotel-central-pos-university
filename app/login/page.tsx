"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, LockKeyhole, UserRound } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      const requested = new URLSearchParams(window.location.search).get("return_to") ?? "/";
      window.location.assign(requested.startsWith("/") && !requested.startsWith("//") ? requested : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">H</span><div><b>Hotel Central POS</b><small>UNIVERSITY TRAINING SYSTEM</small></div></div>
        <div className="login-copy"><span><LockKeyhole size={18}/></span><h1>เข้าสู่ระบบร้านอาหาร</h1><p>ใช้งานได้ทั้งโทรศัพท์นักศึกษาและคอมพิวเตอร์อาจารย์</p></div>
        <form onSubmit={submit}>
          <label><span>ชื่อผู้ใช้</span><div><UserRound size={18}/><input autoCapitalize="none" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></div></label>
          <label><span>รหัสผ่าน</span><div><LockKeyhole size={18}/><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div></label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={working}>{working ? <><LoaderCircle className="spin" size={18}/> กำลังตรวจสอบ…</> : "เข้าสู่ระบบ"}</button>
        </form>
        <footer>ระบบส่วนกลางสำหรับโรงแรมมหาวิทยาลัย • การเชื่อมต่อเข้ารหัสด้วย HTTPS</footer>
      </section>
    </main>
  );
}
