"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChefHat, Clock3, MapPin, MessageCircle, Minus, Navigation, PackageCheck, Phone, Plus, Send, ShoppingBag, Truck, UserRound, Volume2, VolumeX } from "lucide-react";

type MenuItem = { id: number; name: string; category: string; price: number; description: string; imageUrl: string | null };
type DeliveryData = { menu: MenuItem[]; lineGroupUrl: string };
type TrackingStatus = "pending" | "confirmed" | "preparing" | "out_for_delivery" | "near_arrival" | "delivered" | "cancelled";
type TrackingOrder = {
  orderNumber: string;
  customerName: string;
  building: string;
  deliveryPoint: string;
  note: string;
  status: TrackingStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  pickedUpAt: string | null;
  nearArrivalAt: string | null;
  deliveredAt: string | null;
  riderName: string | null;
  items: { id: string; name: string; unitPrice: number; quantity: number }[];
};

const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const trackingSteps = [
  { status: "pending", label: "ส่งออเดอร์แล้ว", icon: Clock3 },
  { status: "confirmed", label: "ร้านรับออเดอร์", icon: PackageCheck },
  { status: "preparing", label: "กำลังเตรียมอาหาร", icon: ChefHat },
  { status: "out_for_delivery", label: "กำลังนำส่ง", icon: Truck },
  { status: "near_arrival", label: "ใกล้ถึงแล้ว", icon: Navigation },
  { status: "delivered", label: "ส่งเรียบร้อย", icon: Check },
] as const;

