"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Banknote, Calculator, CheckCircle2, CircleDollarSign, Download, FileText, Layers3, Printer, ReceiptText, RotateCcw, Scissors, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import DataProtectionPanel from "./data-protection-panel";
import { buildPromptPayPayload, isValidPromptPayId, maskPromptPayId } from "./promptpay";
import type { PrintJob, PrinterSettings } from "./printing-controls";

export type CashShift = { id: string; openedBy: string; openingCash: number; status: "open" | "closed"; openedAt: string; closedBy: string | null; closedAt: string | null; expectedCash: number; closingCash: number; difference: number; note: string };
export type CashMovement = { id: string; shiftId: string; type: "cash_in" | "cash_out"; amount: number; note: string; actorId: string; createdAt: string };
export type OrderPayment = {
  id: string; orderId: string; shiftId: string | null; method: "cash" | "qr" | "card" | "transfer"; amount: number;
  status: "confirmed" | "refunded"; referenceCode: string; confirmationNote: string;
  receivedBy: string; receivedByName: string; createdAt: string;
  reversedBy: string | null; reversedByName: string | null; reversedAt: string | null; reversalReason: string;
};
export type ShiftReportOrder = { id: string; orderNumber: string; tableId: number; status: string; shiftId: string | null; subtotal: number; discountAmount: number; serviceChargeAmount: number; vatAmount: number; total: number; receiptNumber?: string | null; closedAt: string | null; updatedAt: string };

type BillOrder = {
  id: string; orderNumber: string; tableId: number; status?: string; subtotal: number; total: number;
  discountType: "none" | "percent" | "amount"; discountValue: number; discountAmount: number;
  serviceChargeRate: number; serviceChargeAmount: number; vatRate: number; vatAmount: number;
  amountTendered: number; changeAmount: number; receiptNumber: string | null; paymentMethod: string | null;
  closedAt?: string | null;
};

type BillItem = { id: string; name: string; quantity: number; unitPrice: number; optionPrice: number; optionSummary: string; note: string; status: string };
type Table = { id: number; number: number; status: string };
type ActiveOrder = { id: string; tableId: number; orderNumber: string };

const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const paymentLabels: Record<string, string> = { cash: "เงินสด", qr: "พร้อมเพย์", card: "บัตร (รายการเดิม)", transfer: "โอนเงิน (รายการเดิม)" };
const activePaymentLabels: Record<string, string> = { cash: "เงินสด", qr: "พร้อมเพย์" };

