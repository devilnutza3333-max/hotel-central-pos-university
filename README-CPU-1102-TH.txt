HOTEL CENTRAL POS — CPU OPTIMIZATION PATCH (2026-11-12)

สถานะ: ซอร์สโค้ดที่ปรับเพื่อลดภาระ CPU — ยังไม่ได้ build/ทดสอบกับ Cloudflare และยังไม่ได้ deploy
ที่มา: hotel-central-pos-source-2026-11-07-recipe-stockcount(1).zip

ข้อมูลจาก Cloudflare Dashboard (ผู้ใช้ส่งภาพ):
- 246 x Exceeded CPU Time Limits (ย้อนหลัง 24 ชั่วโมง)
- 0 x Exceeded Memory, 0 x Uncaught Exception
- Active version ID: 109aef7a
- Cloudflare Workers Free: 10 ms CPU ต่อคำขอ

สิ่งที่เปลี่ยน:
1) app/api/pos/route.ts: ข้อมูล order_items ใน GET /api/pos ใช้ SQL subquery ให้ตรงกับรายการ orders ที่ส่งกลับ
   (ย้อนหลังสูงสุด 100 ออเดอร์; finance สูงสุด 1,000) แทนดึงประวัติรายการอาหารทั้งหมดทุกครั้ง
2) app/pos-app.tsx: รีเฟรชอัตโนมัติทุก 12 วินาทีแทน 6 วินาที ข้ามเมื่อต่างแท็บ และไม่ซ้อน poll
   เมื่อกลับมาเปิดแท็บ รีเฟรชทันที (อาจทำให้การแจ้งเตือนใหม่ช้าลงสูงสุดราว 12 วินาที)

สิ่งที่ไม่ได้เปลี่ยน:
- ไม่มีการเปลี่ยน DB schema หรือ D1 migrations
- ไม่มีการลบ/รีเซ็ต/แก้ไขข้อมูลร้านค้า
- ไม่มีการแก้ไขระบบ Login/Permissions
- ไม่ได้แก้ Server-Side Rendering ของ Next/Vinext ซึ่งอาจเป็นต้นทุน CPU หลัก

ข้อควรระวัง:
- CPU >10ms อาจยังเกิดได้เพราะ Next/Vinext, Auth หรือโค้ดอื่น ต้องทดสอบบน staging ก่อน
- อย่าอัปโหลด ZIP นี้ลง Cloudflare Workers โดยตรง เนื่องจากเป็น SOURCE ไม่ใช่ build artifact
- สำรองฐานข้อมูล D1 ก่อน Deploy และตรวจ binding DB, secrets, compatibility settings, migrations
- แนะนำให้ทำ staging Worker ที่ใช้ฐานข้อมูลทดสอบ (ไม่ใช่ production DB) แล้วทดสอบทุก workflow
- Build ตามเครื่องมือ/CI เดิมด้วย Node >=22.13, pnpm 11.25; ห้าม deploy ทับ production แบบยังไม่ทดสอบ
- หลัง Deploy ดู Observability > Metrics > Errors by invocation status และทดสอบ POS, ชำระเงิน,
  ครัว/บาร์, สต๊อก, QR, จำนวนรายการย้อนหลัง และการออกใบเสร็จ

ผลทดสอบ: ตรวจไวยากรณ์ TS/TSX ด้วย TypeScript parser ผ่าน; ยังไม่ได้ run install, build,
unit/integration tests เนื่องจากไม่มี dependencies ในสภาพแวดล้อมนี้
