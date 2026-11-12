"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  Clock3,
  Coffee,
  DatabaseBackup,
  History,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  PrinterCheck,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-react";

export type OpeningClosingRunType = "opening" | "closing";
export type OpeningClosingCheck = {
  key: string;
  label: string;
  detail: string;
  required: boolean;
  completed: boolean;
};
export type OpeningClosingRun = {
  id: string;
  serviceDate: string;
  runType: OpeningClosingRunType;
  status: "completed";
  checks: OpeningClosingCheck[];
  note: string;
  approvedBy: string;
  approvedByName: string;
  approvedAt: string;
  createdAt: string;
};
export type OpeningClosingIndicators = {
  staffCheckedIn: number;
  kitchenAssigned: boolean;
  barAssigned: boolean;
  activeInventoryItems: number;
  lowStockItems: number;
  cashShiftOpen: boolean;
  printerQueueFailures: number;
  openOrders: number;
  pendingProductionItems: number;
  unresolvedServiceRequests: number;
  lastBackupAt: string | null;
};

type ActionHandler = (body: Record<string, unknown>) => Promise<boolean>;

const openingDefinitions = [
  { key: "staff", label: "พนักงานพร้อมประจำจุด", detail: "ตรวจรายชื่อ ลงเวลา และผู้รับผิดชอบแต่ละแผนก", icon: UsersRound },
  { key: "kitchen", label: "ครัวพร้อมรับงาน", detail: "ผู้ปฏิบัติงานครัว อุปกรณ์ และจอคิวพร้อมใช้งาน", icon: ChefHat },
  { key: "bar", label: "บาร์เครื่องดื่มพร้อม", detail: "ผู้ปฏิบัติงาน วัตถุดิบ และจอบาร์พร้อมใช้งาน", icon: Coffee },
  { key: "stock", label: "สต๊อกพร้อมขาย", detail: "ตรวจของขาด ของต่ำกว่าจุดสั่งซื้อ และรายการติดลบ", icon: PackageCheck },
  { key: "cash", label: "เงินทอนและกะเงินสด", detail: "นับเงินทอนและเปิดกะแคชเชียร์ก่อนรับชำระ", icon: Banknote },
  { key: "printer", label: "เครื่องพิมพ์พร้อม", detail: "ทดสอบใบครัว ใบบาร์ และใบเสร็จ รวมถึงกระดาษ", icon: PrinterCheck },
] as const;

const closingDefinitions = [
  { key: "sales", label: "ตรวจยอดขายและเงินสด", detail: "ยอดรับชำระ เงินในลิ้นชัก และผลต่างต้องมีผู้ตรวจ", icon: Banknote },
  { key: "pending", label: "ไม่มีงานบริการค้าง", detail: "ตรวจออเดอร์ ครัว บาร์ เรียกพนักงาน และคิดเงิน", icon: ClipboardCheck },
  { key: "stock", label: "ตรวจสต๊อกปลายวัน", detail: "บันทึกของเสีย ของหมด และยอดวัตถุดิบสำคัญ", icon: PackageCheck },
  { key: "backup", label: "สำรองข้อมูลแล้ว", detail: "ตรวจ D1 Time Travel และดาวน์โหลดไฟล์สำรองเก็บภายนอก", icon: DatabaseBackup },
  { key: "cash", label: "ปิดกะเงินสดแล้ว", detail: "บันทึกยอดจริง ผลต่าง หมายเหตุ และผู้อนุมัติ", icon: LockKeyhole },
  { key: "printer", label: "เคลียร์คิวเครื่องพิมพ์", detail: "ไม่มีงานพิมพ์ล้มเหลวหรือเอกสารที่ต้องพิมพ์ซ้ำ", icon: PrinterCheck },
] as const;

const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));

function initialChecks(type: OpeningClosingRunType): OpeningClosingCheck[] {
  return (type === "opening" ? openingDefinitions : closingDefinitions).map(({ key, label, detail }) => ({ key, label, detail, required: true, completed: false }));
}

function suggestedChecks(type: OpeningClosingRunType, indicators: OpeningClosingIndicators): Record<string, boolean> {
  if (type === "opening") return {
    staff: indicators.staffCheckedIn > 0,
    kitchen: indicators.kitchenAssigned,
    bar: indicators.barAssigned,
    stock: indicators.activeInventoryItems > 0 && indicators.lowStockItems === 0,
    cash: indicators.cashShiftOpen,
    printer: indicators.printerQueueFailures === 0,
  };
  return {
    sales: !indicators.cashShiftOpen,
    pending: indicators.openOrders === 0 && indicators.pendingProductionItems === 0 && indicators.unresolvedServiceRequests === 0,
    stock: indicators.lowStockItems === 0,
    backup: Boolean(indicators.lastBackupAt),
    cash: !indicators.cashShiftOpen,
    printer: indicators.printerQueueFailures === 0,
  };
}

