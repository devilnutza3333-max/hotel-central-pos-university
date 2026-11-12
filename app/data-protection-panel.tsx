"use client";

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { CloudCog, DatabaseBackup, Download, FileJson, RotateCcw, ShieldCheck, Upload } from "lucide-react";

type BackupSummary = {
  timeTravel: { enabled: boolean; retentionDays: number; provider: string };
  manualExport: boolean;
  restoreAllowed: boolean;
  excludes: string[];
};

function downloadName(response: Response) {
  const header = response.headers.get("content-disposition") ?? "";
  return header.match(/filename=([^;]+)/i)?.[1]?.replaceAll('"', "") ?? `hotel-central-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export default function DataProtectionPanel({ instructor }: { instructor: boolean }) {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLastBackup(window.localStorage.getItem("pbru-pos-last-backup"));
    fetch("/api/backup?mode=summary", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as BackupSummary & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "โหลดสถานะการสำรองไม่สำเร็จ");
        setSummary(payload);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "โหลดสถานะการสำรองไม่สำเร็จ"));
  }, []);

  async function exportBackup() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "สร้างไฟล์สำรองไม่สำเร็จ");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName(response);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      window.localStorage.setItem("pbru-pos-last-backup", now);
      setLastBackup(now);
      setMessage(`ดาวน์โหลดไฟล์สำรองแล้ว • ${new Date(now).toLocaleString("th-TH")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "สร้างไฟล์สำรองไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setConfirmation(""); setError(""); setMessage("");
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("ไฟล์สำรองต้องมีขนาดไม่เกิน 25 MB");
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, backup }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; restoredRows?: number };
      if (!response.ok) throw new Error(payload.error ?? "กู้คืนข้อมูลไม่สำเร็จ");
      setMessage(`กู้คืนข้อมูลสำเร็จ ${Number(payload.restoredRows ?? 0).toLocaleString("th-TH")} รายการ กำลังโหลดระบบใหม่…`);
      window.setTimeout(() => window.location.reload(), 1600);
    } catch (cause) {
      setError(cause instanceof SyntaxError ? "ไฟล์ที่เลือกไม่ใช่ไฟล์สำรอง JSON ที่ถูกต้อง" : cause instanceof Error ? cause.message : "กู้คืนข้อมูลไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return <section className="data-protection">
    <article className="panel protection-overview">
      <div className="panel-title"><div><p className="eyebrow">DATA PROTECTION</p><h3><ShieldCheck/> การสำรองและกู้คืนข้อมูล</h3></div><span className="protection-ok"><i/> ป้องกันอยู่</span></div>
      <div className="protection-grid">
        <div><span><CloudCog/></span><p><b>สำรองอัตโนมัติโดย Cloudflare</b><small>D1 Time Travel เปิดตลอดเวลา ย้อนกลับได้สูงสุด {summary?.timeTravel.retentionDays ?? 7} วันบนแผน Free แม้ปิดหน้า POS</small></p></div>
        <div><span><DatabaseBackup/></span><p><b>ไฟล์สำรองของร้าน</b><small>{lastBackup ? `ดาวน์โหลดล่าสุด ${new Date(lastBackup).toLocaleString("th-TH")}` : "ยังไม่มีประวัติการดาวน์โหลดบนอุปกรณ์นี้"}</small></p></div>
      </div>
      <div className="backup-warning"><FileJson/><p><b>ไฟล์มีข้อมูลการขายและข้อมูลติดต่อเดลิเวอรี</b><small>เก็บไว้ในพื้นที่ปลอดภัย ไฟล์นี้ไม่รวมรหัสผ่านและเซสชันเข้าสู่ระบบ</small></p></div>
      <button className="primary backup-download" disabled={busy} onClick={() => void exportBackup()}><Download/> ดาวน์โหลดไฟล์สำรองตอนนี้</button>
    </article>
    {instructor && <form className="panel restore-panel" onSubmit={restore}>
      <div className="panel-title"><div><p className="eyebrow">EMERGENCY RESTORE</p><h3><RotateCcw/> กู้คืนจากไฟล์สำรอง</h3></div></div>
      <p className="restore-danger">ข้อมูลเมนู ออเดอร์ สต๊อก การเงิน และเดลิเวอรีในระบบปัจจุบันจะถูกแทนที่ กรุณาดาวน์โหลดไฟล์สำรองปัจจุบันก่อนทุกครั้ง</p>
      <input ref={fileInput} type="file" accept="application/json,.json" onChange={chooseFile} hidden/>
      <button type="button" className="backup-file-picker" onClick={() => fileInput.current?.click()}><Upload/><span><b>{file?.name ?? "เลือกไฟล์สำรอง .json"}</b><small>{file ? `${(file.size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB` : "ไฟล์จากปุ่มดาวน์โหลดด้านบนเท่านั้น"}</small></span></button>
      <label><span>พิมพ์คำว่า “กู้คืนข้อมูล” เพื่อยืนยัน</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="กู้คืนข้อมูล" autoComplete="off"/></label>
      <button className="danger restore-button" disabled={busy || !file || confirmation !== "กู้คืนข้อมูล"}><RotateCcw/> ยืนยันกู้คืนข้อมูล</button>
    </form>}
    {(message || error) && <div className={`backup-result ${error ? "error" : "success"}`}>{message || error}</div>}
  </section>;
}
