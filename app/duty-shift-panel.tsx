"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, CalendarClock, CheckCircle2, Clock3, LogIn, LogOut, ShieldCheck, UserCog, UsersRound } from "lucide-react";

export type DutyStation = "host" | "service" | "kitchen" | "bar" | "cashier_trainee" | "delivery";
export type DutyShift = { id: string; label: string; serviceDate: string; status: "open" | "closed"; openedBy: string; openedAt: string; closedBy: string | null; closedAt: string | null };
export type DutyAssignment = { id: string; dutyShiftId: string; userId: string; userName: string; username: string; station: DutyStation; status: "assigned" | "checked_in" | "checked_out"; assignedBy: string; assignedAt: string; checkedInAt: string | null; checkedOutAt: string | null };
type DutyUser = { id: string; name: string; username?: string; email: string; role: "instructor" | "manager" | "cashier" | "student"; active: boolean };

export const dutyStationLabels: Record<DutyStation, string> = {
  host: "พนักงานต้อนรับ",
  service: "รับออเดอร์ / เสิร์ฟ",
  kitchen: "ครัว",
  bar: "บาร์เครื่องดื่ม",
  cashier_trainee: "แคชเชียร์ฝึกหัด",
  delivery: "พนักงานส่งอาหาร",
};

const stations = Object.keys(dutyStationLabels) as DutyStation[];
const statusLabels = { assigned: "รอลงเวลา", checked_in: "ปฏิบัติงานอยู่", checked_out: "ออกจากกะแล้ว" };
const thaiDate = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00+07:00`));
const thaiTime = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export default function DutyShiftPanel({ profile, management, users, shifts, assignments, working, onAction }: {
  profile: DutyUser;
  management: boolean;
  users: DutyUser[];
  shifts: DutyShift[];
  assignments: DutyAssignment[];
  working: boolean;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const [label, setLabel] = useState("กะฝึกปฏิบัติ");
  const [serviceDate, setServiceDate] = useState(today);
  const [userId, setUserId] = useState("");
  const [station, setStation] = useState<DutyStation>("service");
  const [message, setMessage] = useState("");
  const activeShift = shifts.find((shift) => shift.status === "open");
  const activeAssignments = activeShift ? assignments.filter((assignment) => assignment.dutyShiftId === activeShift.id) : [];
  const ownAssignment = activeAssignments.find((assignment) => assignment.userId === profile.id);
  const assignableUsers = useMemo(() => users.filter((user) => user.active && user.role !== "instructor"), [users]);

  async function run(body: Record<string, unknown>, success: string) {
    setMessage("");
    if (await onAction(body)) setMessage(success);
  }

  async function openShift(event: FormEvent) {
    event.preventDefault();
    await run({ action: "openDutyShift", label, serviceDate }, "เปิดกะปฏิบัติงานแล้ว");
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    await run({ action: "assignDutyStation", userId, station }, "บันทึกหน้าที่แล้ว นักศึกษาสามารถลงเวลาเข้างานได้");
    setUserId("");
  }

  return <div className="content duty-workspace">
    <section className="duty-hero">
      <span><CalendarClock/></span>
      <div><p className="eyebrow">STAFF DUTY & ACCESS</p><h2>หน้าที่ประจำกะและสิทธิ์การใช้งาน</h2><p>นักศึกษาจะเห็นและใช้งานเฉพาะจุดที่ได้รับมอบหมาย หลังลงเวลาเข้างานแล้วเท่านั้น</p></div>
      {activeShift ? <b className="duty-open-badge"><i/> {activeShift.label} • {thaiDate(activeShift.serviceDate)}</b> : <b className="duty-closed-badge">ยังไม่มีกะเปิด</b>}
    </section>

    {message && <p className="duty-message"><CheckCircle2/> {message}</p>}

    {!management && <section className="panel my-duty-card">
      <div className="panel-title"><div><p className="eyebrow">MY DUTY</p><h3>หน้าที่ของฉันวันนี้</h3></div><UserCog/></div>
      {!activeShift && <div className="duty-empty"><Clock3/><b>ยังไม่มีกะปฏิบัติงาน</b><small>รออาจารย์หรือผู้จัดการเปิดกะ</small></div>}
      {activeShift && !ownAssignment && <div className="duty-empty"><UsersRound/><b>ยังไม่ได้รับมอบหมายหน้าที่</b><small>กรุณาติดต่ออาจารย์ผู้ควบคุม</small></div>}
      {ownAssignment && <div className={`my-duty-status ${ownAssignment.status}`}>
        <span><BadgeCheck/></span><div><small>จุดปฏิบัติงาน</small><h3>{dutyStationLabels[ownAssignment.station]}</h3><p>{statusLabels[ownAssignment.status]} • เข้า {thaiTime(ownAssignment.checkedInAt)} • ออก {thaiTime(ownAssignment.checkedOutAt)}</p></div>
        {ownAssignment.status !== "checked_in" ? <button className="primary" disabled={working} onClick={() => void run({ action: "checkInDuty" }, "ลงเวลาเข้างานแล้ว สิทธิ์ประจำจุดเปิดใช้งานทันที")}><LogIn/> ลงเวลาเข้างาน</button> : <button className="secondary duty-checkout" disabled={working} onClick={() => void run({ action: "checkOutDuty" }, "ลงเวลาออกจากงานแล้ว")}><LogOut/> ลงเวลาออก</button>}
      </div>}
    </section>}

    {management && <>
      {!activeShift && <section className="panel duty-open-panel"><div className="panel-title"><div><p className="eyebrow">OPEN DUTY SHIFT</p><h3>เปิดกะปฏิบัติงานใหม่</h3></div><ShieldCheck/></div><form onSubmit={openShift}><label><span>ชื่อกะ</span><input value={label} onChange={(event) => setLabel(event.target.value)} minLength={2} maxLength={80} required/></label><label><span>วันที่ปฏิบัติงาน</span><input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required/></label><button className="primary" disabled={working}><CalendarClock/> เปิดกะ</button></form></section>}

      {activeShift && <section className="duty-management-grid">
        <article className="panel duty-assign-panel"><div className="panel-title"><div><p className="eyebrow">ASSIGN STATION</p><h3>มอบหมายหน้าที่</h3></div><span>{activeAssignments.length} คน</span></div><form onSubmit={assign}><label><span>นักศึกษา / พนักงาน</span><select value={userId} onChange={(event) => setUserId(event.target.value)} required><option value="">เลือกบัญชี</option>{assignableUsers.map((user) => <option value={user.id} key={user.id}>{user.name} • @{user.username ?? user.email}</option>)}</select></label><label><span>จุดปฏิบัติงาน</span><select value={station} onChange={(event) => setStation(event.target.value as DutyStation)}>{stations.map((value) => <option value={value} key={value}>{dutyStationLabels[value]}</option>)}</select></label><button className="primary" disabled={working || !userId}><UserCog/> มอบหมายหน้าที่</button></form><p className="duty-form-note">การมอบหมายใหม่ให้คนเดิมจะเปลี่ยนจุดและให้ลงเวลาใหม่ เพื่อป้องกันสิทธิ์ซ้ำซ้อน</p></article>
        <article className="panel duty-summary-panel"><div className="panel-title"><div><p className="eyebrow">SHIFT CONTROL</p><h3>{activeShift.label}</h3></div><b>{thaiDate(activeShift.serviceDate)}</b></div><div className="duty-summary-counts"><span>มอบหมาย <b>{activeAssignments.length}</b></span><span>เข้างาน <b>{activeAssignments.filter((row) => row.status === "checked_in").length}</b></span><span>ออกแล้ว <b>{activeAssignments.filter((row) => row.status === "checked_out").length}</b></span></div><button className="danger duty-close-button" disabled={working} onClick={() => { if (window.confirm("ปิดกะนี้และลงเวลาออกให้ผู้ที่ยังปฏิบัติงานอยู่หรือไม่?")) void run({ action: "closeDutyShift" }, "ปิดกะปฏิบัติงานแล้ว"); }}><LogOut/> ปิดกะปฏิบัติงาน</button></article>
      </section>}

      {activeShift && <section className="panel duty-roster"><div className="panel-title"><div><p className="eyebrow">LIVE ROSTER</p><h3>รายชื่อประจำจุด</h3></div><span>สิทธิ์เปลี่ยนตามสถานะเข้างานแบบทันที</span></div><div className="duty-station-grid">{stations.map((value) => { const rows = activeAssignments.filter((assignment) => assignment.station === value); return <article key={value}><header><b>{dutyStationLabels[value]}</b><span>{rows.filter((row) => row.status === "checked_in").length}/{rows.length}</span></header>{rows.map((assignment) => <div className={assignment.status} key={assignment.id}><span className="duty-avatar">{assignment.userName.slice(0, 1)}</span><p><b>{assignment.userName}</b><small>{statusLabels[assignment.status]} • เข้า {thaiTime(assignment.checkedInAt)}</small></p>{assignment.status !== "checked_in" ? <button disabled={working} title="ลงเวลาเข้าแทน" onClick={() => void run({ action: "checkInDuty", userId: assignment.userId }, `ลงเวลาเข้าให้ ${assignment.userName} แล้ว`)}><LogIn/></button> : <button disabled={working} title="ลงเวลาออกแทน" onClick={() => void run({ action: "checkOutDuty", userId: assignment.userId }, `ลงเวลาออกให้ ${assignment.userName} แล้ว`)}><LogOut/></button>}</div>)}{!rows.length && <small className="station-empty">ยังไม่มีผู้รับผิดชอบ</small>}</article>; })}</div></section>}

      <section className="panel duty-history"><div className="panel-title"><div><p className="eyebrow">DUTY HISTORY</p><h3>ประวัติกะล่าสุด</h3></div><span>{shifts.filter((shift) => shift.status === "closed").length} กะ</span></div><div>{shifts.filter((shift) => shift.status === "closed").slice(0, 10).map((shift) => { const rows = assignments.filter((assignment) => assignment.dutyShiftId === shift.id); return <article key={shift.id}><span><CalendarClock/></span><p><b>{shift.label}</b><small>{thaiDate(shift.serviceDate)} • ผู้ปฏิบัติงาน {rows.length} คน • ปิด {thaiTime(shift.closedAt)}</small></p><strong>{rows.filter((row) => row.checkedInAt).length} เข้างาน</strong></article>; })}{!shifts.some((shift) => shift.status === "closed") && <div className="duty-empty"><Clock3/><b>ยังไม่มีประวัติกะ</b></div>}</div></section>
    </>}
  </div>;
}
