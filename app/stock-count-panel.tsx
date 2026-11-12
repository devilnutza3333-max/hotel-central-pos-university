"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  History,
  LoaderCircle,
  PackageCheck,
  Save,
  Scale,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type { InventoryItem } from "./management-panels";

export type StockCountStatus = "draft" | "submitted" | "approved";

export type StockCountSession = {
  id: string;
  serviceDate: string;
  status: StockCountStatus;
  note: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type StockCountLine = {
  id: string;
  sessionId: string;
  inventoryItemId: string;
  snapshotStock: number;
  countedStock: number | null;
  difference: number;
  reason: string;
  countedBy: string | null;
  countedByName: string | null;
  countedAt: string | null;
};

export type StockCountAction =
  | { action: "createDailyStockCount"; serviceDate: string }
  | { action: "saveStockCountLines"; sessionId: string; lines: Array<{ inventoryItemId: string; countedQuantity: number; reason: string }> }
  | { action: "submitDailyStockCount"; sessionId: string; note: string }
  | { action: "approveDailyStockCount"; sessionId: string };

type Props = {
  serviceDate: string;
  profileName: string;
  canApprove: boolean;
  inventory: InventoryItem[];
  sessions: StockCountSession[];
  lines: StockCountLine[];
  working: boolean;
  onAction: (body: StockCountAction) => Promise<boolean>;
};

const unitLabels: Record<InventoryItem["unit"], string> = { kg: "กก.", liter: "ลิตร", unit: "ชิ้น", pack: "แพ็ก" };
const quantity = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 }).format(value / 1000);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "—";
const statusLabels: Record<StockCountStatus, string> = { draft: "กำลังตรวจนับ", submitted: "รออนุมัติ", approved: "อนุมัติแล้ว" };

