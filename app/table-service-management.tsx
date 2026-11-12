"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Clock3, Copy, Printer, ReceiptText, RotateCcw, UserCheck } from "lucide-react";

export type QrDiningTable = { id: number; number: number; zone: string; seats: number; status: string; publicToken?: string | null };
export type ServiceRequest = { id: string; tableId: number; orderId: string | null; type: "waiter" | "bill" | "seated"; status: "open" | "acknowledged" | "resolved"; note?: string; createdAt: string; acknowledgedAt: string | null; acknowledgedBy: string | null };
type Action = (body: Record<string, unknown>) => Promise<boolean>;

export function TableQrManagement({ tables, working, onAction }: { tables: QrDiningTable[]; working: boolean; onAction: Action }) {
  const [tableId, setTableId] = useState(tables[0]?.id ?? 1);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const table = tables.find((row) => row.id === tableId) ?? tables[0];
  const url = table?.publicToken && origin ? `${origin}/table-order?token=${table.publicToken}` : "";
  const qr = url ? `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=360&margin=2&dark=123f3b&light=ffffff` : "";
  async function copy() { await navigator.clipboard.writeText(url); setMessage("คัดลอกลิงก์โต๊ะแล้ว"); }
  async function regenerate() { if (!table || !window.confirm(`ออก QR ใหม่สำหรับโต๊ะ ${table.number} ใช่หรือไม่? QR เดิมจะใช้งานไม่ได้`)) return; if (await onAction({ action: "regenerateTableToken", tableId: table.id })) setMessage("ออก QR ใหม่แล้ว กรุณาพิมพ์ป้ายใหม่"); }
  return <div className="content management-page table-qr-page"><div className="management-heading"><div><p className="eyebrow">TABLE QR MENU</p><h2>QR สั่งอาหารประจำโต๊ะ</h2><p>แต่ละโต๊ะมีลิงก์เฉพาะ ลูกค้าสแกนแล้วระบบจะระบุโต๊ะให้อัตโนมัติ</p></div></div>{message && <div className="notice">{message}</div>}<section className="panel table-qr-workspace"><aside><p className="eyebrow">SELECT TABLE</p><h3>เลือกโต๊ะสำหรับพิมพ์ QR</h3><div className="qr-table-list">{tables.map((row) => <button className={row.id === table?.id ? "active" : ""} key={row.id} onClick={() => setTableId(row.id)}><b>{String(row.number).padStart(2, "0")}</b><span>โต๊ะ {row.number}<small>{row.zone}</small></span></button>)}</div></aside>{table && <article className="printable-table-qr"><div className="qr-restaurant-brand"><span>H</span><div><b>Hotel Central Restaurant</b><small>มหาวิทยาลัยราชภัฏเพชรบุรี</small></div></div><p>สแกนเพื่อดูเมนูและสั่งอาหาร</p><h1>โต๊ะ {table.number}</h1>{qr && <img src={qr} alt={`QR สั่งอาหารโต๊ะ ${table.number}`}/>}<strong>TABLE {String(table.number).padStart(2, "0")}</strong><small>{table.zone} • {table.seats} ที่นั่ง</small><em>เพิ่ม–ลดรายการ • ส่งเข้าครัว • เรียกพนักงาน • เรียกคิดเงิน</em><div className="qr-print-actions"><button onClick={() => void copy()}><Copy/> คัดลอกลิงก์</button><button disabled={working} onClick={() => void regenerate()}><RotateCcw/> ออก QR ใหม่</button><button className="primary" onClick={() => window.print()}><Printer/> พิมพ์ QR โต๊ะนี้</button></div></article>}</section></div>;
}

export function ServiceRequestDesk({ requests, tables, working, onAction }: { requests: ServiceRequest[]; tables: QrDiningTable[]; working: boolean; onAction: Action }) {
  const active = useMemo(() => requests.filter((request) => request.status !== "resolved"), [requests]);
  return <div className="content management-page service-desk"><div className="management-heading"><div><p className="eyebrow">TABLE SERVICE</p><h2>เรียกพนักงานและคิดเงิน</h2><p>คำขอจากลูกค้าและการส่งต่อจากพนักงานต้อนรับจะปรากฏที่นี่แบบอัปเดตอัตโนมัติ</p></div><span className="delivery-live-count"><i/>{active.length} คำขอ</span></div><div className="service-request-grid">{active.map((request) => { const table = tables.find((row) => row.id === request.tableId); const seated = request.type === "seated"; return <article className={`${request.type} ${request.status}`} key={request.id}><span>{request.type === "bill" ? <ReceiptText/> : seated ? <UserCheck/> : <BellRing/>}</span><div><p className="eyebrow">{request.type === "bill" ? "BILL REQUEST" : seated ? "HOST HANDOVER" : "WAITER CALL"}</p><h3>โต๊ะ {table?.number ?? request.tableId}</h3><p>{seated ? request.note || "พนักงานต้อนรับพาลูกค้านั่งแล้ว" : `${table?.zone} • ${request.type === "bill" ? "ลูกค้าต้องการคิดเงิน" : "ลูกค้าเรียกพนักงาน"}`}</p><small><Clock3/>{new Date(request.createdAt).toLocaleString("th-TH")}</small></div><footer>{request.status === "open" ? <button disabled={working} onClick={() => void onAction({ action: "setServiceRequest", requestId: request.id, status: "acknowledged" })}><UserCheck/> รับเรื่อง</button> : <button disabled={working} onClick={() => void onAction({ action: "setServiceRequest", requestId: request.id, status: "resolved" })}><Check/> ดำเนินการแล้ว</button>}</footer></article>; })}{!active.length && <div className="wide-empty"><BellRing/><h3>ยังไม่มีคำขอบริการ</h3><p>เมื่อลูกค้ากดเรียกพนักงาน คิดเงิน หรือมีลูกค้านั่งโต๊ะ รายการจะแสดงที่นี่</p></div>}</div></div>;
}
