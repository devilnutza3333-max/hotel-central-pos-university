"use client";

import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, Printer, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

export type PrinterTestStation = "kitchen" | "bar" | "receipt";
export type PrinterTestStatus = "pass" | "fail";

export type PrinterTestRecord = {
  id: string;
  station: PrinterTestStation;
  paperWidth: 58 | 80;
  status: PrinterTestStatus;
  detail: string;
  actorName: string;
  createdAt: string;
};

export type PrinterReadinessAction = (body: {
  action: "recordPrinterTest";
  station: PrinterTestStation;
  paperWidth: 58 | 80;
  status: PrinterTestStatus;
  detail: string;
}) => Promise<boolean>;

const stationMeta: Record<PrinterTestStation, { label: string; description: string; department: string }> = {
  kitchen: { label: "เครื่องพิมพ์ครัว", description: "ใบสั่งอาหารตัวใหญ่และหมายเหตุชัดเจน", department: "ครัวร้อน" },
  bar: { label: "เครื่องพิมพ์บาร์", description: "แยกเครื่องดื่มออกจากใบครัว", department: "บาร์เครื่องดื่ม" },
  receipt: { label: "เครื่องพิมพ์ใบเสร็จ", description: "ยอดรวม เงินสด และ QR พร้อมเพย์", department: "แคชเชียร์" },
};

const testSequence: PrinterTestStation[] = ["kitchen", "bar", "receipt"];

function testDocument(station: PrinterTestStation, paperWidth: 58 | 80) {
  const meta = stationMeta[station];
  const width = paperWidth === 58 ? "48mm" : "70mm";
  const now = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "medium" }).format(new Date());
  const itemRows = station === "bar"
    ? "<div><b>1×</b><span>ชาไทยเย็น<br><small>หวานน้อย • ไม่ใส่น้ำแข็ง</small></span></div>"
    : "<div><b>2×</b><span>ข้าวผัดโรงแรม<br><small>หมายเหตุ: ไม่ใส่ต้นหอม</small></span></div><div><b>1×</b><span>ต้มยำกุ้ง</span></div>";
  const receiptBlock = station === "receipt"
    ? "<section class='receipt'><p><span>อาหารและเครื่องดื่ม</span><b>฿288.00</b></p><p><span>VAT 7%</span><b>฿20.16</b></p><hr><p class='total'><span>ยอดสุทธิ</span><b>฿308.16</b></p><div class='qr'>QR<br><small>PromptPay Test</small></div></section>"
    : `<section class="items">${itemRows}</section>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>printer-test-${station}</title><style>
    @page{size:${paperWidth}mm auto;margin:2mm}*{box-sizing:border-box}body{width:${width};margin:0 auto;color:#000;background:#fff;font-family:Arial,"Noto Sans Thai",sans-serif;font-size:11px}header{text-align:center;border-bottom:2px dashed #000;padding:0 0 8px}header b{display:block;font-size:14px}header strong{display:block;margin-top:4px;font-size:18px}.meta{padding:7px 0;border-bottom:1px dashed #000}.meta p,.receipt p{margin:3px 0;display:flex;justify-content:space-between}.items>div{padding:8px 0;display:grid;grid-template-columns:28px 1fr;gap:5px;border-bottom:1px dotted #000}.items b{font-size:16px}.items small{font-size:10px}.receipt{padding:8px 0}.receipt hr{border:0;border-top:1px dashed #000}.receipt .total{font-size:16px}.qr{width:82px;height:82px;margin:12px auto 0;display:grid;place-items:center;align-content:center;border:4px solid #000;text-align:center;font-weight:bold}.qr small{font-size:7px}footer{padding-top:9px;text-align:center;font-size:9px}.cut{margin-top:12px;border-top:1px dashed #000;text-align:center}
  </style></head><body><header><b>THE PBRU HERITAGE</b><span>PRINTER TEST • ${paperWidth} MM</span><strong>${meta.department}</strong></header><section class="meta"><p><span>โต๊ะ</span><b>TEST-01</b></p><p><span>เวลา</span><b>${now}</b></p><p><span>ปลายทาง</span><b>${meta.label}</b></p></section>${receiptBlock}<footer>หากอ่านทุกบรรทัดชัดเจน ให้กด “พิมพ์ออกปกติ” ในระบบ<div class="cut">✂ จุดตัดกระดาษ ✂</div></footer></body></html>`;
}

function openIsolatedPrint(station: PrinterTestStation, paperWidth: 58 | 80) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", `ทดสอบ ${stationMeta[station].label}`);
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.srcdoc = testDocument(station, paperWidth);
  frame.addEventListener("load", () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 3_000);
    }
  }, { once: true });
  document.body.appendChild(frame);
}

