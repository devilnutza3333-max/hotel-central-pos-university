"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { Archive, Boxes, Camera, ImagePlus, PackagePlus, Pencil, Plus, Save, SlidersHorizontal, UtensilsCrossed, X } from "lucide-react";

export type ManagedMenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
  available: boolean;
  active: boolean;
  imageUrl: string | null;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  unit: "kg" | "liter" | "unit" | "pack";
  currentStock: number;
  minimumStock: number;
  active: boolean;
  updatedAt: string;
};

export type MenuRecipe = { id: string; menuItemId: number; inventoryItemId: string; quantity: number };
export type StockMovement = { id: string; inventoryItemId: string; type: "receive" | "adjust" | "sale" | "return"; quantityDelta: number; note: string; createdAt: string };
export type StockReceipt = { id: string; documentNumber: string; supplier: string; note: string; receivedAt: string };

type Action = (body: Record<string, unknown>) => Promise<boolean>;

const unitLabels = { kg: "กก.", liter: "ลิตร", unit: "ชิ้น", pack: "แพ็ก" } as const;
const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const stock = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 }).format(value / 1000);

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  if (file.size > 12 * 1024 * 1024) throw new Error("รูปต้นฉบับต้องไม่เกิน 12 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("อ่านรูปภาพไม่สำเร็จ"));
      element.src = url;
    });
    let maxSide = 900;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", 0.76 - attempt * 0.08);
      if (data.length <= 480_000) return data;
      maxSide -= 140;
    }
    throw new Error("รูปยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MenuManagement({ menus, inventory, recipes, working, onAction }: { menus: ManagedMenuItem[]; inventory: InventoryItem[]; recipes: MenuRecipe[]; working: boolean; onAction: Action }) {
  const [editing, setEditing] = useState<ManagedMenuItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageData, setImageData] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [recipeMenu, setRecipeMenu] = useState<ManagedMenuItem | null>(null);
  const [recipeValues, setRecipeValues] = useState<Record<string, string>>({});

  function openNew() {
    setEditing(null); setName(""); setCategory(""); setPrice(""); setDescription(""); setImageData(undefined); setPreview(null); setMessage(""); setFormOpen(true);
  }

  function openEdit(menu: ManagedMenuItem) {
    setEditing(menu); setName(menu.name); setCategory(menu.category); setPrice(String(menu.price / 100)); setDescription(menu.description); setImageData(undefined); setPreview(menu.imageUrl); setMessage(""); setFormOpen(true);
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      setImageData(data); setPreview(data); setMessage("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "เตรียมรูปไม่สำเร็จ");
    } finally {
      event.target.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = editing ? "updateMenu" : "createMenu";
    if (await onAction({ action, menuItemId: editing?.id, name, category, price, description, imageData })) {
      setFormOpen(false); setMessage(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มเมนูแล้ว");
    }
  }

  function openRecipe(menu: ManagedMenuItem) {
    const values: Record<string, string> = {};
    for (const recipe of recipes.filter((row) => row.menuItemId === menu.id)) values[recipe.inventoryItemId] = String(recipe.quantity / 1000);
    setRecipeValues(values); setRecipeMenu(menu);
  }

  async function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipeMenu) return;
    const lines = Object.entries(recipeValues).filter(([, quantity]) => Number(quantity) > 0).map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }));
    if (await onAction({ action: "setRecipe", menuItemId: recipeMenu.id, lines })) setRecipeMenu(null);
  }

  return <div className="content management-page">
    <div className="management-heading"><div><p className="eyebrow">MENU CATALOG</p><h2>เมนูอาหารและสูตรตัดสต๊อก</h2><p>เพิ่มรูป แก้ไขราคา ปิดขายชั่วคราว และกำหนดวัตถุดิบที่ใช้ต่อ 1 จาน</p></div><button className="primary action-button" onClick={openNew}><Plus size={17}/> เพิ่มเมนู</button></div>
    {message && <div className="notice">{message}</div>}
    <div className="catalog-grid">{menus.map((menu) => <article className={`catalog-card ${!menu.active ? "archived" : !menu.available ? "sold-out" : ""}`} key={menu.id}>
      <div className="catalog-image">{menu.imageUrl ? <img src={menu.imageUrl} alt={menu.name}/> : <ImagePlus/>}<span>{!menu.active ? "ลบ/ซ่อนแล้ว" : !menu.available ? "หมดชั่วคราว" : "พร้อมขาย"}</span></div>
      <div className="catalog-copy"><small>{menu.category}</small><h3>{menu.name}</h3><p>{menu.description || "ยังไม่มีรายละเอียด"}</p><strong>{money(menu.price)}</strong></div>
      <div className="catalog-actions"><button onClick={() => openEdit(menu)}><Pencil size={15}/> แก้ไข</button><button onClick={() => openRecipe(menu)}><UtensilsCrossed size={15}/> สูตร</button>{menu.active && <button onClick={() => void onAction({ action: "setMenuStatus", menuItemId: menu.id, field: "available", value: !menu.available })}>{menu.available ? "หมดชั่วคราว" : "เปิดขาย"}</button>}<button className="danger" onClick={() => { if (menu.active ? window.confirm(`ซ่อนเมนู “${menu.name}” ใช่หรือไม่? ประวัติการขายจะยังอยู่`) : true) void onAction({ action: "setMenuStatus", menuItemId: menu.id, field: "active", value: !menu.active }); }}><Archive size={15}/>{menu.active ? "ลบ" : "กู้คืน"}</button></div>
    </article>)}</div>

    {formOpen && <div className="modal-backdrop"><form className="editor-modal" onSubmit={submit}><header><div><p className="eyebrow">MENU EDITOR</p><h3>{editing ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}</h3></div><button type="button" onClick={() => setFormOpen(false)}><X/></button></header><div className="editor-grid"><label><span>ชื่อเมนู</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required/></label><label><span>หมวดหมู่</span><input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={60} placeholder="เช่น อาหารจานเดียว" required/></label><label><span>ราคา (บาท)</span><input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required/></label><label className="wide"><span>รายละเอียด</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500}/></label><label className="image-picker wide"><span>รูปอาหาร</span><div>{preview ? <img src={preview} alt="ตัวอย่างรูปอาหาร"/> : <Camera/>}<label><ImagePlus size={16}/> เลือกรูปจากมือถือหรือคอมพิวเตอร์<input type="file" accept="image/*" onChange={(event) => void chooseImage(event)}/></label>{preview && <button type="button" onClick={() => { setPreview(null); setImageData(null); }}>นำรูปออก</button>}</div></label></div>{message && <p className="form-error">{message}</p>}<footer><button type="button" className="secondary" onClick={() => setFormOpen(false)}>ยกเลิก</button><button className="primary" disabled={working}><Save size={16}/> บันทึกเมนู</button></footer></form></div>}

    {recipeMenu && <div className="modal-backdrop"><form className="editor-modal recipe-modal" onSubmit={saveRecipe}><header><div><p className="eyebrow">RECIPE</p><h3>สูตรตัดสต๊อก: {recipeMenu.name}</h3></div><button type="button" onClick={() => setRecipeMenu(null)}><X/></button></header><p className="modal-help">ระบุปริมาณวัตถุดิบที่ใช้ต่อการขาย 1 จาน ระบบจะตัดเมื่อบันทึกชำระเงิน</p><div className="recipe-list">{inventory.filter((item) => item.active).map((item) => <label key={item.id}><span><b>{item.name}</b><small>{item.sku} • คงเหลือ {stock(item.currentStock)} {unitLabels[item.unit]}</small></span><input type="number" min="0" step="0.001" value={recipeValues[item.id] ?? ""} onChange={(event) => setRecipeValues((current) => ({ ...current, [item.id]: event.target.value }))}/><em>{unitLabels[item.unit]}</em></label>)}{!inventory.length && <p>กรุณาเพิ่มวัตถุดิบในหน้าสต๊อกก่อน</p>}</div><footer><button type="button" className="secondary" onClick={() => setRecipeMenu(null)}>ยกเลิก</button><button className="primary" disabled={working}><Save size={16}/> บันทึกสูตร</button></footer></form></div>}
  </div>;
}

