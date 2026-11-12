"use client";

import { Download, History, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export type AuditEntry = {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  detail: string;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  VOID_ORDER: "ยกเลิกบิล",
  PAYMENT: "รับชำระเงิน",
  REFUND_PAYMENT: "คืนเงิน",
  UPDATE_MENU: "แก้ไขเมนู/ราคา",
  ARCHIVE_MENU: "ลบหรือซ่อนเมนู",
  MENU_STATUS: "เปลี่ยนสถานะเมนู",
  ADJUST_STOCK: "ปรับสต๊อก",
  RECEIVE_STOCK: "รับสินค้าเข้า",
  DELETE_ORDER_ITEM: "ลบรายการอาหาร",
  ADD_ORDER_ITEM: "เพิ่มรายการอาหาร",
  ORDER_ITEM_QUANTITY: "แก้จำนวนอาหาร",
  UPDATE_ORDER_ITEM: "แก้รายละเอียดอาหาร",
  ORDER_CHARGES: "แก้ส่วนลด/ภาษี",
  OPEN_SHIFT: "เปิดกะ",
  CLOSE_SHIFT: "ปิดกะ",
  CASH_IN: "เงินสดเข้า",
  CASH_OUT: "เงินสดออก",
  PRINTER_SETTINGS: "ตั้งค่างานพิมพ์",
  PRINT_KITCHEN: "พิมพ์ใบครัว",
  REPRINT_KITCHEN: "พิมพ์ใบครัวซ้ำ",
  PRINT_RECEIPT: "พิมพ์ใบเสร็จ",
  REPRINT_RECEIPT: "พิมพ์ใบเสร็จซ้ำ",
  AUTO_PRINT_KITCHEN: "พิมพ์ใบครัวอัตโนมัติ",
  AUTO_PRINT_FAILED: "พิมพ์อัตโนมัติล้มเหลว",
  AUTO_PRINT_RETRY: "สั่งลองพิมพ์ใหม่",
  RUN_READINESS_CHECK: "ตรวจความพร้อมเปิดร้าน",
  NETWORK_RECOVERY_TEST: "ทดสอบเน็ตหลุด",
  EXPORT_BACKUP: "ดาวน์โหลดไฟล์สำรอง",
  RESTORE_BACKUP: "กู้คืนข้อมูลสำรอง",
  ACTION_FAILED: "รายการไม่สำเร็จ",
  PRINTER_TEST_PASS: "เครื่องพิมพ์ผ่านการทดสอบ",
  PRINTER_TEST_FAIL: "เครื่องพิมพ์ทดสอบไม่ผ่าน",
  REPAIR_READINESS_LEGACY: "จัดระเบียบข้อมูลเดิม",
  APPROVE_OPENING: "อนุมัติเปิดร้าน",
  APPROVE_CLOSING: "อนุมัติปิดร้าน",
  START_STOCK_COUNT: "เริ่มตรวจนับสต๊อก",
  SAVE_STOCK_COUNT: "บันทึกร่างตรวจนับ",
  SUBMIT_STOCK_COUNT: "ส่งผลตรวจนับ",
  APPROVE_STOCK_COUNT: "อนุมัติและปรับสต๊อก",
};

const roleLabels: Record<string, string> = {
  instructor: "อาจารย์",
  manager: "ผู้จัดการ",
  cashier: "แคชเชียร์",
  student: "นักศึกษา",
};

const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));

export default function AuditPanel({ logs }: { logs: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    return logs.filter((log) => (category === "all" || log.action === category) && (!needle || `${log.actorName} ${log.action} ${log.detail}`.toLocaleLowerCase("th").includes(needle)));
  }, [category, logs, query]);

  function exportCsv() {
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["วันเวลา", "ผู้ทำรายการ", "บทบาท", "ประเภท", "รายละเอียด"],
      ...filtered.map((log) => [dateTime(log.createdAt), log.actorName, roleLabels[log.actorRole] ?? log.actorRole, actionLabels[log.action] ?? log.action, log.detail]),
    ];
    const blob = new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="content audit-content">
    <section className="audit-hero">
      <div><span><ShieldCheck/></span><div><p className="eyebrow">SECURITY & ACCOUNTABILITY</p><h2>ประวัติการทำรายการ</h2><p>ตรวจสอบว่าใครทำอะไร เมื่อใด และรายละเอียดที่เปลี่ยนแปลง</p></div></div>
      <button className="primary" onClick={exportCsv} disabled={!filtered.length}><Download/> ส่งออก CSV</button>
    </section>
    <section className="panel audit-panel">
      <header className="audit-toolbar">
        <label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อผู้ใช้ บิล เมนู หรือรายละเอียด…"/></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">กิจกรรมทั้งหมด</option>
          {categories.map((action) => <option value={action} key={action}>{actionLabels[action] ?? action}</option>)}
        </select>
        <b>{filtered.length.toLocaleString("th-TH")} รายการ</b>
      </header>
      <div className="audit-table">
        <div className="audit-row audit-head"><b>วันเวลา</b><b>ผู้ทำรายการ</b><b>ประเภท</b><b>รายละเอียด</b></div>
        {filtered.map((log) => <div className="audit-row" key={log.id}>
          <span>{dateTime(log.createdAt)}</span>
          <span><strong>{log.actorName}</strong><small>{roleLabels[log.actorRole] ?? log.actorRole}</small></span>
          <span className={`audit-action ${log.action === "VOID_ORDER" ? "danger" : ""}`}><History/>{actionLabels[log.action] ?? log.action}</span>
          <p>{log.detail}<small>{log.action}</small></p>
        </div>)}
        {!filtered.length && <div className="audit-empty"><History/><b>ไม่พบกิจกรรมตามเงื่อนไข</b></div>}
      </div>
    </section>
  </div>;
}