export function CheckoutModal({ order, items, settings, hasOpenShift, working, onClose, onApply, onPay }: {
  order: BillOrder; items: BillItem[]; settings: { vatRate: number; serviceChargeRate: number; promptPayId: string; promptPayName: string }; hasOpenShift: boolean; working: boolean;
  onClose: () => void;
  onApply: (values: { discountType: string; discountValue: number; serviceChargeRate: number; vatRate: number }) => Promise<boolean>;
  onPay: (values: { payments: Array<{ method: string; amount: number }>; amountTendered: number; confirmed: boolean; paymentReference: string; confirmationNote: string }) => Promise<boolean>;
}) {
  const [discountType, setDiscountType] = useState(order.discountType);
  const [discountValue, setDiscountValue] = useState(order.discountType === "percent" ? order.discountValue / 100 : order.discountValue / 100);
  const [serviceRate, setServiceRate] = useState(order.serviceChargeRate ? order.serviceChargeRate / 100 : settings.serviceChargeRate);
  const [vatRate, setVatRate] = useState(order.vatRate ? order.vatRate / 100 : settings.vatRate);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr">("cash");
  const [tendered, setTendered] = useState((order.total / 100).toFixed(2));
  const [paymentReference, setPaymentReference] = useState("");
  const [confirmationNote, setConfirmationNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTendered((order.total / 100).toFixed(2));
  }, [order.total]);

  const cashDue = paymentMethod === "cash" ? order.total : 0;
  const change = Math.max(0, Math.round((Number(tendered) || 0) * 100) - cashDue);
  const promptPayReady = isValidPromptPayId(settings.promptPayId);
  const promptPayPayload = useMemo(() => promptPayReady ? buildPromptPayPayload(settings.promptPayId, order.total) : "", [order.total, promptPayReady, settings.promptPayId]);
  const quickTender = Array.from(new Set([
    cashDue,
    Math.ceil(cashDue / 10_000) * 10_000,
    Math.ceil(cashDue / 50_000) * 50_000,
    Math.ceil(cashDue / 100_000) * 100_000,
  ])).filter((value) => value >= cashDue && value > 0);

  async function applyCharges() {
    await onApply({ discountType, discountValue: Number(discountValue) || 0, serviceChargeRate: Number(serviceRate) || 0, vatRate: Number(vatRate) || 0 });
  }

  async function pay() {
    if (submitting || !confirmed) return;
    setSubmitting(true);
    try {
      await onPay({
        payments: [{ method: paymentMethod, amount: order.total / 100 }],
        amountTendered: paymentMethod === "cash" ? Number(tendered) || 0 : order.total / 100,
        confirmed,
        paymentReference,
        confirmationNote,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop v1-modal-backdrop" role="presentation">
    <section className="checkout-modal" role="dialog" aria-modal="true" aria-label="คิดเงิน">
      <header><div><p className="eyebrow">CHECKOUT</p><h2>คิดเงินโต๊ะ {order.tableId}</h2><small>{order.orderNumber}</small></div><button onClick={onClose}><X/></button></header>
      <div className="checkout-grid">
        <section className="checkout-items"><h3>รายการอาหาร</h3>{items.map((item) => <div key={item.id}><span>{item.quantity}×</span><p>{item.name}{item.optionSummary && <small>{item.optionSummary}</small>}{item.note && <small>หมายเหตุ: {item.note}</small>}</p><b>{money((item.unitPrice + item.optionPrice) * item.quantity)}</b></div>)}</section>
        <section className="charge-editor"><h3><Settings2/> ส่วนลดและภาษี</h3><div className="charge-fields"><label><span>ส่วนลด</span><select value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)}><option value="none">ไม่มี</option><option value="percent">เปอร์เซ็นต์</option><option value="amount">จำนวนเงิน</option></select></label><label><span>{discountType === "percent" ? "% ส่วนลด" : "บาท"}</span><input type="number" min="0" max={discountType === "percent" ? 100 : undefined} step="0.01" value={discountValue} disabled={discountType === "none"} onChange={(event) => setDiscountValue(Number(event.target.value))}/></label><label><span>Service Charge %</span><input type="number" min="0" max="30" step="0.01" value={serviceRate} onChange={(event) => setServiceRate(Number(event.target.value))}/></label><label><span>VAT %</span><input type="number" min="0" max="30" step="0.01" value={vatRate} onChange={(event) => setVatRate(Number(event.target.value))}/></label></div><button className="secondary" disabled={working} onClick={() => void applyCharges()}><Calculator/> คำนวณยอดใหม่</button>
          <div className="bill-breakdown"><p><span>ยอดอาหาร</span><b>{money(order.subtotal)}</b></p><p className="discount"><span>ส่วนลด</span><b>-{money(order.discountAmount)}</b></p><p><span>ค่าบริการ</span><b>{money(order.serviceChargeAmount)}</b></p><p><span>VAT</span><b>{money(order.vatAmount)}</b></p><p className="grand-total"><span>ยอดสุทธิ</span><strong>{money(order.total)}</strong></p></div>
        </section>
        <section className="payment-editor"><h3><CircleDollarSign/> ช่องทางชำระ</h3><div className="payment-method-buttons"><button type="button" className={paymentMethod === "cash" ? "active" : ""} onClick={() => { setPaymentMethod("cash"); setConfirmed(false); setPaymentReference(""); }}><Banknote/> เงินสด</button><button type="button" className={paymentMethod === "qr" ? "active" : ""} disabled={!promptPayReady} onClick={() => { setPaymentMethod("qr"); setConfirmed(false); setPaymentReference(""); }}><ReceiptText/> พร้อมเพย์</button></div>{paymentMethod === "cash" ? <div className="cash-tender"><label><span>รับเงินสดมา</span><input type="number" min={cashDue / 100} step="0.01" value={tendered} onChange={(event) => { setTendered(event.target.value); setConfirmed(false); }}/></label><div><span>เงินทอน</span><strong>{money(change)}</strong></div><div className="quick-tender">{quickTender.map((value) => <button type="button" key={value} onClick={() => { setTendered((value / 100).toFixed(2)); setConfirmed(false); }}>{value === cashDue ? "พอดี" : money(value)}</button>)}</div></div> : <div className="promptpay-checkout"><QRCodeSVG value={promptPayPayload} size={168} level="M" includeMargin/><div><b>สแกนพร้อมเพย์ {money(order.total)}</b><span>{settings.promptPayName}</span><small>{maskPromptPayId(settings.promptPayId)}</small><em>ตรวจสอบยอดเงินเข้าก่อนยืนยันรับชำระ</em></div></div>}{!promptPayReady && <p className="promptpay-warning">อาจารย์หรือผู้จัดการต้องตั้งค่าหมายเลขพร้อมเพย์ในเมนูกะก่อนใช้งาน</p>}{!hasOpenShift && <p className="shift-required">กรุณาเปิดกะก่อนรับชำระเงินทุกช่องทาง</p>}<div className="payment-proof"><label><span>{paymentMethod === "qr" ? "เลขอ้างอิงพร้อมเพย์ *" : "เลขอ้างอิง/หมายเหตุเงินสด"}</span><input value={paymentReference} maxLength={80} placeholder={paymentMethod === "qr" ? "อย่างน้อย 4 ตัวท้ายจากธนาคาร" : "เว้นว่างเพื่อใช้เลขใบเสร็จ"} onChange={(event) => { setPaymentReference(event.target.value); setConfirmed(false); }}/></label><label><span>หมายเหตุการรับชำระ</span><input value={confirmationNote} maxLength={200} placeholder="ไม่บังคับ" onChange={(event) => setConfirmationNote(event.target.value)}/></label><label className={`payment-confirm-check ${confirmed ? "checked" : ""}`}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><CheckCircle2/><span><b>ตรวจสอบแล้วว่าได้รับเงินจริง</b><small>{paymentMethod === "qr" ? "ตรวจยอดและชื่อบัญชีจากแอปธนาคารแล้ว" : "นับเงินสดและเงินทอนถูกต้องแล้ว"}</small></span></label></div><div className="payment-match ok"><span>ยอดที่ต้องชำระ</span><b>{money(order.total)}</b><small>{paymentMethod === "cash" ? "รับเป็นเงินสด" : "รับผ่านพร้อมเพย์"}</small></div></section>
      </div>
      <footer><button className="secondary" onClick={onClose}>ยกเลิก</button><button className="primary" disabled={working || submitting || !confirmed || !hasOpenShift || (paymentMethod === "qr" && (!promptPayReady || paymentReference.trim().length < 4)) || (cashDue > 0 && Math.round(Number(tendered) * 100) < cashDue)} onClick={() => void pay()}><ShieldCheck/> {submitting ? "กำลังบันทึก…" : `ยืนยันรับเงินจริง ${money(order.total)}`}</button></footer>
    </section>
  </div>;
}

export function TableOperationsModal({ order, items, tables, activeOrders, working, canVoid = false, onClose, onAction }: {
  order: ActiveOrder; items: BillItem[]; tables: Table[]; activeOrders: ActiveOrder[]; working: boolean; canVoid?: boolean; onClose: () => void;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"move" | "merge" | "split" | "void">("move");
  const [targetTableId, setTargetTableId] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [voidReason, setVoidReason] = useState("");
  const [approvalUsername, setApprovalUsername] = useState("");
  const [approvalPassword, setApprovalPassword] = useState("");
  const activeByTable = new Map(activeOrders.map((row) => [row.tableId, row]));
  const candidates = tables.filter((table) => table.id !== order.tableId && (mode === "merge" ? activeByTable.has(table.id) : !activeByTable.has(table.id)));
  const draftItems = items.filter((item) => item.status === "draft");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "void") {
      if (await onAction({ action: "voidOrder", orderId: order.id, reason: voidReason, approvalUsername, approvalPassword })) onClose();
      return;
    }
    if (!targetTableId) return;
    const action = mode === "move" ? "moveOrder" : mode === "merge" ? "mergeOrder" : "splitOrder";
    if (await onAction({ action, orderId: order.id, targetTableId, itemIds: selected })) onClose();
  }

  return <div className="modal-backdrop v1-modal-backdrop"><form className="table-operations-modal" onSubmit={submit}><header><div><p className="eyebrow">TABLE OPERATIONS</p><h2>จัดการโต๊ะ {order.tableId}</h2></div><button type="button" onClick={onClose}><X/></button></header><div className="operation-tabs"><button type="button" className={mode === "move" ? "active" : ""} onClick={() => { setMode("move"); setTargetTableId(0); }}><ArrowRightLeft/>ย้ายโต๊ะ</button><button type="button" className={mode === "merge" ? "active" : ""} onClick={() => { setMode("merge"); setTargetTableId(0); }}><Layers3/>รวมโต๊ะ</button><button type="button" className={mode === "split" ? "active" : ""} onClick={() => { setMode("split"); setTargetTableId(0); }}><Scissors/>แยกบิล</button>{canVoid && <button type="button" className={mode === "void" ? "active danger" : "danger"} onClick={() => setMode("void")}><Trash2/>ยกเลิกบิล</button>}</div><p className="operation-help">{mode === "move" ? "ย้ายออเดอร์ทั้งหมดไปโต๊ะว่าง" : mode === "merge" ? "รวมออเดอร์นี้เข้าโต๊ะที่มีออเดอร์อยู่แล้ว" : mode === "split" ? "ย้ายรายการที่ยังไม่ส่งครัวไปเปิดเป็นบิลใหม่ที่โต๊ะว่าง" : "ยกเลิกบิลทั้งใบ ระบบจะเปิดโต๊ะให้ว่างและบันทึกชื่อผู้ยกเลิกพร้อมเหตุผล"}</p>{mode === "split" && <div className="split-items">{draftItems.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))}/><span>{item.quantity}× {item.name}<small>{item.optionSummary}</small></span><b>{money((item.unitPrice + item.optionPrice) * item.quantity)}</b></label>)}{!draftItems.length && <p>ไม่มีรายการรอส่งครัวสำหรับแยกบิล</p>}</div>}{mode === "void" ? <div className="approval-fields"><label className="target-table void-reason"><span>เหตุผลการยกเลิกบิล</span><textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="เช่น ลูกค้ายกเลิกออเดอร์ หรือเปิดโต๊ะผิด" maxLength={300} required/></label><div className="manager-approval-box"><div><ShieldCheck/><span><b>การอนุมัติผู้จัดการ</b><small>ใช้บัญชีอาจารย์หรือผู้จัดการยืนยัน</small></span></div><label><span>ชื่อผู้ใช้</span><input autoComplete="username" value={approvalUsername} onChange={(event) => setApprovalUsername(event.target.value)} required/></label><label><span>รหัสผ่าน</span><input type="password" autoComplete="current-password" value={approvalPassword} onChange={(event) => setApprovalPassword(event.target.value)} required/></label></div></div> : <label className="target-table"><span>โต๊ะปลายทาง</span><select value={targetTableId} onChange={(event) => setTargetTableId(Number(event.target.value))}><option value={0}>— เลือกโต๊ะ —</option>{candidates.map((table) => <option key={table.id} value={table.id}>โต๊ะ {table.number}{mode === "merge" ? ` • ${activeByTable.get(table.id)?.orderNumber}` : " • ว่าง"}</option>)}</select></label>}<footer><button type="button" className="secondary" onClick={onClose}>ยกเลิก</button><button className={mode === "void" ? "danger" : "primary"} disabled={working || (mode === "void" ? !voidReason.trim() || !approvalUsername.trim() || !approvalPassword : !targetTableId || (mode === "split" && !selected.length))}>{mode === "move" ? "ยืนยันย้ายโต๊ะ" : mode === "merge" ? "ยืนยันรวมโต๊ะ" : mode === "split" ? "ยืนยันแยกบิล" : "ผู้จัดการอนุมัติยกเลิกบิล"}</button></footer></form></div>;
}

