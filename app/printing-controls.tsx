"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, Power, Printer, RefreshCw, RotateCcw, Settings2, X } from "lucide-react";

export type PrintJob = {
  id: string;
  orderId: string;
  documentType: "kitchen" | "receipt";
  department: string;
  copyNumber: number;
  printedBy: string;
  printedByName: string;
  printedAt: string;
  reprintReason: string;
};

export type PrinterSettings = {
  paperWidth: 58 | 80;
  categoryDepartments: Record<string, string>;
};

export type PrintQueueJob = {
  id: string;
  orderId: string;
  department: string;
  itemIds: string[];
  status: "pending" | "processing" | "printed" | "failed";
  attempts: number;
  lastError: string;
  createdBy: string;
  handledBy: string | null;
  handledByName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type PrintOrder = { id: string; orderNumber: string; tableId: number; openedAt: string };
type PrintItem = { id: string; orderId: string; menuItemId: number; name: string; optionSummary: string; note: string; quantity: number; status: string };
type PrintMenuItem = { id: number; category: string };

export const printerDepartments = ["ครัวร้อน", "บาร์เครื่องดื่ม", "ของหวาน"];

export function defaultDepartment(category: string) {
  const normalized = category.toLowerCase();
  if (["เครื่องดื่ม", "กาแฟ", "ชา", "น้ำ", "drink", "coffee", "beverage"].some((word) => normalized.includes(word))) return "บาร์เครื่องดื่ม";
  if (["ของหวาน", "เบเกอรี่", "เค้ก", "dessert", "bakery"].some((word) => normalized.includes(word))) return "ของหวาน";
  return "ครัวร้อน";
}

const printDateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

const queueStatusLabels: Record<PrintQueueJob["status"], string> = {
  pending: "รอพิมพ์",
  processing: "กำลังพิมพ์",
  printed: "ส่งพิมพ์แล้ว",
  failed: "พิมพ์ไม่สำเร็จ",
};

export function AutoPrintQueuePanel({ jobs, orders, items, settings, onAction, departmentFilter, preferenceKey = "hotel-central-auto-print", title = "คิวพิมพ์ใบครัวอัตโนมัติ", stationLabel = "หน้าจอครัว" }: {
  jobs: PrintQueueJob[];
  orders: PrintOrder[];
  items: PrintItem[];
  settings: PrinterSettings;
  onAction: (body: Record<string, unknown>) => Promise<{ queueJob?: PrintQueueJob; skipped?: boolean } | null>;
  departmentFilter?: string[];
  preferenceKey?: string;
  title?: string;
  stationLabel?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [activeJob, setActiveJob] = useState<PrintQueueJob | null>(null);
  const [message, setMessage] = useState("");
  const claimingRef = useRef(false);
  const visibleJobs = useMemo(() => departmentFilter?.length ? jobs.filter((job) => departmentFilter.includes(job.department)) : jobs, [departmentFilter, jobs]);

  useEffect(() => {
    setEnabled(window.localStorage.getItem(preferenceKey) === "on");
  }, [preferenceKey]);

  function setPreference(next: boolean) {
    window.localStorage.setItem(preferenceKey, next ? "on" : "off");
    setEnabled(next);
    setMessage(next ? "เปิดรับคิวพิมพ์อัตโนมัติบนเครื่องนี้แล้ว" : "หยุดรับคิวพิมพ์อัตโนมัติบนเครื่องนี้แล้ว");
  }

  useEffect(() => {
    if (!enabled || activeJob || claimingRef.current || document.hidden) return;
    const next = [...visibleJobs].reverse().find((job) => job.status === "pending");
    if (!next) return;
    claimingRef.current = true;
    void onAction({ action: "claimPrintQueueJob", jobId: next.id }).then((result) => {
      if (result?.queueJob) setActiveJob(result.queueJob);
    }).finally(() => { claimingRef.current = false; });
  }, [activeJob, enabled, onAction, visibleJobs]);

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    const previousTitle = document.title;
    document.body.classList.add("auto-print-open");
    document.title = `auto-kitchen-${activeJob.department}`;
    const run = async () => {
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (cancelled) return;
        window.print();
        if (cancelled) return;
        await onAction({ action: "completePrintQueueJob", jobId: activeJob.id });
        setMessage(`ส่งใบครัว ${activeJob.department} ไปยังเครื่องพิมพ์แล้ว`);
      } catch (error) {
        await onAction({ action: "failPrintQueueJob", jobId: activeJob.id, error: error instanceof Error ? error.message : "เปิดหน้าต่างพิมพ์ไม่สำเร็จ" });
        setMessage("พิมพ์ไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติสูงสุด 3 ครั้ง");
      } finally {
        document.body.classList.remove("auto-print-open");
        document.title = previousTitle;
        if (!cancelled) setActiveJob(null);
      }
    };
    void run();
    return () => { cancelled = true; document.body.classList.remove("auto-print-open"); document.title = previousTitle; };
  }, [activeJob, onAction]);

  const activeOrder = activeJob ? orders.find((order) => order.id === activeJob.orderId) : null;
  const activeItems = activeJob ? items.filter((item) => activeJob.itemIds.includes(item.id)) : [];
  const counts = visibleJobs.reduce((result, job) => ({ ...result, [job.status]: (result[job.status] ?? 0) + 1 }), {} as Record<string, number>);

  return <section className={`panel auto-print-panel ${enabled ? "enabled" : ""}`}>
    <header><div className="auto-print-heading"><span><Printer/></span><div><b>{title}</b><small>{enabled ? "เครื่องนี้กำลังรอรับงานจากระบบกลาง" : "ปิดอยู่บนอุปกรณ์นี้"}</small></div></div><button type="button" className={enabled ? "stop" : "start"} onClick={() => setPreference(!enabled)}><Power/> {enabled ? "หยุดอัตโนมัติ" : "เปิดพิมพ์อัตโนมัติ"}</button></header>
    <div className="auto-print-stats"><span><Clock3/> รอพิมพ์ <b>{counts.pending ?? 0}</b></span><span><LoaderCircle/> กำลังพิมพ์ <b>{counts.processing ?? 0}</b></span><span><CheckCircle2/> สำเร็จ <b>{counts.printed ?? 0}</b></span><span><AlertTriangle/> ล้มเหลว <b>{counts.failed ?? 0}</b></span></div>
    <p className="auto-print-note">เปิด{stationLabel}นี้ค้างไว้ ระบบจะรับเฉพาะงานของจุดนี้ทีละใบ และป้องกันหลายเครื่องพิมพ์ใบเดียวกันซ้ำ</p>
    {message && <p className="auto-print-message">{message}</p>}
    <div className="auto-print-jobs">{visibleJobs.slice(0, 12).map((job) => <article key={job.id} className={job.status}><span className="queue-state">{job.status === "printed" ? <CheckCircle2/> : job.status === "failed" ? <AlertTriangle/> : job.status === "processing" ? <LoaderCircle className="spin"/> : <Clock3/>}</span><p><b>{job.department}</b><small>{orders.find((order) => order.id === job.orderId)?.orderNumber ?? job.orderId} • {printDateTime(job.createdAt)} • ลอง {job.attempts} ครั้ง{job.lastError ? ` • ${job.lastError}` : ""}</small></p><strong>{queueStatusLabels[job.status]}</strong>{job.status === "failed" && <button type="button" onClick={() => void onAction({ action: "retryPrintQueueJob", jobId: job.id })}><RefreshCw/> ลองใหม่</button>}</article>)}</div>
    {!visibleJobs.length && <div className="auto-print-empty"><Printer/><span>ยังไม่มีงานในคิว<small>เมื่อส่งรายการ งานของจุดนี้จะปรากฏที่นี่โดยอัตโนมัติ</small></span></div>}
    {activeJob && activeOrder && <div className={`auto-print-sheet paper-${settings.paperWidth}`}><article className="kitchen-slip"><header><b>THE PBRU HERITAGE</b><strong>{activeJob.department}</strong></header><section className="kitchen-slip-meta"><p><span>โต๊ะ</span><b>{activeOrder.tableId}</b></p><p><span>ออเดอร์</span><b>{activeOrder.orderNumber}</b></p><p><span>เวลาเปิด</span><b>{printDateTime(activeOrder.openedAt)}</b></p><p><span>ระบบ</span><b>พิมพ์อัตโนมัติ</b></p></section><div className="kitchen-slip-items">{activeItems.map((item) => <div key={item.id}><strong>{item.quantity}×</strong><p><b>{item.name}</b>{item.optionSummary && <small>{item.optionSummary}</small>}{item.note && <em>หมายเหตุ: {item.note}</em>}</p></div>)}</div><footer><small>คิวกลาง Hotel Central POS • ครั้งที่ {activeJob.attempts}</small></footer></article></div>}
  </section>;
}