export default function OpeningClosingPanel({
  profileName,
  serviceDate,
  runs,
  indicators,
  working,
  onAction,
}: {
  profileName: string;
  serviceDate: string;
  runs: OpeningClosingRun[];
  indicators: OpeningClosingIndicators;
  working: boolean;
  onAction: ActionHandler;
}) {
  const [mode, setMode] = useState<OpeningClosingRunType>("opening");
  const [checks, setChecks] = useState<OpeningClosingCheck[]>(() => initialChecks("opening"));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const todayRuns = useMemo(() => runs.filter((run) => run.serviceDate === serviceDate), [runs, serviceDate]);
  const openingRun = todayRuns.find((run) => run.runType === "opening");
  const closingRun = todayRuns.find((run) => run.runType === "closing");
  const currentRun = mode === "opening" ? openingRun : closingRun;
  const requiredComplete = checks.filter((check) => check.required).every((check) => check.completed);
  const completeCount = checks.filter((check) => check.completed).length;

  useEffect(() => {
    const saved = mode === "opening" ? openingRun : closingRun;
    if (saved) {
      setChecks(saved.checks);
      setNote(saved.note);
      return;
    }
    const suggested = suggestedChecks(mode, indicators);
    setChecks(initialChecks(mode).map((check) => ({ ...check, completed: Boolean(suggested[check.key]) })));
    setNote("");
  }, [closingRun, indicators, mode, openingRun]);

  function toggle(key: string) {
    if (currentRun) return;
    setChecks((rows) => rows.map((row) => row.key === key ? { ...row, completed: !row.completed } : row));
  }

  async function submit() {
    setMessage("");
    if (!requiredComplete || currentRun) return;
    const action = mode === "opening" ? "completeOpeningChecklist" : "completeClosingChecklist";
    if (await onAction({ action, serviceDate, checks, note })) {
      setMessage(mode === "opening" ? "อนุมัติเปิดร้านเรียบร้อยแล้ว" : "อนุมัติปิดร้านและบันทึกผลเรียบร้อยแล้ว");
    }
  }

  const definitions = mode === "opening" ? openingDefinitions : closingDefinitions;
  const history = runs.slice().sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime()).slice(0, 12);

  return <div className="content opening-workspace">
    <section className="opening-hero">
      <span><Store/></span>
      <div><p className="eyebrow">DAILY OPEN & CLOSE CONTROL</p><h2>เช็กลิสต์เปิด–ปิดร้านประจำวัน</h2><p>ยืนยันคน อุปกรณ์ สต๊อก เงิน และข้อมูลก่อนเริ่มงานและก่อนจบวัน</p></div>
      <aside><b>{serviceDate}</b><small>ผู้ควบคุม: {profileName}</small></aside>
    </section>

    {message && <p className="opening-message"><CheckCircle2/> {message}</p>}

    <section className="opening-status-grid">
      <article className={openingRun ? "completed" : "pending"}><span>{openingRun ? <CheckCircle2/> : <Clock3/>}</span><div><small>OPENING</small><h3>{openingRun ? "เปิดร้านแล้ว" : "รอตรวจเปิดร้าน"}</h3><p>{openingRun ? `${dateTime(openingRun.approvedAt)} • ${openingRun.approvedByName}` : "ต้องผ่านรายการบังคับทั้งหมด"}</p></div></article>
      <article className={closingRun ? "completed" : "pending"}><span>{closingRun ? <CheckCircle2/> : <Clock3/>}</span><div><small>CLOSING</small><h3>{closingRun ? "ปิดร้านแล้ว" : "ยังไม่ปิดร้าน"}</h3><p>{closingRun ? `${dateTime(closingRun.approvedAt)} • ${closingRun.approvedByName}` : "ตรวจยอด งานค้าง และการสำรองเมื่อสิ้นวัน"}</p></div></article>
    </section>

    <section className="panel opening-checklist-panel">
      <header>
        <div className="opening-mode-switch"><button className={mode === "opening" ? "active" : ""} onClick={() => setMode("opening")}><Store/> เปิดร้าน</button><button className={mode === "closing" ? "active" : ""} onClick={() => setMode("closing")}><LockKeyhole/> ปิดร้าน</button></div>
        <p><b>{completeCount}/{checks.length}</b> รายการพร้อม</p>
      </header>
      <div className="opening-check-grid">{definitions.map(({ key, icon: Icon }) => { const check = checks.find((row) => row.key === key)!; return <button type="button" className={check.completed ? "completed" : ""} onClick={() => toggle(key)} disabled={Boolean(currentRun)} key={key}><span>{check.completed ? <CheckCircle2/> : <Icon/>}</span><div><h3>{check.label}</h3><p>{check.detail}</p></div><b>{check.completed ? "พร้อม" : "รอตรวจ"}</b></button>; })}</div>
      <label className="opening-note"><span>หมายเหตุประจำวัน</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={Boolean(currentRun)} placeholder="บันทึกข้อสังเกต ผลต่างเงินสด อุปกรณ์ หรือผู้รับผิดชอบ…"/></label>
      <footer>
        <p>{currentRun ? <><BadgeCheck/> บันทึกและล็อกแล้วโดย {currentRun.approvedByName}</> : requiredComplete ? <><ShieldCheck/> พร้อมให้อาจารย์หรือผู้จัดการอนุมัติ</> : <><AlertTriangle/> กรุณาตรวจรายการบังคับให้ครบก่อนอนุมัติ</>}</p>
        <button className="primary" disabled={working || !requiredComplete || Boolean(currentRun)} onClick={() => void submit()}>{working ? <LoaderCircle className="spin"/> : <ShieldCheck/>} {mode === "opening" ? "อนุมัติเปิดร้าน" : "อนุมัติปิดร้าน"}</button>
      </footer>
    </section>

    <section className="panel opening-history">
      <div className="panel-title"><div><p className="eyebrow">CONTROL HISTORY</p><h3>ประวัติเปิด–ปิดร้าน</h3></div><History/></div>
      <div>{history.map((run) => <article key={run.id}><span className={run.runType}><BadgeCheck/></span><p><b>{run.runType === "opening" ? "เปิดร้าน" : "ปิดร้าน"} • {run.serviceDate}</b><small>{run.checks.filter((check) => check.completed).length}/{run.checks.length} รายการ • {run.approvedByName} • {dateTime(run.approvedAt)}</small></p>{run.note && <em>{run.note}</em>}</article>)}{!history.length && <div className="opening-empty"><ClipboardCheck/><b>ยังไม่มีประวัติเปิด–ปิดร้าน</b></div>}</div>
    </section>
  </div>;
}
