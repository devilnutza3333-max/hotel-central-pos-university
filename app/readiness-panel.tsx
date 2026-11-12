"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, ClipboardCheck, CloudDownload, DatabaseBackup, Download, FileWarning, History, LoaderCircle, Network, PlayCircle, RefreshCw, ShieldCheck, WifiOff, XCircle } from "lucide-react";

export type ReadinessCheck = { id: string; category: string; label: string; status: "pass" | "warning" | "fail"; detail: string };
export type ReadinessRun = { id: string; status: "pass" | "warning" | "fail"; score: number; checks: ReadinessCheck[]; actorId: string; actorName: string; createdAt: string };
export type ReadinessAuditEntry = { id: string; action: string; detail: string; actorName: string; createdAt: string };
type ReadinessAction = (body: Record<string, unknown>) => Promise<boolean>;

const workflowStages = [
  ["1", "รับลูกค้า", "Walk-in / จองโต๊ะ / คิวรอ / เปิดโต๊ะ"],
  ["2", "สั่งอาหาร", "เพิ่มรายการ ตรวจจำนวน และส่งเข้าครัว"],
  ["3", "ครัวและบาร์", "แยกแผนก รับงาน และเปลี่ยนสถานะ"],
  ["4", "เสิร์ฟ", "แจ้งพร้อมเสิร์ฟและยืนยันถึงโต๊ะ"],
  ["5", "ชำระเงิน", "รับเงินสด พิมพ์ใบเสร็จพร้อม QR"],
  ["6", "ตรวจย้อนหลัง", "ออเดอร์ สต๊อก การเงิน และผู้ดำเนินการ"],
];