export function PrinterSettingsPanel({ categories, settings, working, onSave }: {
  categories: string[];
  settings: PrinterSettings;
  working: boolean;
  onSave: (settings: PrinterSettings) => Promise<boolean>;
}) {
  const [paperWidth, setPaperWidth] = useState<58 | 80>(settings.paperWidth);
  const [mappings, setMappings] = useState<Record<string, string>>(settings.categoryDepartments);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setPaperWidth(settings.paperWidth);
    setMappings(settings.categoryDepartments);
  }, [settings]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const categoryDepartments = Object.fromEntries(categories.map((category) => [category, mappings[category] || defaultDepartment(category)]));
    if (await onSave({ paperWidth, categoryDepartments })) {
      setMappings(categoryDepartments);
      setSaved("บันทึกการตั้งค่างานพิมพ์แล้ว");
      window.setTimeout(() => setSaved(""), 3500);
    }
  }

  return <details className="panel printer-settings-panel">
    <summary><span><Settings2/><b>ตั้งค่าเครื่องพิมพ์และแผนก</b></span><small>กระดาษ {paperWidth} มม. • {categories.length} หมวดหมู่</small></summary>
    <form onSubmit={submit}>
      <label className="paper-width-field"><span>ขนาดกระดาษความร้อน</span><select value={paperWidth} onChange={(event) => setPaperWidth(Number(event.target.value) === 58 ? 58 : 80)}><option value={80}>80 มม. (แนะนำ)</option><option value={58}>58 มม.</option></select></label>
      <div className="department-mapping"><header><b>แยกใบครัวตามหมวดอาหาร</b><small>แต่ละแผนกจะได้ใบครัวคนละใบ</small></header>{categories.map((category) => <label key={category}><span>{category}</span><select value={mappings[category] || defaultDepartment(category)} onChange={(event) => setMappings((current) => ({ ...current, [category]: event.target.value }))}>{printerDepartments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>)}</div>
      <footer><small>{saved || "ตั้งค่าเครื่องพิมพ์ใน Windows/Android ให้ใช้ขนาดเดียวกัน"}</small><button className="primary" disabled={working}><Printer/> บันทึกการตั้งค่า</button></footer>
    </form>
  </details>;
}