export default function PrinterReadinessPanel({ paperWidth, tests, working, onPaperWidthChange, onAction }: {
  paperWidth: 58 | 80;
  tests: PrinterTestRecord[];
  working: boolean;
  onPaperWidthChange?: (paperWidth: 58 | 80) => void;
  onAction: PrinterReadinessAction;
}) {
  const [pendingStation, setPendingStation] = useState<PrinterTestStation | null>(null);
  const [failureDetail, setFailureDetail] = useState("");
  const [message, setMessage] = useState("");
  const latestByStation = useMemo(() => new Map(testSequence.map((station) => [station, tests.find((test) => test.station === station) ?? null])), [tests]);
  const passed = testSequence.filter((station) => latestByStation.get(station)?.status === "pass").length;

  function startTest(station: PrinterTestStation) {
    setMessage("");
    setFailureDetail("");
    try {
      openIsolatedPrint(station, paperWidth);
      setPendingStation(station);
    } catch (error) {
      setPendingStation(station);
      setFailureDetail(error instanceof Error ? error.message : "เปิดหน้าต่างพิมพ์ไม่สำเร็จ");
    }
  }

  async function confirm(status: PrinterTestStatus) {
    if (!pendingStation) return;
    const detail = status === "pass" ? "พิมพ์ใบทดสอบออกครบ ตัวอักษรชัด และตัดกระดาษได้" : failureDetail.trim() || "เครื่องพิมพ์ไม่ตอบสนองหรือผลพิมพ์ไม่สมบูรณ์";
    if (!await onAction({ action: "recordPrinterTest", station: pendingStation, paperWidth, status, detail })) return;
    setMessage(status === "pass" ? `ยืนยัน ${stationMeta[pendingStation].label} พร้อมใช้งานแล้ว` : `บันทึกปัญหา ${stationMeta[pendingStation].label} แล้ว`);
    setPendingStation(null);
    setFailureDetail("");
  }

  return <section className="panel printer-readiness-panel">
    <header className="printer-readiness-head"><div><p className="eyebrow">PHYSICAL PRINTER CHECK</p><h3>ทดสอบเครื่องพิมพ์ก่อนเปิดร้าน</h3><p>พิมพ์ใบตัวอย่างจริงทีละจุด แล้วให้ผู้ทดสอบยืนยันผล ระบบจึงถือว่าพร้อม</p></div><span className={passed === testSequence.length ? "ready" : "pending"}><Printer/><b>{passed}/{testSequence.length}</b><small>จุดพร้อมใช้</small></span></header>
    <div className="printer-paper-select"><span>ขนาดกระดาษของร้าน</span><button className={paperWidth === 58 ? "active" : ""} type="button" onClick={() => onPaperWidthChange?.(58)}>58 มม.</button><button className={paperWidth === 80 ? "active" : ""} type="button" onClick={() => onPaperWidthChange?.(80)}>80 มม.</button></div>
    {message && <div className="printer-test-message"><CheckCircle2/>{message}<button type="button" onClick={() => setMessage("")}>×</button></div>}
    <div className="printer-test-grid">{testSequence.map((station) => {
      const meta = stationMeta[station];
      const latest = latestByStation.get(station);
      return <article key={station} className={latest?.status ?? "untested"}><span>{latest?.status === "pass" ? <CheckCircle2/> : latest?.status === "fail" ? <XCircle/> : <Printer/>}</span><div><h4>{meta.label}</h4><p>{meta.description}</p>{latest ? <small><Clock3/> {new Date(latest.createdAt).toLocaleString("th-TH")} • {latest.actorName} • {latest.paperWidth} มม.</small> : <small>ยังไม่ได้ทดสอบบนเครื่องจริง</small>}</div><button type="button" disabled={working || pendingStation !== null} onClick={() => startTest(station)}>{working && pendingStation === station ? <LoaderCircle className="spin"/> : latest ? <RefreshCw/> : <Printer/>}{latest ? "ทดสอบใหม่" : "พิมพ์ทดสอบ"}</button></article>;
    })}</div>
    {pendingStation && <div className="printer-test-confirm"><div><AlertTriangle/><span><b>ตรวจใบที่ออกจาก {stationMeta[pendingStation].label}</b><small>ยืนยันจากกระดาษจริง ไม่ใช่เพียงหน้าต่างพิมพ์เปิดสำเร็จ</small></span></div><label><span>หากไม่สำเร็จ ระบุปัญหา</span><input maxLength={300} value={failureDetail} onChange={(event) => setFailureDetail(event.target.value)} placeholder="เช่น กระดาษไม่ออก ตัวอักษรขาด หรือเลือกเครื่องผิด"/></label><footer><button type="button" className="failed" disabled={working} onClick={() => void confirm("fail")}><XCircle/> พิมพ์ไม่สำเร็จ</button><button type="button" className="passed" disabled={working} onClick={() => void confirm("pass")}><CheckCircle2/> พิมพ์ออกปกติ</button></footer></div>}
  </section>;
}