function RefundApprovalModal({ order, payment, working, onClose, onConfirm }: {
  order: ShiftReportOrder; payment?: OrderPayment; working: boolean; onClose: () => void;
  onConfirm: (values: { reason: string; approvalUsername: string; approvalPassword: string }) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [approvalUsername, setApprovalUsername] = useState("");
  const [approvalPassword, setApprovalPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onConfirm({ reason, approvalUsername, approvalPassword })) onClose();
  }
  return <div className="modal-backdrop v1-modal-backdrop"><form className="refund-modal" onSubmit={submit}><header><div><p className="eyebrow">MANAGER APPROVAL</p><h2>คืนเงินบิล {order.orderNumber}</h2></div><button type="button" onClick={onClose}><X/></button></header><section className="refund-summary"><p><span>ยอดคืน</span><strong>{money(order.total)}</strong></p><p><span>ช่องทางเดิม</span><b>{paymentLabels[payment?.method ?? ""] ?? payment?.method}</b></p><p><span>รับชำระโดย</span><b>{payment?.receivedByName ?? "—"}</b></p><p><span>เลขอ้างอิง</span><b>{payment?.referenceCode || order.receiptNumber || "—"}</b></p></section><div className="refund-warning"><RotateCcw/><p><b>รายการนี้จะถูกทำเครื่องหมายว่า “คืนเงินแล้ว”</b><span>ยอดจะถูกหักออกจากกะปัจจุบัน แต่ระบบจะไม่คืนวัตถุดิบเข้าสต๊อกอัตโนมัติ</span></p></div><label><span>เหตุผลการคืนเงิน</span><textarea required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น ลูกค้าชำระซ้ำ หรือคิดยอดผิด"/></label><div className="manager-approval-box"><div><ShieldCheck/><span><b>การอนุมัติผู้จัดการ</b><small>กรอกบัญชีอาจารย์หรือผู้จัดการ</small></span></div><label><span>ชื่อผู้ใช้</span><input required autoComplete="username" value={approvalUsername} onChange={(event) => setApprovalUsername(event.target.value)}/></label><label><span>รหัสผ่าน</span><input required type="password" autoComplete="current-password" value={approvalPassword} onChange={(event) => setApprovalPassword(event.target.value)}/></label></div><footer><button type="button" className="secondary" onClick={onClose}>กลับ</button><button className="danger" disabled={working || !reason.trim() || !approvalUsername.trim() || !approvalPassword}><RotateCcw/> อนุมัติคืนเงิน {money(order.total)}</button></footer></form></div>;
}

