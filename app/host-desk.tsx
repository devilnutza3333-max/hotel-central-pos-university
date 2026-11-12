"use client";

import { FormEvent, useMemo, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, Clock3, DoorOpen, Hotel, MapPin, Pencil, Phone, Plus, Search, UserRound, UsersRound, X } from "lucide-react";

export type HostTable = { id: number; number: number; zone: string; seats: number; status: "available" | "occupied" | "cleaning" };
export type GuestVisit = {
  id: string;
  visitType: "walk_in" | "reservation";
  customerName: string;
  phone: string;
  roomNumber: string;
  guestCount: number;
  scheduledAt: string | null;
  note: string;
  status: "reserved" | "waiting" | "seated" | "cancelled" | "no_show" | "completed";
  tableId: number | null;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
  seatedAt: string | null;
};

type HostAction = (body: Record<string, unknown>) => Promise<boolean>;
type EditDraft = { id: string; visitType: GuestVisit["visitType"]; customerName: string; phone: string; roomNumber: string; guestCount: number; scheduledAt: string; note: string };

const statusLabel: Record<GuestVisit["status"], string> = {
  reserved: "จองล่วงหน้า",
  waiting: "รอโต๊ะ",
  seated: "นั่งโต๊ะแล้ว",
  cancelled: "ยกเลิก",
  no_show: "ไม่มาตามนัด",
  completed: "เสร็จสิ้น",
};

function localDateTimeInput(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function thaiDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "–";
}