export default function ReadinessPanel({ runs, logs, working, onAction }: { runs: ReadinessRun[]; logs: ReadinessAuditEntry[]; working: boolean; onAction: ReadinessAction }) {
  const [online, setOnline] = useState(true);
  const [networkTest, setNetworkTest] = useState<"idle" | "testing" | "pass" | "fail">("idle");
  const [message, setMessage] = useState("");
  const latest = runs[0] ?? null;
  const totals = useMemo(() => ({ pass: latest?.checks.filter((check) => check.status === "pass").length ?? 0, warning: latest?.checks.filter((check) => check.status === "warning").length ?? 0, fail: latest?.checks.filter((check) => check.status === "fail").length ?? 0 }), [latest]);
  const recentErrors = useMemo(() => logs.filter((log) => ["ACTION_FAILED", "AUTO_PRINT_FAILED"].includes(log.action)).slice(0, 20), [logs]);
  const lastBackup = useMemo(() => logs.find((log) => log.action === "EXPORT_BACKUP") ?? null, [logs]);
  const lastNetworkDrill = useMemo(() => logs.find((log) => log.action === "NETWORK_RECOVERY_TEST") ?? null, [logs]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  async function runCheck() {
    setMessage("");
    if (await onAction({ action: "runReadinessCheck" })) setMessage("ตรวจระบบและบันทึกผลเรียบร้อยแล้ว");
  }

  async function repairLegacyData() {
    setMessage("");
    if (await onAction({ action: "repairReadinessLegacyData" })) setMessage("ปรับสถานะงานเก่าที่ปิดแล้ว และกำหนดจุดเริ่มตรวจข้อมูลรุ่นใหม่เรียบร้อย");
  }

  async function testNetworkRecovery() {
    setNetworkTest("testing");
    const startedAt = performance.now();
    try {
      try { await Promise.reject(new TypeError("simulated offline")); } catch (error) { if (!(error instanceof TypeError)) throw error; }
      const response = await fetch(`/api/pos?scope=tables&probe=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("recovery failed");
      const latencyMs = Math.round(performance.now() - startedAt);
      if (!await onAction({ action: "recordRecoveryDrill", latencyMs })) throw new Error("record failed");
      setNetworkTest("pass");
      setMessage(`จำลองการรับมือเน็ตหลุดและเชื่อมต่อกลับสำเร็จใน ${latencyMs.toLocaleString("th-TH")} ms (ไม่มีข้อมูลจริงถูกแก้ไข)`);
    } catch {
      setNetworkTest("fail");
      setMessage("การเชื่อมต่อกลับไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
    }
  }

  function exportIncidentReport() {
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["วันเวลา", "ผู้ดำเนินการ", "รหัสเหตุการณ์", "รายละเอียด"],
      ...recentErrors.map((entry) => [new Date(entry.createdAt).toLocaleString("th-TH"), entry.actorName, entry.action, entry.detail]),
    ];
    const blob = new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pos-incident-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="content readiness-page">
    <section className="readiness-hero">
      <div><p className="eyebrow">GO-LIVE READINESS • SAFE DRY RUN</p><h2>ตรวจความพร้อมก่อนเปิดร้านจริง</h2><p>ตรวจเส้นทางบริการ ข้อมูลตกหล่น งานซ้ำ เครือข่าย การสำรอง และประวัติผู้ดำเนินการ โดยไม่สร้างยอดขายทดสอบ</p></div>
      <div className="readiness-hero-actions"><button className="secondary" disabled={working} onClick={() => void repairLegacyData()}><RefreshCw/> จัดระเบียบข้อมูลรุ่นเก่า</button><button className="primary" disabled={working} onClick={() => void runCheck()}>{working ? <LoaderCircle className="spin"/> : <PlayCircle/>} เริ่มตรวจระบบทั้งหมด</button></div>
    </section>
    {message && <div className="notice readiness-notice"><CheckCircle2/>{message}<button onClick={() => setMessage("")}>×</button></div>}

    <section className="readiness-top-grid">
      <article className={`readiness-score ${latest?.status ?? "empty"}`}>
        <div className="score-ring"><strong>{latest?.score ?? 0}</strong><small>%</small></div>
        <div><p className="eyebrow">LATEST RESULT</p><h3>{!latest ? "ยังไม่ได้ตรวจ" : latest.status === "pass" ? "พร้อมเปิดใช้งาน" : latest.status === "warning" ? "พร้อมแบบมีข้อควรตรวจ" : "พบจุดที่ต้องแก้ก่อนเปิด"}</h3><p>{latest ? `${new Date(latest.createdAt).toLocaleString("th-TH")} • ${latest.actorName}` : "กดเริ่มตรวจเพื่อสร้างผลครั้งแรก"}</p></div>
        {latest && <aside><span className="pass">ผ่าน {totals.pass}</span><span className="warning">เตือน {totals.warning}</span><span className="fail">ไม่ผ่าน {totals.fail}</span></aside>}
      </article>
      <article className="readiness-network-card">
        <span className={online ? "online" : "offline"}>{online ? <Network/> : <WifiOff/>}</span>
        <div><p className="eyebrow">NETWORK RECOVERY</p><h3>{online ? "เชื่อมต่อระบบกลาง" : "ออฟไลน์"}</h3><p>จำลองตัวจัดการเมื่อเน็ตหลุด แล้วตรวจการเชื่อมต่อกลับ โดยไม่แก้ข้อมูลจริง{lastNetworkDrill ? ` • ล่าสุด ${new Date(lastNetworkDrill.createdAt).toLocaleString("th-TH")}` : ""}</p></div>
        <button disabled={networkTest === "testing"} onClick={() => void testNetworkRecovery()}>{networkTest === "testing" ? <LoaderCircle className="spin"/> : networkTest === "pass" ? <CheckCircle2/> : <RefreshCw/>} ทดสอบเน็ตหลุด</button>
      </article>
    </section>

    <section className="panel readiness-workflow">
      <div className="panel-title"><div><p className="eyebrow">SERVICE JOURNEY</p><h3>เส้นทางทดสอบตั้งแต่รับลูกค้าถึงชำระเงิน</h3></div><ClipboardCheck/></div>
      <div className="readiness-flow">{workflowStages.map(([number, label, detail], index) => <article key={number}><b>{number}</b><div><h4>{label}</h4><p>{detail}</p></div>{index < workflowStages.length - 1 && <i/>}</article>)}</div>
    </section>

    <section className="readiness-results-grid">
      <article className="panel readiness-checks">
        <div className="panel-title"><div><p className="eyebrow">AUTOMATED CHECKS</p><h3>ผลตรวจล่าสุด</h3></div><ShieldCheck/></div>
        <div>{latest?.checks.map((check) => <article className={check.status} key={check.id}><span>{check.status === "pass" ? <CheckCircle2/> : check.status === "warning" ? <AlertTriangle/> : <XCircle/>}</span><div><small>{check.category}</small><h4>{check.label}</h4><p>{check.detail}</p></div><b>{check.status === "pass" ? "ผ่าน" : check.status === "warning" ? "ตรวจเพิ่ม" : "ไม่ผ่าน"}</b></article>)}{!latest && <div className="wide-empty"><ClipboardCheck/><h3>ยังไม่มีผลตรวจ</h3><p>กด “เริ่มตรวจระบบทั้งหมด” ระบบจะตรวจข้อมูลโดยไม่สร้างออเดอร์ทดสอบปะปนกับยอดจริง</p></div>}</div>
      </article>

      <aside className="readiness-side-stack">
        <article className="panel readiness-backup-card"><div className="panel-title"><div><p className="eyebrow">DATA PROTECTION</p><h3>สำรองข้อมูล</h3></div><DatabaseBackup/></div><p><BadgeCheck/> Cloudflare D1 Time Travel สำรองฐานข้อมูลอัตโนมัติ{lastBackup ? ` • ดาวน์โหลดเก็บภายนอกล่าสุด ${new Date(lastBackup.createdAt).toLocaleString("th-TH")}` : " • ยังไม่เคยดาวน์โหลดเก็บภายนอก"}</p><a href="/api/backup"><CloudDownload/> ดาวน์โหลดไฟล์สำรองตอนนี้</a></article>
        <article className="panel readiness-incidents"><div className="panel-title"><div><p className="eyebrow">INCIDENT REPORT</p><h3>ข้อผิดพลาดล่าสุด</h3></div><FileWarning/></div><div>{recentErrors.slice(0, 5).map((entry) => <article key={entry.id}><span><AlertTriangle/></span><p><b>{entry.detail}</b><small>{new Date(entry.createdAt).toLocaleString("th-TH")} • {entry.actorName}</small></p></article>)}{!recentErrors.length && <div className="readiness-no-incidents"><CheckCircle2/><span><b>ไม่พบเหตุขัดข้อง</b><small>จากประวัติที่โหลดล่าสุด</small></span></div>}</div><button disabled={!recentErrors.length} onClick={exportIncidentReport}><Download/> ดาวน์โหลดรายงาน CSV</button></article>
        <article className="panel readiness-history"><div className="panel-title"><div><p className="eyebrow">TEST HISTORY</p><h3>ประวัติการตรวจ</h3></div><History/></div><div>{runs.slice(0, 10).map((run) => <article key={run.id}><span className={run.status}>{run.status === "pass" ? <CheckCircle2/> : run.status === "warning" ? <AlertTriangle/> : <XCircle/>}</span><p><b>{run.score}% • {run.actorName}</b><small>{new Date(run.createdAt).toLocaleString("th-TH")}</small></p></article>)}{!runs.length && <small>ยังไม่มีประวัติ</small>}</div></article>
      </aside>
    </section>
  </div>;
}
