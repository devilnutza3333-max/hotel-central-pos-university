import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../app/pos-app.tsx",import.meta.url),"utf8");
const dash=ui.slice(ui.indexOf("function Dashboard({"),ui.indexOf("function TableMap({"));
test("no single-computer messaging remains",()=>{
  assert.doesNotMatch(ui,/ควบคุมทุกโต๊ะจากคอมพิวเตอร์เครื่องเดียว|ติดตามโทรศัพท์นักศึกษา/);
});
test("student manager sees a phone-first POS guide",()=>{
  assert.match(dash,/const isStudentManager = data\.profile\.role === "manager"/);
  assert.match(dash,/ฝึกใช้ POS รับออเดอร์ผ่านมือถือ/);
  assert.match(dash,/เลือกโต๊ะ รับรายการอาหาร ส่งออเดอร์เข้าครัว/);
  assert.match(dash,/ตามสิทธิ์ที่อาจารย์มอบหมาย/);
  assert.match(dash,/เริ่มรับออเดอร์/);
});
test("instructor and original controller see a neutral mobile-friendly overview",()=>{
  assert.match(dash,/POS SERVICE DASHBOARD/);
  assert.match(dash,/ติดตามงานบริการอาหารผ่านระบบ POS/);
  assert.match(dash,/ตรวจสอบโต๊ะ ออเดอร์ และสถานะครัวได้แบบเรียลไทม์/);
  assert.match(dash,/ดูแผนผังโต๊ะ/);
});
test("POS dashboard navigation still goes to tables",()=>assert.match(dash,/onClick=\{\(\) => onGo\("tables"\)\}/));
