"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChefHat, Clock3, Copy, MapPin, MessageCircle, Navigation, PackageCheck, Phone, Send, Truck, UserRoundCheck } from "lucide-react";

export type DeliveryStatus = "pending" | "confirmed" | "preparing" | "out_for_delivery" | "near_arrival" | "delivered" | "cancelled";
export type DeliveryOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  building: string;
  deliveryPoint: string;
  note: string;
  status: DeliveryStatus;
  riderId: string | null;
  riderName: string | null;
  total: number;
  createdAt: string;
  updatedAt: string;
};
export type DeliveryOrderItem = { id: string; orderId: string; menuItemId: number; name: string; unitPrice: number; quantity: number };
type Action = (body: Record<string, unknown>) => Promise<boolean>;

const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const statusLabel: Record<DeliveryStatus, string> = {
  pending: "รอร้านยืนยัน",
  confirmed: "รับออเดอร์แล้ว",
  preparing: "กำลังเตรียม",
  out_for_delivery: "กำลังนำส่ง",
  near_arrival: "ใกล้ถึงแล้ว",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

function OrderDetails({ order, items }: { order: DeliveryOrder; items: DeliveryOrderItem[] }) {
  const orderItems = items.filter((item) => item.orderId === order.id);
  return <>
    <header><div><b>{order.orderNumber}</b><span className={`delivery-status ${order.status}`}>{statusLabel[order.status]}</span></div><small><Clock3/>{new Date(order.createdAt).toLocaleString("th-TH")}</small></header>
    <div className="delivery-customer"><h4>{order.customerName}</h4><a href={`tel:${order.phone}`}><Phone/> {order.phone}</a><p><MapPin/>{order.building}<br/><span>{order.deliveryPoint}</span></p>{order.riderName && <p className="delivery-rider"><UserRoundCheck/> ผู้ส่ง: {order.riderName}</p>}{order.note && <em>หมายเหตุ: {order.note}</em>}</div>
    <div className="delivery-order-lines">{orderItems.map((item) => <div key={item.id}><span>{item.quantity}×</span><p>{item.name}</p><b>{money(item.unitPrice * item.quantity)}</b></div>)}</div>
  </>;
}

export default function DeliveryManagement({ orders, items, lineGroupUrl, working, onAction }: { orders: DeliveryOrder[]; items: DeliveryOrderItem[]; lineGroupUrl: string; working: boolean; onAction: Action }) {
  const [lineUrl, setLineUrl] = useState(lineGroupUrl);
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { setLineUrl(lineGroupUrl); setDeliveryUrl(`${window.location.origin}/delivery`); }, [lineGroupUrl]);
  const qrSrc = deliveryUrl ? `https://quickchart.io/qr?text=${encodeURIComponent(deliveryUrl)}&size=280&margin=2&dark=123f3b&light=ffffff` : "";
  const active = useMemo(() => orders.filter((order) => !["delivered", "cancelled"].includes(order.status)), [orders]);

  async function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onAction({ action: "setDeliverySettings", lineGroupUrl: lineUrl })) setMessage("บันทึกลิงก์กลุ่ม LINE แล้ว");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(deliveryUrl);
    setMessage("คัดลอกลิงก์หน้าสั่งอาหารแล้ว");
  }

  return <div className="content management-page delivery-management"><div className="management-heading"><div><p className="eyebrow">CAMPUS DELIVERY</p><h2>ออเดอร์เดลิเวอรีในมหาวิทยาลัย</h2><p>QR เดียวสำหรับลูกค้า เมนู ราคา และสถานะจะอัปเดตจากระบบกลางอัตโนมัติ</p></div><span className="delivery-live-count"><i/>{active.length} ออเดอร์กำลังดำเนินการ</span></div>{message && <div className="notice">{message}</div>}
    <section className="delivery-admin-top"><article className="panel qr-panel"><div><p className="eyebrow">CUSTOMER QR</p><h3>สแกนเพื่อสั่งอาหาร</h3><p>นำ QR นี้ไปพิมพ์ ติดโต๊ะประชาสัมพันธ์ หรือส่งให้นักศึกษา</p></div>{qrSrc && <img src={qrSrc} alt="QR Code สำหรับสั่งเดลิเวอรี"/>}<code>{deliveryUrl}</code><button onClick={() => void copyLink()}><Copy/> คัดลอกลิงก์</button></article>
      <article className="panel line-panel"><span><MessageCircle/></span><div><p className="eyebrow">LINE COMMUNITY</p><h3>กลุ่ม LINE สำหรับลูกค้า</h3><p>ใส่ลิงก์เชิญกลุ่ม LINE ครั้งเดียว ปุ่มเข้ากลุ่มจะแสดงในหน้าลูกค้าและหน้าติดตาม</p></div><form onSubmit={saveLine}><label><span>ลิงก์เชิญกลุ่ม LINE</span><input type="url" value={lineUrl} onChange={(event) => setLineUrl(event.target.value)} placeholder="https://line.me/ti/g/..."/></label><button className="primary" disabled={working}><Check/> บันทึกลิงก์</button></form>{lineGroupUrl && <a href={lineGroupUrl} target="_blank" rel="noreferrer"><MessageCircle/> ทดลองเปิดกลุ่ม LINE</a>}</article>
    </section>
    <section className="delivery-board"><div className="delivery-board-head"><div><p className="eyebrow">LIVE ORDERS</p><h3>คิวเดลิเวอรี</h3></div><span>อัปเดตอัตโนมัติทุก 4 วินาที</span></div><div className="delivery-order-grid">{active.map((order) => <article className={`delivery-order-card ${order.status}`} key={order.id}><OrderDetails order={order} items={items}/><footer><strong>{money(order.total)}</strong><div>{order.status === "pending" && <button disabled={working} onClick={() => void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "confirmed" })}><PackageCheck/> รับออเดอร์</button>}{order.status === "confirmed" && <button disabled={working} onClick={() => void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "preparing" })}><ChefHat/> เริ่มเตรียม</button>}{order.status === "preparing" && <span className="waiting-rider"><Truck/> รอนักศึกษารับงาน</span>}{order.status === "out_for_delivery" && <button disabled={working} onClick={() => void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "near_arrival" })}><Navigation/> ใกล้ถึงแล้ว</button>}{order.status === "near_arrival" && <button disabled={working} onClick={() => void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "delivered" })}><Check/> ส่งสำเร็จ</button>}{order.status === "pending" && <button className="cancel" disabled={working} onClick={() => { if (window.confirm("ยกเลิกออเดอร์นี้ใช่หรือไม่")) void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "cancelled" }); }}>ยกเลิก</button>}</div></footer></article>)}{!active.length && <div className="wide-empty"><Send/><h3>ยังไม่มีออเดอร์เดลิเวอรี</h3><p>เมื่อลูกค้าสแกน QR และยืนยัน ออเดอร์จะปรากฏที่นี่</p></div>}</div></section>
  </div>;
}

