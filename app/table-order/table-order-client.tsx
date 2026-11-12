"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  BellRing,
  ChefHat,
  CheckCircle2,
  ChevronUp,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Send,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  X,
} from "lucide-react";

type Table = { id: number; number: number; zone: string; seats: number; status: string };
type MenuItem = { id: number; name: string; category: string; price: number; description: string; available: boolean; imageUrl: string | null };
type Order = { id: string; orderNumber: string; status: string; subtotal: number; discountAmount: number; serviceChargeAmount: number; vatAmount: number; total: number };
type OrderItem = { id: string; menuItemId: number; name: string; unitPrice: number; optionSummary: string; optionPrice: number; note: string; quantity: number; status: string };
type ServiceRequest = { id: string; type: "waiter" | "bill"; status: "open" | "acknowledged" };
type Snapshot = { table: Table; menu: MenuItem[]; order: Order | null; items: OrderItem[]; requests: ServiceRequest[] };

const money = (value: number) => new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 0,
}).format(value / 100);

export default function TableOrderClient() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [category, setCategory] = useState("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [itemOption, setItemOption] = useState("");
  const [itemNote, setItemNote] = useState("");

  const load = useCallback(async (value: string, quiet = false) => {
    if (!value) return;
    try {
      const response = await fetch(`/api/table-order?token=${encodeURIComponent(value)}`, { cache: "no-store" });
      const payload = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "เปิดเมนูโต๊ะไม่สำเร็จ");
      setData(payload);
      if (!quiet) setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เชื่อมต่อร้านไม่ได้");
    }
  }, []);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    const initial = window.setTimeout(() => void load(value), 0);
    const interval = window.setInterval(() => void load(value, true), 4000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  async function act(body: Record<string, unknown>, success?: string) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/table-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, token, clientRequestId: crypto.randomUUID() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "ทำรายการไม่สำเร็จ");
      await load(token, true);
      if (success) setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setWorking(false);
    }
  }

  const categories = ["ทั้งหมด", ...Array.from(new Set(data?.menu.map((item) => item.category) ?? []))];
  const menu = data?.menu.filter((item) => {
    const matchesCategory = category === "ทั้งหมด" || item.category === category;
    const query = search.trim().toLocaleLowerCase("th-TH");
    const matchesSearch = !query || `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase("th-TH").includes(query);
    return matchesCategory && matchesSearch;
  }) ?? [];
  const draftItems = data?.items.filter((item) => item.status === "draft") ?? [];
  const sentItems = data?.items.filter((item) => item.status !== "draft") ?? [];
  const waiterRequest = data?.requests.find((request) => request.type === "waiter");
  const billRequest = data?.requests.find((request) => request.type === "bill");
  const activeServiceCount = Number(Boolean(waiterRequest)) + Number(Boolean(billRequest));
  const total = data?.order?.total ?? 0;
  const itemCount = data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const draftCount = draftItems.reduce((sum, item) => sum + item.quantity, 0);
  const draftQuantities = useMemo(() => new Map(draftItems.map((item) => [item.menuItemId, item.quantity])), [draftItems]);

  if (!data) {
    return <main className="table-order-loading">
      <ChefHat />
      <h1>{error || "กำลังเปิดเมนูประจำโต๊ะ"}</h1>
      <p>THE PBRU HERITAGE</p>
    </main>;
  }

  const requestWaiter = () => void act(
    { action: "serviceRequest", type: "waiter" },
    "แจ้งพนักงานแล้ว กรุณารอสักครู่",
  );
  const requestBill = () => void act(
    { action: "serviceRequest", type: "bill" },
    "แจ้งคิดเงินแล้ว พนักงานกำลังมา",
  );

  function openCustomizer(item: MenuItem) { setCustomizing(item); setEditingItem(null); setItemOption(""); setItemNote(""); }
  function openItemEditor(item: OrderItem) { setEditingItem(item); setCustomizing(null); setItemOption(item.optionSummary); setItemNote(item.note); }
  async function saveCustomization(event: FormEvent) {
    event.preventDefault();
    const ok = customizing
      ? await act({ action: "addItem", menuItemId: customizing.id, optionSummary: itemOption, note: itemNote }, `เพิ่ม ${customizing.name} แล้ว`)
      : editingItem ? await act({ action: "updateItemDetails", itemId: editingItem.id, optionSummary: itemOption, note: itemNote }, "บันทึกรายละเอียดแล้ว") : false;
    if (ok) { setCustomizing(null); setEditingItem(null); setItemOption(""); setItemNote(""); }
  }

  return <main className="table-order-public">
    <header className="table-mobile-header">
      <div className="table-brand">
        <span><ChefHat /></span>
        <div>
          <b>THE PBRU HERITAGE</b>
          <small>ร้านอาหารเพื่อการเรียนรู้ PBRU</small>
        </div>
      </div>
      <button
        className={waiterRequest ? "requested" : ""}
        disabled={Boolean(waiterRequest) || working}
        onClick={requestWaiter}
        aria-label="เรียกพนักงาน"
      >
        <BellRing />
        {activeServiceCount > 0 && <b className="customer-request-badge">{activeServiceCount}</b>}
      </button>
    </header>

    <section className="table-order-hero">
      <div className="table-order-table-icon"><Armchair /></div>
      <div>
        <p className="eyebrow">สั่งอาหารประจำโต๊ะ</p>
        <h1>โต๊ะ {data.table.number}</h1>
        <p>{data.table.zone} • {data.table.seats} ที่นั่ง</p>
      </div>
      <button onClick={() => setCartOpen(true)}>
        <ShoppingBag />
        <span>รายการสั่ง</span>
        <b>{itemCount}</b>
      </button>
    </section>

    <section className="table-order-quick-actions">
      <button
        className={waiterRequest ? "requested" : ""}
        disabled={Boolean(waiterRequest) || working}
        onClick={requestWaiter}
      >
        <span className="customer-action-icon"><BellRing />{waiterRequest && <b className="customer-request-badge">1</b>}</span>
        <span>{waiterRequest ? waiterRequest.status === "acknowledged" ? "พนักงานรับเรื่องแล้ว" : "กำลังเรียกพนักงาน" : "เรียกพนักงาน"}</span>
      </button>
      <button onClick={() => setCartOpen(true)}>
        <ShoppingCart />
        <span>ดูรายการสั่ง</span>
      </button>
      <button
        className={billRequest ? "requested" : ""}
        disabled={Boolean(billRequest) || working || !data.order || Boolean(draftItems.length)}
        onClick={requestBill}
      >
        <span className="customer-action-icon"><ReceiptText />{billRequest && <b className="customer-request-badge">1</b>}</span>
        <span>{billRequest ? billRequest.status === "acknowledged" ? "พนักงานรับเรื่องแล้ว" : "กำลังขอคิดเงิน" : draftItems.length ? "ส่งครัวก่อน" : "คิดเงิน"}</span>
      </button>
    </section>

    {(waiterRequest || billRequest) && <section className="customer-service-status" aria-live="polite">
      {waiterRequest && <div className={waiterRequest.status}><span><BellRing/><b>1</b></span><p><strong>{waiterRequest.status === "acknowledged" ? "พนักงานรับเรื่องแล้ว" : "กำลังเรียกพนักงาน"}</strong><small>{waiterRequest.status === "acknowledged" ? "พนักงานกำลังไปที่โต๊ะ กรุณารอสักครู่" : "ระบบส่งสัญญาณไปยังพนักงานและผู้ควบคุมแล้ว"}</small></p></div>}
      {billRequest && <div className={billRequest.status}><span><ReceiptText/><b>1</b></span><p><strong>{billRequest.status === "acknowledged" ? "พนักงานรับเรื่องคิดเงินแล้ว" : "กำลังขอคิดเงิน"}</strong><small>{billRequest.status === "acknowledged" ? "พนักงานกำลังนำบิลไปให้ที่โต๊ะ" : "ระบบส่งสัญญาณไปยังแคชเชียร์และผู้ควบคุมแล้ว"}</small></p></div>}
    </section>}

    {error && <div className="table-order-alert error">
      {error}<button onClick={() => setError("")} aria-label="ปิดข้อความ"><X /></button>
    </div>}
    {message && <div className="table-order-alert success">
      <CheckCircle2 />{message}<button onClick={() => setMessage("")} aria-label="ปิดข้อความ"><X /></button>
    </div>}

    <nav className="table-order-categories" aria-label="หมวดอาหาร">
      {categories.map((value) => <button
        key={value}
        className={category === value ? "active" : ""}
        onClick={() => setCategory(value)}
      >
        {value === "ทั้งหมด" && <UtensilsCrossed />}
        {value}
      </button>)}
    </nav>

    <div className="table-order-layout">
      <section className="table-order-menu">
        <label className="table-order-search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาเมนูอาหาร..."
            aria-label="ค้นหาเมนูอาหาร"
          />
          {search && <button onClick={() => setSearch("")} aria-label="ล้างคำค้น"><X /></button>}
        </label>

        <div className="table-menu-heading">
          <div>
            <p className="eyebrow">เมนูอาหาร</p>
            <h2>{category}</h2>
          </div>
          <span>{menu.length} เมนู</span>
        </div>

        <div className="table-order-menu-grid">
          {menu.map((item) => {
            const quantity = draftQuantities.get(item.id) ?? 0;
            return <article className={!item.available ? "unavailable" : ""} key={item.id}>
              <button
                className="table-food-photo"
                disabled={!item.available || working}
                onClick={() => openCustomizer(item)}
                aria-label={`เพิ่ม ${item.name}`}
              >
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <ChefHat />}
                {!item.available && <span>หมดชั่วคราว</span>}
                {quantity > 0 && <b>{quantity}</b>}
              </button>
              <div className="table-food-info">
                <small>{item.category}</small>
                <h3>{item.name}</h3>
                <p>{item.description || "เมนูแนะนำของห้องอาหาร"}</p>
                <div>
                  <strong>{money(item.price)}</strong>
                  <button
                    disabled={!item.available || working}
                    onClick={() => openCustomizer(item)}
                    aria-label={`เพิ่ม ${item.name}`}
                  >
                    <Plus />
                  </button>
                </div>
              </div>
            </article>;
          })}
          {!menu.length && <div className="table-menu-empty">
            <Search />
            <b>ไม่พบเมนูที่ค้นหา</b>
            <p>ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่น</p>
          </div>}
        </div>
      </section>

      {cartOpen && <button className="table-cart-backdrop" onClick={() => setCartOpen(false)} aria-label="ปิดรายการสั่ง" />}
      <aside className={`table-order-ticket ${cartOpen ? "mobile-open" : ""}`}>
        <div className="table-ticket-head">
          <div>
            <p className="eyebrow">รายการสั่ง • โต๊ะ {data.table.number}</p>
            <h2>{data.order?.orderNumber ?? "รายการของคุณ"}</h2>
          </div>
          <button className="table-ticket-close" onClick={() => setCartOpen(false)} aria-label="ปิดรายการสั่ง"><X /></button>
        </div>

        <div className="table-ticket-items">
          {draftItems.map((item) => <div className="editable" key={item.id}>
            <div className="table-line-name">
              <b>{item.name}</b>
              {item.optionSummary && <small className="item-option">{item.optionSummary}</small>}
              {item.note && <small className="item-note">หมายเหตุ: {item.note}</small>}
              <small>ยังไม่ส่งครัว</small>
              <button className="customer-edit-item" onClick={() => openItemEditor(item)}>แก้ตัวเลือก/หมายเหตุ</button>
            </div>
            <span className="quantity-control">
              <button disabled={working} onClick={() => void act({ action: "setQuantity", itemId: item.id, quantity: item.quantity - 1 })}><Minus /></button>
              <b>{item.quantity}</b>
              <button disabled={working} onClick={() => void act({ action: "setQuantity", itemId: item.id, quantity: item.quantity + 1 })}><Plus /></button>
            </span>
            <strong>{money((item.unitPrice + item.optionPrice) * item.quantity)}</strong>
            <button
              className="table-line-remove"
              disabled={working}
              onClick={() => void act({ action: "setQuantity", itemId: item.id, quantity: 0 })}
              aria-label={`ลบ ${item.name}`}
            ><X /></button>
          </div>)}
          {sentItems.map((item) => <div className="sent" key={item.id}>
            <span>{item.quantity}×</span>
            <div>
              <b>{item.name}</b>
              {item.optionSummary && <small className="item-option">{item.optionSummary}</small>}
              {item.note && <small className="item-note">หมายเหตุ: {item.note}</small>}
              <small>ส่งเข้าครัวแล้ว</small>
            </div>
            <strong>{money((item.unitPrice + item.optionPrice) * item.quantity)}</strong>
          </div>)}
          {!data.items.length && <div className="table-ticket-empty">
            <ShoppingBag />
            <p>ยังไม่มีรายการ<br />เลือกเมนูเพื่อเริ่มสั่งอาหาร</p>
          </div>}
        </div>

        {(data.order?.discountAmount || data.order?.serviceChargeAmount || data.order?.vatAmount) ? <div className="customer-bill-breakdown"><p><span>ยอดอาหาร</span><b>{money(data.order.subtotal)}</b></p>{data.order.discountAmount > 0 && <p><span>ส่วนลด</span><b>-{money(data.order.discountAmount)}</b></p>}{data.order.serviceChargeAmount > 0 && <p><span>ค่าบริการ</span><b>{money(data.order.serviceChargeAmount)}</b></p>}{data.order.vatAmount > 0 && <p><span>VAT</span><b>{money(data.order.vatAmount)}</b></p>}</div> : null}
        <div className="table-ticket-total">
          <span>ยอดสุทธิ <small>{itemCount} รายการ</small></span>
          <strong>{money(total)}</strong>
        </div>
        <button
          className="table-send"
          disabled={!draftItems.length || working}
          onClick={() => {
            if (window.confirm("ยืนยันส่งรายการใหม่เข้าครัวใช่หรือไม่")) {
              void act({ action: "sendKitchen" }, "ส่งรายการเข้าครัวแล้ว");
            }
          }}
        >
          <Send /> ส่งเข้าครัว ({draftCount})
        </button>
        <div className="table-service-buttons">
          <button className={waiterRequest ? "requested" : ""} disabled={Boolean(waiterRequest) || working} onClick={requestWaiter}>
            <span className="customer-action-icon"><BellRing />{waiterRequest && <b className="customer-request-badge">1</b>}</span>
            {waiterRequest ? waiterRequest.status === "acknowledged" ? "พนักงานรับเรื่องแล้ว" : "กำลังเรียกพนักงาน" : "เรียกพนักงาน"}
          </button>
          <button className={billRequest ? "requested" : ""} disabled={Boolean(billRequest) || working || !data.order || Boolean(draftItems.length)} onClick={requestBill}>
            <span className="customer-action-icon"><ReceiptText />{billRequest && <b className="customer-request-badge">1</b>}</span>
            {billRequest ? billRequest.status === "acknowledged" ? "พนักงานรับเรื่องแล้ว" : "กำลังขอคิดเงิน" : draftItems.length ? "ส่งรายการเข้าครัวก่อน" : "เรียกคิดเงิน"}
          </button>
        </div>
        <p className="table-ticket-note">รายการที่ส่งครัวแล้ว หากต้องการยกเลิกหรือแก้ไข กรุณากดเรียกพนักงาน</p>
      </aside>
    </div>

    <button className="table-mobile-cart-bar" onClick={() => setCartOpen(true)}>
      <span className="table-cart-icon"><ShoppingCart />{itemCount > 0 && <b>{itemCount}</b>}</span>
      <span><b>รายการสั่ง</b><small>{draftCount ? `${draftCount} รายการรอส่งครัว` : itemCount ? "ดูสถานะรายการ" : "แตะเพื่อดูรายการ"}</small></span>
      <strong>{money(total)}</strong>
      <ChevronUp />
    </button>

    {(customizing || editingItem) && <div className="modal-backdrop customer-item-backdrop"><form className="customer-item-modal" onSubmit={saveCustomization}><header><div><p className="eyebrow">รายละเอียดเมนู</p><h2>{customizing?.name ?? editingItem?.name}</h2></div><button type="button" onClick={() => { setCustomizing(null); setEditingItem(null); }}><X/></button></header><label><span>ตัวเลือก</span><input value={itemOption} onChange={(event) => setItemOption(event.target.value)} placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก, พิเศษ" maxLength={160}/></label><label><span>หมายเหตุถึงครัว</span><textarea value={itemNote} onChange={(event) => setItemNote(event.target.value)} placeholder="เช่น แพ้ถั่ว กรุณาแยกน้ำซอส" maxLength={300}/></label><small>หากไม่มีตัวเลือก สามารถเว้นว่างแล้วกดเพิ่มได้</small><footer><button type="button" className="secondary" onClick={() => { setCustomizing(null); setEditingItem(null); }}>ยกเลิก</button><button className="primary" disabled={working}>{customizing ? "เพิ่มลงรายการ" : "บันทึก"}</button></footer></form></div>}

    <footer>THE PBRU HERITAGE • Phetchaburi Rajabhat University</footer>
  </main>;
}