export default function DeliveryClient() {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [category, setCategory] = useState("ทั้งหมด");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [building, setBuilding] = useState("");
  const [deliveryPoint, setDeliveryPoint] = useState("");
  const [note, setNote] = useState("");
  const [campusConfirmed, setCampusConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [trackingToken, setTrackingToken] = useState("");
  const [tracking, setTracking] = useState<TrackingOrder | null>(null);
  const [trackingSoundEnabled, setTrackingSoundEnabled] = useState(false);
  const [trackingSoundReady, setTrackingSoundReady] = useState(false);
  const trackingAudioRef = useRef<AudioContext | null>(null);
  const previousTrackingStatusRef = useRef<TrackingStatus | null>(null);
  const trackingSoundReadyRef = useRef(false);

  function playTrackingTone(status: TrackingStatus | "test") {
    const context = trackingAudioRef.current;
    if (!context || context.state !== "running" || !trackingSoundReadyRef.current) return;
    const frequencies = status === "near_arrival" ? [784, 988, 1175] : status === "delivered" ? [659, 784, 988] : status === "cancelled" ? [392, 330] : [523, 659];
    let start = context.currentTime + .015;
    for (const frequency of frequencies) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = status === "cancelled" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.16, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .13);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + .15);
      start += .17;
    }
  }

  async function enableTrackingSound(playTest = true) {
    const context = trackingAudioRef.current ?? new AudioContext();
    trackingAudioRef.current = context;
    if (context.state !== "running") await context.resume();
    const ready = context.state === "running";
    trackingSoundReadyRef.current = ready;
    setTrackingSoundReady(ready);
    setTrackingSoundEnabled(ready);
    if (ready) {
      window.localStorage.setItem("hotel-central-tracking-sound", "on");
      if (playTest) playTrackingTone("test");
    }
  }

  function toggleTrackingSound() {
    if (trackingSoundReadyRef.current) {
      trackingSoundReadyRef.current = false;
      setTrackingSoundReady(false);
      setTrackingSoundEnabled(false);
      window.localStorage.setItem("hotel-central-tracking-sound", "off");
      void trackingAudioRef.current?.suspend();
    } else {
      void enableTrackingSound(true);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryToken = new URLSearchParams(window.location.search).get("track") ?? "";
      const storedToken = window.localStorage.getItem("hotel-central-delivery-tracking") ?? "";
      if (queryToken || storedToken) setTrackingToken(queryToken || storedToken);
      if (window.localStorage.getItem("hotel-central-tracking-sound") === "on") setTrackingSoundEnabled(true);
      fetch("/api/delivery", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as DeliveryData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "โหลดเมนูไม่สำเร็จ");
        setData(payload);
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "เชื่อมต่อร้านไม่ได้"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!trackingToken) return;
    let active = true;
    const loadTracking = () => fetch(`/api/delivery?track=${encodeURIComponent(trackingToken)}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { tracking?: TrackingOrder; error?: string };
      if (!response.ok || !payload.tracking) throw new Error(payload.error ?? "โหลดสถานะไม่สำเร็จ");
      if (active) { setTracking(payload.tracking); setError(""); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "โหลดสถานะไม่สำเร็จ"); });
    void loadTracking();
    const timer = window.setInterval(() => void loadTracking(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [trackingToken]);

  useEffect(() => {
    if (!trackingToken || !trackingSoundEnabled || trackingSoundReady) return;
    const activate = () => { void enableTrackingSound(false); };
    window.addEventListener("pointerdown", activate, { once: true });
    window.addEventListener("keydown", activate, { once: true });
    return () => { window.removeEventListener("pointerdown", activate); window.removeEventListener("keydown", activate); };
  }, [trackingToken, trackingSoundEnabled, trackingSoundReady]);

  useEffect(() => {
    if (!tracking) return;
    const previous = previousTrackingStatusRef.current;
    previousTrackingStatusRef.current = tracking.status;
    if (previous && previous !== tracking.status) playTrackingTone(tracking.status);
  }, [tracking]);

  const categories = ["ทั้งหมด", ...Array.from(new Set(data?.menu.map((item) => item.category) ?? []))];
  const menu = data?.menu.filter((item) => category === "ทั้งหมด" || item.category === category) ?? [];
  const selected = useMemo(() => data?.menu.filter((item) => (cart[item.id] ?? 0) > 0) ?? [], [cart, data]);
  const itemCount = selected.reduce((sum, item) => sum + cart[item.id], 0);
  const total = selected.reduce((sum, item) => sum + item.price * cart[item.id], 0);

  function change(itemId: number, delta: number) {
    setCart((current) => {
      const quantity = Math.max(0, Math.min(20, (current[itemId] ?? 0) + delta));
      const next = { ...current, [itemId]: quantity };
      if (!quantity) delete next[itemId];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await enableTrackingSound(false).catch(() => undefined);
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName, phone, building, deliveryPoint, note, campusConfirmed, items: selected.map((item) => ({ menuItemId: item.id, quantity: cart[item.id] })) }) });
      const payload = await response.json() as { ok?: boolean; error?: string; trackingToken?: string };
      if (!response.ok || !payload.trackingToken) throw new Error(payload.error ?? "ส่งออเดอร์ไม่สำเร็จ");
      window.localStorage.setItem("hotel-central-delivery-tracking", payload.trackingToken);
      window.history.replaceState({}, "", `/delivery?track=${encodeURIComponent(payload.trackingToken)}`);
      setTrackingToken(payload.trackingToken);
      setCart({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งออเดอร์ไม่สำเร็จ");
    } finally { setWorking(false); }
  }

  function startNewOrder() {
    window.localStorage.removeItem("hotel-central-delivery-tracking");
    window.history.replaceState({}, "", "/delivery");
    setTrackingToken("");
    setTracking(null);
    setCustomerName("");
    setPhone("");
    setBuilding("");
    setDeliveryPoint("");
    setNote("");
    setCampusConfirmed(false);
  }

  if (trackingToken) return <TrackingPage tracking={tracking} error={error} lineGroupUrl={data?.lineGroupUrl ?? ""} soundEnabled={trackingSoundEnabled} soundReady={trackingSoundReady} onToggleSound={toggleTrackingSound} onNewOrder={startNewOrder}/>;

  return <main className="delivery-public">
    <header className="delivery-header"><div><span className="delivery-logo">H</span><div><b>Hotel Central Delivery</b><small>มหาวิทยาลัยราชภัฏเพชรบุรี</small></div></div>{data?.lineGroupUrl && <a href={data.lineGroupUrl} target="_blank" rel="noreferrer"><MessageCircle/> กลุ่ม LINE</a>}</header>
    <section className="delivery-hero"><div><span><MapPin/> CAMPUS DELIVERY</span><h1>อร่อยถึงอาคาร<br/>สั่งง่ายจากมือถือ</h1><p>บริการจัดส่งเฉพาะภายในมหาวิทยาลัยราชภัฏเพชรบุรี</p></div><ChefHat/></section>
    {error && <div className="delivery-error">{error}<button onClick={() => setError("")}>×</button></div>}
    <div className="delivery-layout"><section className="delivery-menu"><div className="delivery-section-title"><div><p className="eyebrow">OUR MENU</p><h2>เลือกเมนูอาหาร</h2></div><span>{data?.menu.length ?? 0} เมนู</span></div><div className="delivery-categories">{categories.map((value) => <button className={category === value ? "active" : ""} key={value} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="delivery-menu-grid">{menu.map((item) => <article key={item.id}><div className="delivery-food-photo">{item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <ChefHat/>}<span>{item.category}</span></div><div className="delivery-food-copy"><h3>{item.name}</h3><p>{item.description || "เมนูแนะนำจากห้องอาหารโรงแรม"}</p><div><strong>{money(item.price)}</strong>{cart[item.id] ? <span className="quantity-control"><button onClick={() => change(item.id, -1)}><Minus/></button><b>{cart[item.id]}</b><button onClick={() => change(item.id, 1)}><Plus/></button></span> : <button className="add-food" onClick={() => change(item.id, 1)}><Plus/> เพิ่ม</button>}</div></div></article>)}</div></section>
      <aside className="delivery-cart"><div className="delivery-cart-title"><span><ShoppingBag/></span><div><p className="eyebrow">YOUR ORDER</p><h2>รายการสั่งซื้อ</h2></div><b>{itemCount}</b></div><div className="delivery-cart-items">{selected.map((item) => <div key={item.id}><span>{cart[item.id]}×</span><p>{item.name}<small>{money(item.price)}</small></p><strong>{money(item.price * cart[item.id])}</strong></div>)}{!selected.length && <div className="delivery-empty"><ShoppingBag/><p>เลือกเมนูที่ต้องการ<br/>รายการจะปรากฏตรงนี้</p></div>}</div><div className="delivery-cart-total"><span>ยอดรวม</span><strong>{money(total)}</strong></div>
        <form className="delivery-form" onSubmit={submit}><h3>ข้อมูลผู้รับอาหาร</h3><label><span><UserRound/> ชื่อผู้สั่ง</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={80} required/></label><label><span><Phone/> เบอร์ติดต่อ</span><input type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08XXXXXXXX" maxLength={12} required/></label><label><span><MapPin/> อาคาร / ตึกในมหาวิทยาลัย</span><input value={building} onChange={(event) => setBuilding(event.target.value)} placeholder="เช่น อาคาร 7 คณะวิทยาการจัดการ" maxLength={120} required/></label><label><span>ห้องหรือจุดรับอาหาร</span><input value={deliveryPoint} onChange={(event) => setDeliveryPoint(event.target.value)} placeholder="เช่น ห้อง 742 ชั้น 4 / หน้าอาคาร" maxLength={160} required/></label><label><span>หมายเหตุถึงร้าน</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="ไม่เผ็ด, ไม่ใส่ผัก ฯลฯ" maxLength={300}/></label><label className="campus-check"><input type="checkbox" checked={campusConfirmed} onChange={(event) => setCampusConfirmed(event.target.checked)} required/><span><b>ยืนยันจุดรับภายในมหาวิทยาลัย</b><small>บริการนี้รับส่งเฉพาะมหาวิทยาลัยราชภัฏเพชรบุรี</small></span></label><button className="delivery-submit" disabled={!itemCount || !campusConfirmed || working}><Send/>{working ? "กำลังส่งออเดอร์…" : `ยืนยันสั่งอาหาร • ${money(total)}`}</button></form>
      </aside></div>
    <footer className="delivery-footer">Hotel Central POS • University Training Restaurant</footer>
  </main>;
}

function TrackingPage({ tracking, error, lineGroupUrl, soundEnabled, soundReady, onToggleSound, onNewOrder }: { tracking: TrackingOrder | null; error: string; lineGroupUrl: string; soundEnabled: boolean; soundReady: boolean; onToggleSound: () => void; onNewOrder: () => void }) {
  if (!tracking) return <main className="delivery-public tracking-page"><section className="tracking-loading"><Clock3/><h1>กำลังโหลดสถานะออเดอร์</h1><p>{error || "เชื่อมต่อระบบติดตามแบบเรียลไทม์…"}</p>{error && <button onClick={onNewOrder}>กลับหน้าสั่งอาหาร</button>}</section></main>;
  const currentIndex = trackingSteps.findIndex((step) => step.status === tracking.status);
  const cancelled = tracking.status === "cancelled";
  return <main className="delivery-public tracking-page">
    <header className="delivery-header"><div><span className="delivery-logo">H</span><div><b>ติดตามการจัดส่ง</b><small>อัปเดตอัตโนมัติทุก 4 วินาที</small></div></div><div className="tracking-header-actions"><button className={soundEnabled && soundReady ? "active" : ""} onClick={onToggleSound}>{soundEnabled && soundReady ? <Volume2/> : <VolumeX/>}<span>{soundEnabled && soundReady ? "เปิดเสียงแล้ว" : "เปิดเสียง"}</span></button><span className="tracking-live"><i/> LIVE</span></div></header>
    <section className={`tracking-card ${cancelled ? "cancelled" : ""}`}><div className="tracking-head"><span className="tracking-main-icon">{tracking.status === "delivered" ? <CheckCircle2/> : tracking.status === "near_arrival" ? <Navigation/> : <Truck/>}</span><div><p className="eyebrow">ORDER STATUS</p><h1>{cancelled ? "ออเดอร์ถูกยกเลิก" : tracking.status === "delivered" ? "ส่งอาหารเรียบร้อยแล้ว" : tracking.status === "near_arrival" ? "ผู้ส่งใกล้ถึงแล้ว" : tracking.status === "out_for_delivery" ? "กำลังนำอาหารไปส่ง" : tracking.status === "preparing" ? "ร้านกำลังเตรียมอาหาร" : tracking.status === "confirmed" ? "ร้านรับออเดอร์แล้ว" : "ส่งออเดอร์ให้ร้านแล้ว"}</h1><p>{tracking.orderNumber}</p></div></div>
      {!cancelled && <div className="tracking-timeline">{trackingSteps.map(({ status, label, icon: Icon }, index) => <div className={index <= currentIndex ? "done" : ""} key={status}><span><Icon/></span><p>{label}</p></div>)}</div>}
      <div className="tracking-destination"><MapPin/><div><small>จุดรับอาหาร</small><b>{tracking.building}</b><p>{tracking.deliveryPoint}</p></div></div>
      {tracking.riderName && <div className="tracking-rider"><UserRound/><div><small>นักศึกษาผู้ส่งอาหาร</small><b>{tracking.riderName}</b></div></div>}
      <div className="tracking-items">{tracking.items.map((item) => <div key={item.id}><span>{item.quantity}×</span><p>{item.name}</p><b>{money(item.unitPrice * item.quantity)}</b></div>)}<footer><span>ยอดรวม</span><strong>{money(tracking.total)}</strong></footer></div>
      {error && <p className="tracking-warning">อัปเดตล่าสุดไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ</p>}
      {lineGroupUrl && <a className="tracking-line" href={lineGroupUrl} target="_blank" rel="noreferrer"><MessageCircle/> เข้ากลุ่ม LINE</a>}
      <button className="tracking-new-order" onClick={onNewOrder}>สั่งอาหารรายการใหม่</button>
    </section>
  </main>;
}