export default function HostDesk({ visits, tables, working, onAction }: { visits: GuestVisit[]; tables: HostTable[]; working: boolean; onAction: HostAction }) {
  const [mode, setMode] = useState<"walk_in" | "reservation">("walk_in");
  const [tab, setTab] = useState<"waiting" | "reservations" | "seated" | "history">("waiting");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [scheduledAt, setScheduledAt] = useState(localDateTimeInput());
  const [note, setNote] = useState("");
  const [seatVisitId, setSeatVisitId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [message, setMessage] = useState("");

  const waiting = useMemo(() => visits.filter((visit) => visit.status === "waiting"), [visits]);
  const reservations = useMemo(() => visits.filter((visit) => visit.status === "reserved").sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()), [visits]);
  const seated = useMemo(() => visits.filter((visit) => visit.status === "seated"), [visits]);
  const history = useMemo(() => visits.filter((visit) => ["completed", "cancelled", "no_show"].includes(visit.status)), [visits]);
  const availableTables = useMemo(() => tables.filter((table) => table.status === "available"), [tables]);
  const selectedVisit = visits.find((visit) => visit.id === seatVisitId) ?? null;
  const shown = tab === "waiting" ? waiting : tab === "reservations" ? reservations : tab === "seated" ? seated : history;
  const normalizedSearch = search.trim().toLocaleLowerCase("th-TH");
  const filteredShown = shown.filter((visit) => !normalizedSearch || [visit.customerName, visit.phone, visit.roomNumber, visit.note].some((value) => value.toLocaleLowerCase("th-TH").includes(normalizedSearch)));
  const waitingGuests = waiting.reduce((sum, visit) => sum + visit.guestCount, 0);

  async function createVisit(event: FormEvent) {
    event.preventDefault();
    const ok = await onAction({ action: "createGuestVisit", visitType: mode, customerName, phone, roomNumber, guestCount, scheduledAt: mode === "reservation" ? new Date(scheduledAt).toISOString() : null, note });
    if (!ok) return;
    setCustomerName(""); setPhone(""); setRoomNumber(""); setGuestCount(2); setNote("");
    setTab(mode === "reservation" ? "reservations" : "waiting");
    setMessage(mode === "reservation" ? "บันทึกการจองแล้ว" : "เพิ่มลูกค้าเข้าคิวแล้ว");
  }

  async function changeStatus(visit: GuestVisit, status: GuestVisit["status"]) {
    if (await onAction({ action: "setGuestVisitStatus", guestVisitId: visit.id, status })) {
      setMessage(status === "waiting" ? "ย้ายลูกค้าเข้าคิวรอโต๊ะแล้ว" : "อัปเดตสถานะแล้ว");
      if (status === "waiting") setTab("waiting");
    }
  }

  async function seat(table: HostTable) {
    if (!selectedVisit) return;
    const ok = await onAction({ action: "seatGuestVisit", guestVisitId: selectedVisit.id, tableId: table.id });
    if (!ok) return;
    setSeatVisitId(null);
    setTab("seated");
    setMessage(`เปิดโต๊ะ ${table.number} และแจ้งพนักงานเสิร์ฟแล้ว`);
  }

  function startEdit(visit: GuestVisit) {
    setEditDraft({ id: visit.id, visitType: visit.visitType, customerName: visit.customerName, phone: visit.phone, roomNumber: visit.roomNumber, guestCount: visit.guestCount, scheduledAt: visit.scheduledAt ? localDateTimeInput(new Date(visit.scheduledAt)) : "", note: visit.note });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editDraft) return;
    const ok = await onAction({ action: "updateGuestVisit", guestVisitId: editDraft.id, customerName: editDraft.customerName, phone: editDraft.phone, roomNumber: editDraft.roomNumber, guestCount: editDraft.guestCount, scheduledAt: editDraft.visitType === "reservation" ? new Date(editDraft.scheduledAt).toISOString() : null, note: editDraft.note });
    if (!ok) return;
    setEditDraft(null);
    setMessage("แก้ไขข้อมูลลูกค้าแล้ว");
  }

  const waitMinutes = (visit: GuestVisit) => Math.max(0, Math.floor((Date.now() - new Date(visit.createdAt).getTime()) / 60_000));

  return <div className="content host-desk-page">
    <section className="host-hero">
      <div><p className="eyebrow">FRONT OF HOUSE</p><h2>จอพนักงานต้อนรับ</h2><p>รับลูกค้า จัดคิว จองโต๊ะ และส่งต่อให้พนักงานเสิร์ฟจากหน้าจอเดียว</p></div>
      <span><i/> อัปเดตจากระบบกลาง</span>
    </section>

    {message && <div className="notice host-notice"><CheckCircle2/>{message}<button onClick={() => setMessage("")}>×</button></div>}

    <section className="host-summary-grid">
      <article><DoorOpen/><span>โต๊ะว่าง<b>{availableTables.length}</b><small>จาก {tables.length} โต๊ะ</small></span></article>
      <article><Clock3/><span>คิวรอโต๊ะ<b>{waiting.length}</b><small>{waitingGuests} คน</small></span></article>
      <article><CalendarClock/><span>จองล่วงหน้า<b>{reservations.length}</b><small>รอเข้าร้าน</small></span></article>
      <article><UsersRound/><span>นั่งแล้ว<b>{seated.length}</b><small>กำลังใช้บริการ</small></span></article>
    </section>

    <section className="host-main-grid">
      <article className="panel host-intake-panel">
        <div className="panel-title"><div><p className="eyebrow">NEW GUEST</p><h3>รับลูกค้าใหม่</h3></div><UserRound/></div>
        <div className="host-mode-switch"><button type="button" className={mode === "walk_in" ? "active" : ""} onClick={() => setMode("walk_in")}><UsersRound/> Walk-in</button><button type="button" className={mode === "reservation" ? "active" : ""} onClick={() => setMode("reservation")}><CalendarClock/> จองล่วงหน้า</button></div>
        <form onSubmit={createVisit}>
          <label className="host-field full"><span>ชื่อลูกค้า / ชื่อผู้จอง *</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={120} required placeholder="เช่น คุณสมชาย"/></label>
          <label className="host-field"><span>เบอร์ติดต่อ {mode === "reservation" ? "*" : ""}</span><div><Phone/><input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} required={mode === "reservation"} inputMode="tel" placeholder="08x-xxx-xxxx"/></div></label>
          <label className="host-field"><span>หมายเลขห้อง</span><div><Hotel/><input value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} maxLength={40} placeholder="เช่น 1205"/></div></label>
          <label className="host-field"><span>จำนวนลูกค้า *</span><input type="number" value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} min={1} max={30} required/></label>
          {mode === "reservation" && <label className="host-field"><span>วันและเวลาจอง *</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required/></label>}
          <label className="host-field full"><span>หมายเหตุ</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} placeholder="เด็กเล็ก, รถเข็น, แพ้อาหาร หรือความต้องการพิเศษ"/></label>
          <button className="primary host-submit" disabled={working}><Plus/>{mode === "reservation" ? "บันทึกการจอง" : "เพิ่มเข้าคิวรอโต๊ะ"}</button>
        </form>
      </article>

      <article className="panel host-queue-panel">
        <div className="host-tabs">
          <button className={tab === "waiting" ? "active" : ""} onClick={() => setTab("waiting")}>คิวรอโต๊ะ <b>{waiting.length}</b></button>
          <button className={tab === "reservations" ? "active" : ""} onClick={() => setTab("reservations")}>จองล่วงหน้า <b>{reservations.length}</b></button>
          <button className={tab === "seated" ? "active" : ""} onClick={() => setTab("seated")}>นั่งแล้ว <b>{seated.length}</b></button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>ประวัติ <b>{history.length}</b></button>
        </div>
        <label className="host-search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร ห้อง หรือหมายเหตุ"/><button className={search ? "" : "hidden"} onClick={() => setSearch("")}><X/></button></label>
        <div className="host-visit-list">
          {filteredShown.map((visit) => <article className={`host-visit-card ${visit.status}`} key={visit.id}>
            <header><span>{visit.status === "waiting" ? `Q${waiting.findIndex((row) => row.id === visit.id) + 1}` : visit.customerName.slice(0, 1)}</span><div><h3>{visit.customerName}</h3><small>{statusLabel[visit.status]} • {visit.guestCount} คน{visit.status === "waiting" ? ` • รอ ${waitMinutes(visit)} นาที` : ""}</small></div><b>{visit.visitType === "reservation" ? thaiDateTime(visit.scheduledAt) : thaiDateTime(visit.createdAt)}</b></header>
            <div className="host-guest-meta">{visit.phone && <span><Phone/>{visit.phone}</span>}{visit.roomNumber && <span><Hotel/>ห้อง {visit.roomNumber}</span>}{visit.tableId && <span><MapPin/>โต๊ะ {tables.find((table) => table.id === visit.tableId)?.number ?? visit.tableId}</span>}</div>
            {visit.note && <p>{visit.note}</p>}
            <footer>
              {visit.status === "reserved" && <><button disabled={working} onClick={() => void changeStatus(visit, "waiting")}><CheckCircle2/> ลูกค้ามาถึงแล้ว</button><button onClick={() => startEdit(visit)}><Pencil/> แก้ไข</button><button className="quiet" disabled={working} onClick={() => void changeStatus(visit, "no_show")}>ไม่มาตามนัด</button></>}
              {visit.status === "waiting" && <><button className="primary" disabled={working} onClick={() => setSeatVisitId(visit.id)}><DoorOpen/> เลือกโต๊ะและเปิดโต๊ะ</button><button onClick={() => startEdit(visit)}><Pencil/> แก้ไข</button><button className="quiet" disabled={working} onClick={() => void changeStatus(visit, "cancelled")}>ยกเลิก</button></>}
              {visit.status === "seated" && <><span className="host-service-sent"><BellRing/> แจ้งพนักงานเสิร์ฟแล้ว</span><button className="quiet" onClick={() => startEdit(visit)}><Pencil/> แก้ไขข้อมูล</button></>}
            </footer>
          </article>)}
          {!filteredShown.length && <div className="wide-empty"><UsersRound/><h3>{search ? "ไม่พบข้อมูลที่ค้นหา" : "ยังไม่มีรายการ"}</h3><p>{search ? "ลองค้นหาด้วยชื่อ เบอร์โทร หรือหมายเลขห้องอื่น" : tab === "waiting" ? "ลูกค้า Walk-in และผู้จองที่มาถึงแล้วจะแสดงที่นี่" : tab === "reservations" ? "เพิ่มการจองล่วงหน้าจากแบบฟอร์มด้านซ้าย" : tab === "seated" ? "เมื่อลูกค้าได้รับโต๊ะแล้วจะแสดงที่นี่" : "รายการที่เสร็จสิ้น ยกเลิก หรือไม่มาตามนัดจะแสดงที่นี่"}</p></div>}
        </div>
      </article>
    </section>

    <section className="panel host-floor-status"><div className="panel-title"><div><p className="eyebrow">LIVE TABLE STATUS</p><h3>สถานะโต๊ะทั้งห้องอาหาร</h3></div><span><i className="available"/> ว่าง <i className="occupied"/> มีลูกค้า <i className="cleaning"/> รอทำความสะอาด</span></div><div>{tables.map((table) => <article className={table.status} key={table.id}><b>{String(table.number).padStart(2, "0")}</b><span>โต๊ะ {table.number}<small>{table.zone} • {table.seats} ที่นั่ง</small></span></article>)}</div></section>

    {selectedVisit && <div className="modal-backdrop"><section className="modal host-table-modal"><header><div><p className="eyebrow">ASSIGN TABLE</p><h2>เลือกโต๊ะให้ {selectedVisit.customerName}</h2><p>{selectedVisit.guestCount} คน • เลือกเฉพาะโต๊ะที่ว่างและมีที่นั่งเพียงพอ</p></div><button onClick={() => setSeatVisitId(null)}><X/></button></header><div className="host-table-picker">{availableTables.map((table) => { const fits = table.seats >= selectedVisit.guestCount; return <button key={table.id} disabled={!fits || working} onClick={() => void seat(table)}><b>{String(table.number).padStart(2, "0")}</b><span>โต๊ะ {table.number}<small>{table.zone} • {table.seats} ที่นั่ง</small></span>{fits ? <CheckCircle2/> : <small>ที่นั่งไม่พอ</small>}</button>; })}{!availableTables.length && <div className="wide-empty"><Clock3/><h3>ยังไม่มีโต๊ะว่าง</h3><p>เก็บลูกค้าไว้ในคิวและตรวจอีกครั้งเมื่อโต๊ะพร้อม</p></div>}</div></section></div>}

    {editDraft && <div className="modal-backdrop"><section className="modal host-edit-modal"><header><div><p className="eyebrow">EDIT GUEST</p><h2>แก้ไขข้อมูลลูกค้า</h2></div><button onClick={() => setEditDraft(null)}><X/></button></header><form onSubmit={saveEdit}><label className="host-field full"><span>ชื่อลูกค้า / ชื่อผู้จอง *</span><input value={editDraft.customerName} onChange={(event) => setEditDraft({ ...editDraft, customerName: event.target.value })} maxLength={120} required/></label><label className="host-field"><span>เบอร์ติดต่อ {editDraft.visitType === "reservation" ? "*" : ""}</span><input value={editDraft.phone} onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })} required={editDraft.visitType === "reservation"} maxLength={30}/></label><label className="host-field"><span>หมายเลขห้อง</span><input value={editDraft.roomNumber} onChange={(event) => setEditDraft({ ...editDraft, roomNumber: event.target.value })} maxLength={40}/></label><label className="host-field"><span>จำนวนลูกค้า *</span><input type="number" value={editDraft.guestCount} onChange={(event) => setEditDraft({ ...editDraft, guestCount: Number(event.target.value) })} min={1} max={30} required/></label>{editDraft.visitType === "reservation" && <label className="host-field"><span>วันและเวลาจอง *</span><input type="datetime-local" value={editDraft.scheduledAt} onChange={(event) => setEditDraft({ ...editDraft, scheduledAt: event.target.value })} required/></label>}<label className="host-field full"><span>หมายเหตุ</span><textarea value={editDraft.note} onChange={(event) => setEditDraft({ ...editDraft, note: event.target.value })} maxLength={300} rows={3}/></label><footer><button type="button" onClick={() => setEditDraft(null)}>ยกเลิก</button><button className="primary" disabled={working}><Pencil/> บันทึกการแก้ไข</button></footer></form></section></div>}
  </div>;
}