export function KitchenPrintModal({ order, items, menu, jobs, settings, working, onClose, onRecord, departmentFilter }: {
  order: PrintOrder;
  items: PrintItem[];
  menu: PrintMenuItem[];
  jobs: PrintJob[];
  settings: PrinterSettings;
  working: boolean;
  onClose: () => void;
  onRecord: (values: { action: "recordPrint"; documentType: "kitchen"; orderId: string; departments: string[]; reprintReason: string }) => Promise<boolean>;
  departmentFilter?: string[];
}) {
  const groups = useMemo(() => {
    const categoryByMenuId = new Map(menu.map((row) => [row.id, row.category]));
    const grouped = new Map<string, PrintItem[]>();
    for (const item of items.filter((row) => row.orderId === order.id && row.status !== "void" && row.status !== "draft")) {
      const category = categoryByMenuId.get(item.menuItemId) ?? "อาหาร";
      const department = settings.categoryDepartments[category] || defaultDepartment(category);
      grouped.set(department, [...(grouped.get(department) ?? []), item]);
    }
    return Array.from(grouped.entries()).filter(([department]) => !departmentFilter?.length || departmentFilter.includes(department)).map(([department, rows]) => ({ department, items: rows }));
  }, [departmentFilter, items, menu, order.id, settings.categoryDepartments]);
  const departments = groups.map((group) => group.department);
  const [selected, setSelected] = useState<string[]>(departments);
  const [printTargets, setPrintTargets] = useState<string[]>(departments);
  const [reason, setReason] = useState("");
  const orderJobs = jobs.filter((job) => job.orderId === order.id && job.documentType === "kitchen");
  const printCount = (department: string) => Math.max(0, ...orderJobs.filter((job) => job.department === department).map((job) => job.copyNumber));
  const requiresReason = selected.some((department) => printCount(department) > 0);

  useEffect(() => {
    document.body.classList.add("kitchen-print-open");
    return () => document.body.classList.remove("kitchen-print-open");
  }, []);

  async function openPrintDialog(targets: string[]) {
    if (!targets.length) return;
    if (targets.some((department) => printCount(department) > 0) && !reason.trim()) return;
    if (!await onRecord({ action: "recordPrint", documentType: "kitchen", orderId: order.id, departments: targets, reprintReason: reason.trim() })) return;
    setPrintTargets(targets);
    const previousTitle = document.title;
    document.title = `kitchen-${order.orderNumber}`;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    let restored = false;
    const restore = () => { if (restored) return; restored = true; document.title = previousTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
    window.setTimeout(restore, 1500);
  }

  return <div className="modal-backdrop v1-modal-backdrop kitchen-print-backdrop"><section className={`kitchen-print-modal paper-${settings.paperWidth}`}>
    <header className="kitchen-print-actions"><div><p className="eyebrow">KITCHEN TICKET</p><h2>ใบครัว {order.orderNumber}</h2><small>เลือกพิมพ์แยกแผนก หรือพิมพ์ทุกใบพร้อมกัน</small></div><button type="button" onClick={onClose}><X/></button></header>
    <div className="kitchen-department-select">{groups.map((group) => <label key={group.department}><input type="checkbox" checked={selected.includes(group.department)} onChange={(event) => setSelected(event.target.checked ? [...selected, group.department] : selected.filter((value) => value !== group.department))}/><span><b>{group.department}</b><small>{group.items.length} รายการ • พิมพ์แล้ว {printCount(group.department)} ครั้ง</small></span><button type="button" disabled={working || (printCount(group.department) > 0 && !reason.trim())} onClick={() => void openPrintDialog([group.department])}><Printer/> {printCount(group.department) ? "พิมพ์ซ้ำ" : "พิมพ์ใบนี้"}</button></label>)}</div>
    {requiresReason && <label className="reprint-reason"><span><RotateCcw/> เหตุผลการพิมพ์ซ้ำ</span><textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น กระดาษหมด หมึกไม่ชัด หรือใบเดิมสูญหาย"/></label>}
    <div className="kitchen-slips">{groups.filter((group) => printTargets.includes(group.department)).map((group) => <article className="kitchen-slip" key={group.department}><header><b>THE PBRU HERITAGE</b><strong>{group.department}</strong></header><section className="kitchen-slip-meta"><p><span>โต๊ะ</span><b>{order.tableId}</b></p><p><span>ออเดอร์</span><b>{order.orderNumber}</b></p><p><span>เวลาเปิด</span><b>{printDateTime(order.openedAt)}</b></p><p><span>พิมพ์ครั้งที่</span><b>{printCount(group.department) + 1}{printCount(group.department) ? " • สำเนา" : ""}</b></p></section><div className="kitchen-slip-items">{group.items.map((item) => <div key={item.id}><strong>{item.quantity}×</strong><p><b>{item.name}</b>{item.optionSummary && <small>{item.optionSummary}</small>}{item.note && <em>หมายเหตุ: {item.note}</em>}</p></div>)}</div><footer><small>พิมพ์จาก Hotel Central POS • {new Intl.DateTimeFormat("th-TH", { timeStyle: "short" }).format(new Date())}</small>{reason && <p>เหตุผลสำเนา: {reason}</p>}</footer></article>)}</div>
    <footer className="kitchen-print-footer"><button type="button" className="secondary" onClick={onClose}>ปิด</button><button type="button" className="primary" disabled={working || !selected.length || (requiresReason && !reason.trim())} onClick={() => void openPrintDialog(selected)}><Printer/> {requiresReason ? "พิมพ์ซ้ำ" : "พิมพ์"} {selected.length} แผนก</button></footer>
    {orderJobs.length > 0 && <section className="print-history"><b>ประวัติส่งหน้าต่างพิมพ์</b>{orderJobs.slice(0, 8).map((job) => <p key={job.id}><Clock3/><span>{job.department} • ครั้งที่ {job.copyNumber}<small>{printDateTime(job.printedAt)} • {job.printedByName}{job.reprintReason ? ` • ${job.reprintReason}` : ""}</small></span></p>)}</section>}
  </section></div>;
}