export function InventoryManagement({ items, movements, receipts, working, onAction }: { items: InventoryItem[]; movements: StockMovement[]; receipts: StockReceipt[]; working: boolean; onAction: Action }) {
  const [sku, setSku] = useState(""); const [name, setName] = useState(""); const [unit, setUnit] = useState<InventoryItem["unit"]>("kg"); const [minimumStock, setMinimumStock] = useState("");
  const [receiveItem, setReceiveItem] = useState(""); const [receiveQuantity, setReceiveQuantity] = useState(""); const [unitCost, setUnitCost] = useState(""); const [documentNumber, setDocumentNumber] = useState(""); const [supplier, setSupplier] = useState(""); const [receiveNote, setReceiveNote] = useState("");
  const [adjustItem, setAdjustItem] = useState(""); const [quantityDelta, setQuantityDelta] = useState(""); const [adjustNote, setAdjustNote] = useState("");
  const [message, setMessage] = useState("");
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (await onAction({ action: "createInventory", sku, name, unit, minimumStock })) { setSku(""); setName(""); setMinimumStock(""); setMessage("เพิ่มวัตถุดิบแล้ว"); } }
  async function receive(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (await onAction({ action: "receiveStock", inventoryItemId: receiveItem, quantity: receiveQuantity, unitCost, documentNumber, supplier, note: receiveNote })) { setReceiveQuantity(""); setUnitCost(""); setDocumentNumber(""); setReceiveNote(""); setMessage("รับสินค้าเข้าสต๊อกแล้ว"); } }
  async function adjust(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (await onAction({ action: "adjustStock", inventoryItemId: adjustItem, quantityDelta, note: adjustNote })) { setQuantityDelta(""); setAdjustNote(""); setMessage("ปรับยอดสต๊อกแล้ว"); } }

  return <div className="content management-page"><div className="management-heading"><div><p className="eyebrow">INVENTORY CONTROL</p><h2>รับสินค้าและควบคุมสต๊อก</h2><p>ยอดทั้งหมดใช้ฐานข้อมูลกลาง และตัดอัตโนมัติจากสูตรเมนูเมื่อชำระบิล</p></div></div>{message && <div className="notice">{message}</div>}
    <section className="stock-summary">{items.map((item) => { const low = item.currentStock <= item.minimumStock; return <article className={low ? "low" : ""} key={item.id}><span><Boxes/></span><div><small>{item.sku} • {unitLabels[item.unit]}</small><h3>{item.name}</h3><strong>{stock(item.currentStock)} <em>{unitLabels[item.unit]}</em></strong><p>ขั้นต่ำ {stock(item.minimumStock)} {unitLabels[item.unit]} {low && "• ควรสั่งเพิ่ม"}</p></div></article>; })}{!items.length && <div className="wide-empty"><Boxes/><h3>ยังไม่มีวัตถุดิบ</h3><p>เริ่มจากแบบฟอร์ม “เพิ่มวัตถุดิบ” ด้านล่าง</p></div>}</section>
    <section className="inventory-forms"><form className="panel compact-form" onSubmit={create}><div className="panel-title"><div><p className="eyebrow">MASTER DATA</p><h3>เพิ่มวัตถุดิบ</h3></div><Plus/></div><label><span>รหัสสินค้า</span><input value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} placeholder="RM-001" required/></label><label><span>ชื่อวัตถุดิบ</span><input value={name} onChange={(event) => setName(event.target.value)} required/></label><div className="two-fields"><label><span>หน่วย</span><select value={unit} onChange={(event) => setUnit(event.target.value as InventoryItem["unit"])}><option value="kg">กิโลกรัม</option><option value="liter">ลิตร</option><option value="unit">ชิ้น</option><option value="pack">แพ็ก</option></select></label><label><span>สต๊อกขั้นต่ำ</span><input type="number" min="0" step="0.001" value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)}/></label></div><button className="primary" disabled={working}><Plus/> เพิ่มวัตถุดิบ</button></form>
      <form className="panel compact-form" onSubmit={receive}><div className="panel-title"><div><p className="eyebrow">GOODS RECEIPT</p><h3>รับสินค้าเข้า</h3></div><PackagePlus/></div><label><span>วัตถุดิบ</span><select value={receiveItem} onChange={(event) => setReceiveItem(event.target.value)} required><option value="">เลือกวัตถุดิบ</option>{items.map((item) => <option value={item.id} key={item.id}>{item.name} ({unitLabels[item.unit]})</option>)}</select></label><div className="two-fields"><label><span>จำนวน</span><input type="number" min="0.001" step="0.001" value={receiveQuantity} onChange={(event) => setReceiveQuantity(event.target.value)} required/></label><label><span>ต้นทุน/หน่วย (บาท)</span><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)}/></label></div><div className="two-fields"><label><span>เลขที่เอกสาร</span><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} required/></label><label><span>ผู้จำหน่าย</span><input value={supplier} onChange={(event) => setSupplier(event.target.value)} required/></label></div><label><span>หมายเหตุ</span><input value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)}/></label><button className="primary" disabled={working}><PackagePlus/> บันทึกรับเข้า</button></form>
      <form className="panel compact-form" onSubmit={adjust}><div className="panel-title"><div><p className="eyebrow">STOCK ADJUSTMENT</p><h3>ปรับยอดสต๊อก</h3></div><SlidersHorizontal/></div><label><span>วัตถุดิบ</span><select value={adjustItem} onChange={(event) => setAdjustItem(event.target.value)} required><option value="">เลือกวัตถุดิบ</option>{items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>จำนวนเพิ่ม/ลด</span><input type="number" step="0.001" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} placeholder="เช่น 2 หรือ -0.5" required/></label><label><span>เหตุผล</span><input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="ตรวจนับ, เสียหาย, คืนสินค้า" required/></label><button className="primary" disabled={working}><SlidersHorizontal/> บันทึกปรับยอด</button></form>
    </section>
    <section className="inventory-history"><article className="panel"><div className="panel-title"><div><p className="eyebrow">MOVEMENT LEDGER</p><h3>การเคลื่อนไหวล่าสุด</h3></div><span>{movements.length} รายการ</span></div><div className="movement-list">{movements.slice(0, 30).map((movement) => <div key={movement.id}><span className={`movement-type ${movement.type}`}>{movement.type === "receive" ? "รับเข้า" : movement.type === "sale" ? "ขาย" : "ปรับยอด"}</span><p><b>{itemById.get(movement.inventoryItemId)?.name ?? movement.inventoryItemId}</b><small>{movement.note || "–"} • {new Date(movement.createdAt).toLocaleString("th-TH")}</small></p><strong className={movement.quantityDelta < 0 ? "negative" : "positive"}>{movement.quantityDelta > 0 ? "+" : ""}{stock(movement.quantityDelta)}</strong></div>)}</div></article><article className="panel"><div className="panel-title"><div><p className="eyebrow">RECEIVING</p><h3>เอกสารรับเข้าล่าสุด</h3></div><span>{receipts.length} ฉบับ</span></div><div className="receipt-list">{receipts.slice(0, 15).map((receipt) => <div key={receipt.id}><b>{receipt.documentNumber}</b><span>{receipt.supplier}</span><small>{new Date(receipt.receivedAt).toLocaleString("th-TH")}</small></div>)}</div></article></section>
  </div>;
}