export function ShiftPanel({ shifts, movements, payments, orders, settings, working, management, instructor, onAction, onOpenReceipt }: {
  shifts: CashShift[]; movements: CashMovement[]; payments: OrderPayment[]; orders: ShiftReportOrder[]; settings: { vatRate: number; serviceChargeRate: number; promptPayId: string; promptPayName: string }; working: boolean; management: boolean; instructor: boolean;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
  onOpenReceipt: (orderId: string) => void;
}) {
  const openShift = shifts.find((shift) => shift.status === "open");
  const [openingCash, setOpeningCash] = useState("0");
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out">("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [vatRate, setVatRate] = useState(String(settings.vatRate));
  const [serviceRate, setServiceRate] = useState(String(settings.serviceChargeRate));
  const [promptPayId, setPromptPayId] = useState(settings.promptPayId);
  const [promptPayName, setPromptPayName] = useState(settings.promptPayName);
  const [reportShiftId, setReportShiftId] = useState(openShift?.id ?? shifts[0]?.id ?? "");
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
  useEffect(() => {
    if (!reportShiftId || !shifts.some((shift) => shift.id === reportShiftId)) setReportShiftId(openShift?.id ?? shifts[0]?.id ?? "");
  }, [openShift?.id, reportShiftId, shifts]);
  const confirmedPayments = payments.filter((row) => row.status !== "refunded");
  const currentMovements = openShift ? movements.filter((row) => row.shiftId === openShift.id) : [];
  const cashSales = openShift ? confirmedPayments.filter((row) => row.shiftId === openShift.id && row.method === "cash").reduce((sum, row) => sum + row.amount, 0) : 0;
  const expected = openShift ? openShift.openingCash + cashSales + currentMovements.reduce((sum, row) => sum + (row.type === "cash_in" ? row.amount : -row.amount), 0) : 0;
  const reportShift = shifts.find((shift) => shift.id === reportShiftId);
  const allReportPayments = payments.filter((row) => row.shiftId === reportShiftId);
  const reportPayments = allReportPayments.filter((row) => row.status !== "refunded");
  const reportOrders = orders.filter((order) => order.shiftId === reportShiftId && ["paid", "refunded"].includes(order.status));
  const paidReportOrders = reportOrders.filter((order) => order.status === "paid");
  const reportMovements = movements.filter((row) => row.shiftId === reportShiftId);
  const paymentTotals = Object.fromEntries(Object.keys(paymentLabels).map((method) => [method, reportPayments.filter((row) => row.method === method).reduce((sum, row) => sum + row.amount, 0)])) as Record<string, number>;
  const reportTotals = {
    subtotal: paidReportOrders.reduce((sum, row) => sum + row.subtotal, 0),
    discount: paidReportOrders.reduce((sum, row) => sum + row.discountAmount, 0),
    service: paidReportOrders.reduce((sum, row) => sum + row.serviceChargeAmount, 0),
    vat: paidReportOrders.reduce((sum, row) => sum + row.vatAmount, 0),
    total: reportPayments.reduce((sum, row) => sum + row.amount, 0),
    cashIn: reportMovements.filter((row) => row.type === "cash_in").reduce((sum, row) => sum + row.amount, 0),
    cashOut: reportMovements.filter((row) => row.type === "cash_out").reduce((sum, row) => sum + row.amount, 0),
  };
  const refundOrder = reportOrders.find((order) => order.id === refundOrderId);
  const refundPayment = allReportPayments.find((payment) => payment.orderId === refundOrderId);

  function exportCsv() {
    if (!reportShift) return;
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const paymentByOrder = new Map<string, string[]>();
    for (const payment of allReportPayments) paymentByOrder.set(payment.orderId, [...(paymentByOrder.get(payment.orderId) ?? []), `${paymentLabels[payment.method]}${payment.status === "refunded" ? " (คืนเงินแล้ว)" : ""}`]);
    const rows: Array<Array<string | number>> = [
      ["รายงานปิดกะ THE PBRU HERITAGE"],
      ["เปิดกะ", dateTime(reportShift.openedAt)], ["ปิดกะ", reportShift.closedAt ? dateTime(reportShift.closedAt) : "กำลังเปิด"],
      ["จำนวนบิลสุทธิ", paidReportOrders.length], ["บิลคืนเงิน", reportOrders.length - paidReportOrders.length], ["ยอดสุทธิ", (reportTotals.total / 100).toFixed(2)],
      ["เงินสด", (paymentTotals.cash / 100).toFixed(2)], ["พร้อมเพย์", (paymentTotals.qr / 100).toFixed(2)],
      ["เงินสดที่ควรมี", (reportShift.expectedCash / 100).toFixed(2)], ["เงินสดที่นับจริง", (reportShift.closingCash / 100).toFixed(2)], ["เงินขาด/เกิน", (reportShift.difference / 100).toFixed(2)],
      [], ["เลขที่ออเดอร์", "โต๊ะ", "เวลาชำระ", "สถานะ", "ยอดอาหาร", "ส่วนลด", "ค่าบริการ", "VAT", "ยอดสุทธิ", "ช่องทางชำระ"],
      ...reportOrders.map((order) => [order.orderNumber, order.tableId, dateTime(order.closedAt ?? order.updatedAt), order.status === "refunded" ? "คืนเงินแล้ว" : "รับชำระแล้ว", (order.subtotal / 100).toFixed(2), (order.discountAmount / 100).toFixed(2), (order.serviceChargeAmount / 100).toFixed(2), (order.vatAmount / 100).toFixed(2), (order.total / 100).toFixed(2), (paymentByOrder.get(order.id) ?? []).join("+")]),
    ];
    const blob = new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `shift-report-${reportShift.openedAt.slice(0, 10)}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="content finance-content">
    <section className="finance-hero"><div><p className="eyebrow">CASH CONTROL</p><h2>{openShift ? "กะกำลังเปิด" : "ยังไม่ได้เปิดกะ"}</h2><p>{openShift ? `เปิดเมื่อ ${dateTime(openShift.openedAt)}` : "เปิดกะก่อนรับชำระเงินสด"}</p></div><span className={openShift ? "open" : "closed"}><i/>{openShift ? "OPEN" : "CLOSED"}</span></section>
    <div className="finance-grid">
      <article className="panel shift-card"><h3><Banknote/> กะเงินสด</h3>{!openShift ? <form onSubmit={(event) => { event.preventDefault(); void onAction({ action: "openShift", openingCash: Number(openingCash) }); }}><label><span>เงินสดเริ่มต้น</span><input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)}/></label><button className="primary" disabled={working}>เปิดกะ</button></form> : <><div className="shift-totals"><p><span>เงินเริ่มต้น</span><b>{money(openShift.openingCash)}</b></p><p><span>ยอดขายเงินสด</span><b>{money(cashSales)}</b></p><p><span>เงินเข้า–ออก</span><b>{money(expected - openShift.openingCash - cashSales)}</b></p><p><span>เงินสดที่ควรมี</span><strong>{money(expected)}</strong></p></div><form onSubmit={async (event) => { event.preventDefault(); if (await onAction({ action: "closeShift", closingCash: Number(closingCash), note: closingNote })) { setClosingCash(""); setClosingNote(""); } }}><label><span>นับเงินจริงปลายกะ</span><input type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} required/></label><label><span>หมายเหตุ</span><input value={closingNote} onChange={(event) => setClosingNote(event.target.value)}/></label><button className="danger" disabled={working}>ปิดกะและสรุปยอด</button></form></>}</article>
      <article className="panel cash-movement-card"><h3><CircleDollarSign/> เงินเข้า–ออก</h3>{openShift ? <form onSubmit={async (event) => { event.preventDefault(); if (await onAction({ action: "cashMovement", type: movementType, amount: Number(movementAmount), note: movementNote })) { setMovementAmount(""); setMovementNote(""); } }}><div className="two-fields"><label><span>ประเภท</span><select value={movementType} onChange={(event) => setMovementType(event.target.value as typeof movementType)}><option value="cash_in">เงินเข้า</option><option value="cash_out">เงินออก</option></select></label><label><span>จำนวนเงิน</span><input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} required/></label></div><label><span>เหตุผล</span><input value={movementNote} onChange={(event) => setMovementNote(event.target.value)} required/></label><button className="secondary" disabled={working}>บันทึกรายการ</button></form> : <p className="muted">เปิดกะก่อนบันทึกรายการ</p>}<div className="cash-history">{currentMovements.slice(0, 8).map((row) => <p key={row.id}><span className={row.type}>{row.type === "cash_in" ? "+" : "−"}</span><b>{row.note}</b><strong>{money(row.amount)}</strong></p>)}</div></article>
      {management && <article className="panel billing-settings"><h3><Settings2/> ตั้งค่าบิลและพร้อมเพย์</h3><p>QR จะฝังยอดสุทธิของแต่ละบิลอัตโนมัติ และพิมพ์ติดไปกับใบเสร็จ</p><form onSubmit={(event) => { event.preventDefault(); void onAction({ action: "setBillingSettings", vatRate: Number(vatRate), serviceChargeRate: Number(serviceRate), promptPayId, promptPayName }); }}><label><span>Service Charge %</span><input type="number" min="0" max="30" step="0.01" value={serviceRate} onChange={(event) => setServiceRate(event.target.value)}/></label><label><span>VAT %</span><input type="number" min="0" max="30" step="0.01" value={vatRate} onChange={(event) => setVatRate(event.target.value)}/></label><label><span>หมายเลขพร้อมเพย์</span><input inputMode="numeric" autoComplete="off" placeholder="เบอร์โทร 10 หลัก หรือเลข 13 หลัก" value={promptPayId} onChange={(event) => setPromptPayId(event.target.value.replace(/\D/g, "").slice(0, 13))}/></label><label><span>ชื่อบัญชีพร้อมเพย์</span><input maxLength={100} placeholder="ชื่อที่ให้ลูกค้าตรวจสอบ" value={promptPayName} onChange={(event) => setPromptPayName(event.target.value)}/></label><button className="primary" disabled={working || Boolean(promptPayId) && (!isValidPromptPayId(promptPayId) || !promptPayName.trim())}>บันทึกค่าเริ่มต้นและพร้อมเพย์</button></form></article>}
    </div>
    {reportShift && <article className="panel shift-report shift-report-print">
      <header><div><p className="eyebrow">SHIFT CLOSING REPORT</p><h3>รายงานสรุปกะ</h3><small>{dateTime(reportShift.openedAt)} – {reportShift.closedAt ? dateTime(reportShift.closedAt) : "กำลังเปิด"}</small></div><div><button onClick={exportCsv}><Download/> CSV</button><button className="primary" onClick={() => window.print()}><Printer/> พิมพ์รายงาน</button></div></header>
      <section className="payment-summary">{Object.entries(activePaymentLabels).map(([method, label]) => <div key={method}><span>{label}</span><strong>{money(paymentTotals[method] ?? 0)}</strong></div>)}<div className="total"><span>ยอดรับชำระรวม</span><strong>{money(reportTotals.total)}</strong></div></section>
      <section className="report-metrics"><p><span>จำนวนบิลสุทธิ</span><b>{paidReportOrders.length.toLocaleString("th-TH")}{reportOrders.length > paidReportOrders.length ? ` • คืน ${reportOrders.length - paidReportOrders.length}` : ""}</b></p><p><span>ยอดอาหาร</span><b>{money(reportTotals.subtotal)}</b></p><p><span>ส่วนลด</span><b>-{money(reportTotals.discount)}</b></p><p><span>Service Charge</span><b>{money(reportTotals.service)}</b></p><p><span>VAT</span><b>{money(reportTotals.vat)}</b></p><p><span>เงินเข้า / ออก</span><b>{money(reportTotals.cashIn)} / -{money(reportTotals.cashOut)}</b></p><p><span>เงินสดที่ควรมี</span><b>{money(reportShift.status === "open" ? expected : reportShift.expectedCash)}</b></p><p><span>นับจริง / ขาด–เกิน</span><b>{reportShift.status === "closed" ? `${money(reportShift.closingCash)} / ${money(reportShift.difference)}` : "รอปิดกะ"}</b></p></section>
      <div className="report-order-list"><div><b>เลขที่ออเดอร์</b><b>โต๊ะ</b><b>เวลา</b><b>ช่องทาง / ผู้รับ</b><b>ยอดสุทธิ</b><b>จัดการ</b></div>{reportOrders.map((order) => { const payment = allReportPayments.find((row) => row.orderId === order.id); const refunded = order.status === "refunded" || payment?.status === "refunded"; return <div className={refunded ? "refunded" : ""} key={order.id}><span>{order.orderNumber}{refunded && <small className="refund-badge">คืนเงินแล้ว</small>}</span><span>{order.tableId}</span><span>{dateTime(order.closedAt ?? order.updatedAt)}</span><span className="payment-record"><b>{paymentLabels[payment?.method ?? ""] ?? payment?.method ?? "—"}</b><small>{payment?.receivedByName ?? "—"} • อ้างอิง {payment?.referenceCode || order.receiptNumber || "—"}</small></span><strong>{refunded ? `−${money(order.total)}` : money(order.total)}</strong><span className="report-row-actions"><button type="button" onClick={() => onOpenReceipt(order.id)}><ReceiptText/> เปิด</button>{!refunded && reportShift.status === "open" && <button type="button" className="refund-button" onClick={() => setRefundOrderId(order.id)}><RotateCcw/> คืนเงิน</button>}</span></div>; })}{!reportOrders.length && <p>กะนี้ยังไม่มีรายการชำระเงิน</p>}</div>
      <footer>THE PBRU HERITAGE • ระบบ Hotel Central POS</footer>
    </article>}
    <article className="panel shift-history"><h3><FileText/> ประวัติกะ</h3><div>{shifts.slice(0, 30).map((shift) => <button type="button" className={`shift-history-row ${reportShiftId === shift.id ? "selected" : ""}`} onClick={() => setReportShiftId(shift.id)} key={shift.id}><span>{dateTime(shift.openedAt)}</span><b>{shift.status === "open" ? "กำลังเปิด" : "ปิดแล้ว"}</b><span>เริ่ม {money(shift.openingCash)}</span><span>คาด {money(shift.expectedCash)}</span><span>จริง {money(shift.closingCash)}</span><strong className={shift.difference < 0 ? "negative" : shift.difference > 0 ? "positive" : ""}>{shift.status === "closed" ? `ต่าง ${money(shift.difference)}` : "ดูรายงาน"}</strong></button>)}</div></article>
    {management && <DataProtectionPanel instructor={instructor}/>} 
    {refundOrder && <RefundApprovalModal order={refundOrder} payment={refundPayment} working={working} onClose={() => setRefundOrderId(null)} onConfirm={(values) => onAction({ action: "refundPayment", orderId: refundOrder.id, ...values })}/>} 
  </div>;
}

export function ReceiptModal({ order, items, payments = [], settings, printerSettings, printJobs, working, onRecordPrint, onClose }: { order: BillOrder; items: BillItem[]; payments?: Array<{ method: string; amount: number; status?: string; referenceCode?: string; receivedByName?: string; reversalReason?: string }>; settings: { promptPayId: string; promptPayName: string }; printerSettings: PrinterSettings; printJobs: PrintJob[]; working: boolean; onRecordPrint: (values: { reprintReason: string }) => Promise<boolean>; onClose: () => void }) {
  const [printedCount, setPrintedCount] = useState(Math.max(0, ...printJobs.map((job) => job.copyNumber)));
  const [reprintReason, setReprintReason] = useState("");
  useEffect(() => {
    document.body.classList.add("receipt-open");
    return () => document.body.classList.remove("receipt-open");
  }, []);
  async function printReceipt() {
    if (printedCount > 0 && !reprintReason.trim()) return;
    if (!await onRecordPrint({ reprintReason: reprintReason.trim() })) return;
    setPrintedCount((value) => value + 1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const previousTitle = document.title;
    document.title = `receipt-${order.receiptNumber ?? order.orderNumber}`;
    let restored = false;
    const restore = () => { if (restored) return; restored = true; document.title = previousTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
    window.setTimeout(restore, 1500);
  }
  const includesCash = order.paymentMethod?.split("+").includes("cash") ?? payments.some((payment) => payment.method === "cash");
  const promptPayPayload = isValidPromptPayId(settings.promptPayId) ? buildPromptPayPayload(settings.promptPayId, order.total) : "";
  const refunded = order.status === "refunded" || payments.some((payment) => payment.status === "refunded");
  const payment = payments[0];
  return <div className="modal-backdrop v1-modal-backdrop receipt-backdrop"><section className={`receipt-modal paper-${printerSettings.paperWidth}`}><header className="receipt-actions"><button onClick={onClose}><X/> ปิด</button><button className="primary" disabled={working || (printedCount > 0 && !reprintReason.trim())} onClick={() => void printReceipt()}><Printer/> {printedCount ? `พิมพ์ซ้ำ (${printedCount})` : "พิมพ์ / บันทึก PDF"}</button></header>{printedCount > 0 && <label className="receipt-reprint-reason"><span><RotateCcw/> เหตุผลการพิมพ์ซ้ำ</span><input maxLength={300} value={reprintReason} onChange={(event) => setReprintReason(event.target.value)} placeholder="เช่น กระดาษหมด หรือใบเดิมสูญหาย"/><small>ระบบจะบันทึกผู้พิมพ์ เวลา และเหตุผลไว้ในประวัติ</small></label>}<article className={`print-receipt ${refunded ? "receipt-refunded" : ""}`}>{refunded && <div className="receipt-refund-stamp">คืนเงินแล้ว</div>}<div className="receipt-brand"><h2>THE PBRU HERITAGE</h2><p>ร้านอาหารเพื่อการเรียนรู้ PBRU</p></div><div className="receipt-meta"><p><span>เลขที่ใบเสร็จ</span><b>{order.receiptNumber}</b></p><p><span>วันเวลา</span><b>{dateTime(order.closedAt ?? new Date().toISOString())}</b></p><p><span>ออเดอร์</span><b>{order.orderNumber}</b></p><p><span>โต๊ะ</span><b>{order.tableId}</b></p>{printedCount > 1 && <p><span>ฉบับพิมพ์</span><b>ครั้งที่ {printedCount} • สำเนา</b></p>}</div><div className="receipt-lines">{items.map((item) => <div key={item.id}><span>{item.quantity}×</span><p>{item.name}{item.optionSummary && <small>{item.optionSummary}</small>}</p><b>{money((item.unitPrice + item.optionPrice) * item.quantity)}</b></div>)}</div><div className="receipt-summary"><p><span>ยอดอาหาร</span><b>{money(order.subtotal)}</b></p>{order.discountAmount > 0 && <p><span>ส่วนลด</span><b>-{money(order.discountAmount)}</b></p>}{order.serviceChargeAmount > 0 && <p><span>ค่าบริการ</span><b>{money(order.serviceChargeAmount)}</b></p>}{order.vatAmount > 0 && <p><span>VAT</span><b>{money(order.vatAmount)}</b></p>}<p className="grand-total"><span>ยอดสุทธิ</span><strong>{money(order.total)}</strong></p>{payments.length ? payments.map((row) => <p key={row.method}><span>{paymentLabels[row.method] ?? row.method}</span><b>{money(row.amount)}</b></p>) : <p><span>ชำระโดย</span><b>{order.paymentMethod?.split("+").map((method) => paymentLabels[method] ?? method).join(" + ")}</b></p>}{payment?.receivedByName && <p><span>ผู้รับชำระ</span><b>{payment.receivedByName}</b></p>}{payment?.referenceCode && <p><span>เลขอ้างอิง</span><b>{payment.referenceCode}</b></p>}{includesCash && order.amountTendered > 0 && <p><span>รับเงินมา</span><b>{money(order.amountTendered)}</b></p>}{order.changeAmount > 0 && <p><span>เงินทอน</span><b>{money(order.changeAmount)}</b></p>}{refunded && payment?.reversalReason && <p className="refund-reason"><span>เหตุผลคืนเงิน</span><b>{payment.reversalReason}</b></p>}</div>{promptPayPayload && !refunded && <section className="promptpay-receipt"><h3>สแกนชำระด้วยพร้อมเพย์</h3><QRCodeSVG value={promptPayPayload} size={190} level="M" includeMargin/><strong>{money(order.total)}</strong><p>{settings.promptPayName}</p><small>{maskPromptPayId(settings.promptPayId)}</small><em>กรุณาตรวจสอบชื่อบัญชีและยอดเงิน • หากชำระแล้วไม่ต้องสแกนซ้ำ</em></section>}<footer><p>{refunded ? "เอกสารยืนยันการคืนเงิน" : "ขอบคุณที่ใช้บริการ"}</p><small>เอกสารจากระบบ Hotel Central POS{reprintReason ? ` • สำเนา: ${reprintReason}` : ""}</small></footer></article>{printJobs.length > 0 && <p className="receipt-print-history">ส่งหน้าต่างพิมพ์ล่าสุด {dateTime(printJobs[0].printedAt)} โดย {printJobs[0].printedByName}</p>}</section></div>;
}