export function DeliveryRider({ profileId, orders, items, working, onAction }: { profileId: string; orders: DeliveryOrder[]; items: DeliveryOrderItem[]; working: boolean; onAction: Action }) {
  const mine = orders.filter((order) => order.riderId === profileId && ["out_for_delivery", "near_arrival"].includes(order.status));
  const available = orders.filter((order) => order.status === "preparing" && !order.riderId);
  return <div className="content delivery-rider-page">
    <section className="rider-hero"><span><Truck/></span><div><p className="eyebrow">STUDENT DELIVERY</p><h2>งานส่งอาหารของฉัน</h2><p>รับงานเมื่ออาหารพร้อม แล้วแจ้งลูกค้าว่าใกล้ถึงหรือส่งเรียบร้อยได้จากโทรศัพท์</p></div><b><i/> อัปเดตทุก 4 วินาที</b></section>
    <section className="rider-section"><div className="delivery-board-head"><div><p className="eyebrow">MY DELIVERY</p><h3>กำลังนำส่ง ({mine.length})</h3></div></div><div className="delivery-order-grid rider-grid">{mine.map((order) => <article className={`delivery-order-card ${order.status}`} key={order.id}><OrderDetails order={order} items={items}/><footer><strong>{money(order.total)}</strong><div>{order.status === "out_for_delivery" && <button disabled={working} onClick={() => void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "near_arrival" })}><Navigation/> ใกล้ถึงแล้ว</button>}{order.status === "near_arrival" && <button disabled={working} onClick={() => { if (window.confirm("ยืนยันว่าส่งอาหารให้ลูกค้าเรียบร้อยแล้ว")) void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "delivered" }); }}><Check/> ส่งอาหารแล้ว</button>}</div></footer></article>)}{!mine.length && <div className="rider-empty"><Navigation/><b>ยังไม่มีงานที่กำลังนำส่ง</b><p>เลือกงานที่อาหารพร้อมจากรายการด้านล่าง</p></div>}</div></section>
    <section className="rider-section"><div className="delivery-board-head"><div><p className="eyebrow">READY TO PICK UP</p><h3>งานรอรับ ({available.length})</h3></div></div><div className="delivery-order-grid rider-grid">{available.map((order) => <article className="delivery-order-card preparing" key={order.id}><OrderDetails order={order} items={items}/><footer><strong>{money(order.total)}</strong><button disabled={working} onClick={() => { if (window.confirm(`รับงาน ${order.orderNumber} และเริ่มนำส่งใช่หรือไม่`)) void onAction({ action: "setDeliveryStatus", orderId: order.id, status: "out_for_delivery" }); }}><Truck/> รับงานและออกส่ง</button></footer></article>)}{!available.length && <div className="rider-empty"><PackageCheck/><b>ยังไม่มีอาหารพร้อมส่ง</b><p>เมื่อครัวเตรียมออเดอร์แล้ว งานจะปรากฏอัตโนมัติ</p></div>}</div></section>
  </div>;
}