export default function StockCountPanel({ serviceDate, profileName, canApprove, inventory, sessions, lines, working, onAction }: Props) {
  const activeInventory = useMemo(() => inventory.filter((item) => item.active), [inventory]);
  const todaySession = sessions.find((session) => session.serviceDate === serviceDate) ?? null;
  const sessionLines = useMemo(() => todaySession ? lines.filter((line) => line.sessionId === todaySession.id) : [], [lines, todaySession]);
  const lineByItemId = useMemo(() => new Map(sessionLines.map((line) => [line.inventoryItemId, line])), [sessionLines]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const nextCounts: Record<string, string> = {};
    const nextReasons: Record<string, string> = {};
    for (const line of sessionLines) {
      if (line.countedStock !== null) nextCounts[line.inventoryItemId] = String(line.countedStock / 1000);
      nextReasons[line.inventoryItemId] = line.reason;
    }
    setCounts(nextCounts);
    setReasons(nextReasons);
    setNote(todaySession?.note ?? "");
    setMessage("");
  }, [sessionLines, todaySession?.id, todaySession?.note]);

  const previewRows = activeInventory.map((item) => {
    const line = lineByItemId.get(item.id);
    const snapshotStock = line?.snapshotStock ?? item.currentStock;
    const rawCount = counts[item.id];
    const countedStock = rawCount === undefined || rawCount === "" || !Number.isFinite(Number(rawCount)) ? null : Math.round(Number(rawCount) * 1000);
    const difference = countedStock === null ? null : countedStock - snapshotStock;
    return { item, line, snapshotStock, countedStock, difference, reason: reasons[item.id] ?? "" };
  });
  const allCounted = previewRows.length > 0 && previewRows.every((row) => row.countedStock !== null && row.countedStock >= 0);
  const differencesExplained = previewRows.every((row) => row.difference === null || row.difference === 0 || row.reason.trim().length >= 2);
  const differenceCount = previewRows.filter((row) => row.difference !== null && row.difference !== 0).length;
  const countedCount = previewRows.filter((row) => row.countedStock !== null).length;
  const editable = todaySession?.status === "draft";

  async function createSession() {
    setMessage("");
    if (await onAction({ action: "createDailyStockCount", serviceDate })) setMessage("สร้างรอบตรวจนับวันนี้แล้ว กรุณานับจากของจริงทีละรายการ");
  }

  function payloadLines() {
    return previewRows.map((row) => ({ inventoryItemId: row.item.id, countedQuantity: Number(counts[row.item.id]), reason: row.reason.trim() }));
  }

  async function save() {
    if (!todaySession || !allCounted || !differencesExplained) return;
    setMessage("");
    if (await onAction({ action: "saveStockCountLines", sessionId: todaySession.id, lines: payloadLines() })) setMessage("บันทึกยอดนับจริงและเหตุผลเรียบร้อยแล้ว");
  }

  async function submit() {
    if (!todaySession || !allCounted || !differencesExplained) return;
    setMessage("");
    if (!await onAction({ action: "saveStockCountLines", sessionId: todaySession.id, lines: payloadLines() })) return;
    if (await onAction({ action: "submitDailyStockCount", sessionId: todaySession.id, note: note.trim() })) setMessage("ส่งผลตรวจนับให้อาจารย์หรือผู้จัดการอนุมัติแล้ว");
  }

  async function approve() {
    if (!todaySession || todaySession.status !== "submitted") return;
    setMessage("");
    if (await onAction({ action: "approveDailyStockCount", sessionId: todaySession.id })) setMessage("อนุมัติผลตรวจนับและปรับยอดสต๊อกจริงเรียบร้อยแล้ว");
  }

  const history = sessions.slice().sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)).slice(0, 14);

  return <div className="stock-count-page">
    <section className="stock-count-hero">
      <span><ClipboardCheck/></span>
      <div><p className="eyebrow">DAILY PHYSICAL STOCK COUNT</p><h2>ตรวจนับสต๊อกประจำวัน</h2><p>เปรียบเทียบยอดในระบบกับของจริง บันทึกสาเหตุส่วนต่าง และให้ผู้ควบคุมอนุมัติก่อนปรับสต๊อก</p></div>
      <aside><CalendarDays/><div><b>{serviceDate}</b><small>ผู้ตรวจ: {profileName}</small></div></aside>
    </section>

    {message && <div className="stock-count-message"><CheckCircle2/><span>{message}</span><button type="button" onClick={() => setMessage("")}>×</button></div>}

    {!todaySession ? <section className="panel stock-count-empty">
      <Scale/><h3>ยังไม่มีรอบตรวจนับของวันนี้</h3><p>เมื่อเริ่ม ระบบจะถ่ายยอดสต๊อกปัจจุบันเป็นยอดอ้างอิง แล้วรอกรอกยอดที่นับได้จริง</p>
      <button className="primary" type="button" disabled={working || !activeInventory.length} onClick={() => void createSession()}>{working ? <LoaderCircle className="spin"/> : <ClipboardCheck/>} เริ่มตรวจนับสต๊อกวันนี้</button>
    </section> : <>
      <section className="stock-count-summary">
        <article><Boxes/><span>รายการทั้งหมด<b>{activeInventory.length}</b><small>วัตถุดิบที่เปิดใช้งาน</small></span></article>
        <article><PackageCheck/><span>นับแล้ว<b>{countedCount}</b><small>จาก {activeInventory.length} รายการ</small></span></article>
        <article className={differenceCount ? "warning" : "ok"}><AlertTriangle/><span>พบส่วนต่าง<b>{differenceCount}</b><small>{differenceCount ? "ต้องระบุสาเหตุ" : "ยอดตรงกับระบบ"}</small></span></article>
        <article className={`status-${todaySession.status}`}><ShieldCheck/><span>สถานะ<b>{statusLabels[todaySession.status]}</b><small>อัปเดต {dateTime(todaySession.updatedAt)}</small></span></article>
      </section>

      <section className="panel stock-count-sheet">
        <header><div><p className="eyebrow">COUNT SHEET</p><h3>ใบนับสต๊อกวันที่ {todaySession.serviceDate}</h3></div><span className={todaySession.status}>{statusLabels[todaySession.status]}</span></header>
        <div className="stock-count-table">
          <div className="stock-count-row stock-count-head"><b>วัตถุดิบ</b><b>ยอดระบบ</b><b>ยอดนับจริง</b><b>ส่วนต่าง</b><b>เหตุผล</b></div>
          {previewRows.map(({ item, snapshotStock, countedStock, difference, reason }) => <div className={`stock-count-row ${difference === null ? "uncounted" : difference === 0 ? "balanced" : "different"}`} key={item.id}>
            <span className="stock-count-item"><b>{item.name}</b><small>{item.sku} • {unitLabels[item.unit]}</small></span>
            <span className="stock-count-system"><small>ยอดระบบ</small><b>{quantity(snapshotStock)} {unitLabels[item.unit]}</b></span>
            <label><small>ยอดนับจริง</small><div><input type="number" min="0" step="0.001" inputMode="decimal" value={counts[item.id] ?? ""} disabled={!editable} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: event.target.value }))}/><em>{unitLabels[item.unit]}</em></div></label>
            <span className={`stock-count-difference ${difference === null ? "" : difference > 0 ? "positive" : difference < 0 ? "negative" : "zero"}`}><small>ส่วนต่าง</small><b>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${quantity(difference)}`}</b></span>
            <label className="stock-count-reason"><small>สาเหตุ{difference !== null && difference !== 0 ? " *" : ""}</small><input value={reason} maxLength={200} disabled={!editable} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={difference !== null && difference !== 0 ? "เช่น ของเสีย ตวงคลาดเคลื่อน" : "หมายเหตุ (ถ้ามี)"}/></label>
          </div>)}
        </div>
        <label className="stock-count-note"><span>หมายเหตุภาพรวม</span><textarea maxLength={500} value={note} disabled={!editable} onChange={(event) => setNote(event.target.value)} placeholder="บันทึกเหตุการณ์ ผู้ร่วมตรวจ หรือข้อสังเกตประจำวัน…"/></label>
        {editable && <footer><p>{!allCounted ? <><AlertTriangle/> กรุณานับวัตถุดิบให้ครบทุกชนิด</> : !differencesExplained ? <><AlertTriangle/> รายการที่มีส่วนต่างต้องระบุสาเหตุ</> : <><CheckCircle2/> พร้อมบันทึกและส่งอนุมัติ</>}</p><div><button type="button" disabled={working || !allCounted || !differencesExplained} onClick={() => void save()}><Save/> บันทึกร่าง</button><button className="primary" type="button" disabled={working || !allCounted || !differencesExplained} onClick={() => void submit()}>{working ? <LoaderCircle className="spin"/> : <Send/>} ส่งอนุมัติ</button></div></footer>}
        {todaySession.status === "submitted" && <footer className="stock-count-approval"><p><UserRoundCheck/> ส่งโดย {todaySession.submittedByName ?? "ผู้ตรวจนับ"} • {dateTime(todaySession.submittedAt)}</p>{canApprove ? <button className="primary" type="button" disabled={working} onClick={() => void approve()}>{working ? <LoaderCircle className="spin"/> : <BadgeCheck/>} อนุมัติและปรับสต๊อกจริง</button> : <b>รออาจารย์หรือผู้จัดการอนุมัติ</b>}</footer>}
        {todaySession.status === "approved" && <footer className="stock-count-approved"><BadgeCheck/><p><b>อนุมัติและปรับสต๊อกแล้ว</b><small>{todaySession.approvedByName ?? "ผู้อนุมัติ"} • {dateTime(todaySession.approvedAt)}</small></p></footer>}
      </section>
    </>}

    <section className="panel stock-count-history">
      <div className="panel-title"><div><p className="eyebrow">COUNT HISTORY</p><h3>ประวัติการตรวจนับ</h3></div><History/></div>
      <div>{history.map((session) => {
        const rows = lines.filter((line) => line.sessionId === session.id && line.countedStock !== null);
        const differences = rows.filter((line) => line.difference !== 0).length;
        return <article key={session.id}><span className={session.status}>{session.status === "approved" ? <BadgeCheck/> : session.status === "submitted" ? <Send/> : <ClipboardCheck/>}</span><p><b>{session.serviceDate} • {statusLabels[session.status]}</b><small>นับ {rows.length} รายการ • ส่วนต่าง {differences} รายการ • ผู้ตรวจ {session.createdByName}</small></p><em>{session.approvedAt ? `${session.approvedByName ?? "ผู้อนุมัติ"} • ${dateTime(session.approvedAt)}` : dateTime(session.updatedAt)}</em></article>;
      })}{!history.length && <div className="stock-count-history-empty"><ClipboardCheck/><b>ยังไม่มีประวัติการตรวจนับ</b></div>}</div>
    </section>
  </div>;
}
