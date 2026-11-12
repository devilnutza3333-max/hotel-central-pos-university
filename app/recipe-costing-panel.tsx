"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ChevronRight, CircleDollarSign, LoaderCircle, PackageSearch, Save, Search, UtensilsCrossed } from "lucide-react";
import type { InventoryItem, ManagedMenuItem, MenuRecipe } from "./management-panels";

export type RecipeCostingAction = (body: {
  action: "setRecipe";
  menuItemId: number;
  lines: Array<{ inventoryItemId: string; quantity: number }>;
}) => Promise<boolean>;

export type RecipeCostingPanelProps = {
  menus: ManagedMenuItem[];
  inventory: InventoryItem[];
  recipes: MenuRecipe[];
  /** ต้นทุนล่าสุดเป็นสตางค์ต่อ 1 หน่วยหลักของวัตถุดิบ (กก./ลิตร/ชิ้น/แพ็ก) */
  latestUnitCosts: Record<string, number>;
  working: boolean;
  onAction: RecipeCostingAction;
};

const unitLabels: Record<InventoryItem["unit"], string> = { kg: "กก.", liter: "ลิตร", unit: "ชิ้น", pack: "แพ็ก" };
const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const quantity = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 }).format(value / 1000);

function recipeCost(lines: MenuRecipe[], latestUnitCosts: Record<string, number>) {
  return Math.round(lines.reduce((sum, line) => sum + (latestUnitCosts[line.inventoryItemId] ?? 0) * line.quantity / 1000, 0));
}

export default function RecipeCostingPanel({ menus, inventory, recipes, latestUnitCosts, working, onAction }: RecipeCostingPanelProps) {
  const activeMenus = useMemo(() => menus.filter((menu) => menu.active), [menus]);
  const [selectedMenuId, setSelectedMenuId] = useState<number | null>(activeMenus[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const itemById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const selectedMenu = activeMenus.find((menu) => menu.id === selectedMenuId) ?? activeMenus[0] ?? null;
  const selectedLines = selectedMenu ? recipes.filter((line) => line.menuItemId === selectedMenu.id) : [];
  const selectedCost = recipeCost(selectedLines, latestUnitCosts);
  const grossProfit = selectedMenu ? selectedMenu.price - selectedCost : 0;
  const foodCostPercent = selectedMenu?.price ? selectedCost / selectedMenu.price * 100 : 0;
  const menusWithRecipes = new Set(recipes.map((line) => line.menuItemId));
  const menusWithKnownCost = new Set(recipes.filter((line) => (latestUnitCosts[line.inventoryItemId] ?? 0) > 0).map((line) => line.menuItemId));
  const filteredMenus = activeMenus.filter((menu) => {
    const matches = `${menu.name} ${menu.category}`.toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th"));
    return matches && (!onlyIncomplete || !menusWithRecipes.has(menu.id));
  });

  function chooseMenu(menuId: number) {
    setSelectedMenuId(menuId);
    setEditing(false);
    setValues({});
    setMessage("");
  }

  function startEditing() {
    if (!selectedMenu) return;
    const nextValues: Record<string, string> = {};
    for (const line of selectedLines) nextValues[line.inventoryItemId] = String(line.quantity / 1000);
    setValues(nextValues);
    setMessage("");
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMenu) return;
    const lines = Object.entries(values)
      .map(([inventoryItemId, raw]) => ({ inventoryItemId, quantity: Number(raw) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!lines.length) {
      setMessage("กรุณาระบุวัตถุดิบอย่างน้อย 1 รายการ");
      return;
    }
    if (await onAction({ action: "setRecipe", menuItemId: selectedMenu.id, lines })) {
      setEditing(false);
      setMessage("บันทึกสูตรและปรับต้นทุนต่อจานเรียบร้อยแล้ว");
    }
  }

  const missingCostLines = selectedLines.filter((line) => !(latestUnitCosts[line.inventoryItemId] > 0));

  return <div className="recipe-cost-page">
    <style>{`
      .recipe-cost-page{display:grid;grid-template-columns:minmax(250px,.72fr) minmax(480px,1.45fr);gap:13px;align-items:start}.recipe-cost-page *{box-sizing:border-box}.recipe-menu-panel,.recipe-detail-panel{border:1px solid #dce7e4;border-radius:14px;background:#fff;box-shadow:0 5px 22px #183c3409}.recipe-menu-panel{padding:13px;position:sticky;top:12px}.recipe-cost-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.recipe-cost-heading h3{margin:2px 0;font-size:14px}.recipe-cost-heading>span{padding:5px 8px;border-radius:99px;background:#e7f4f0;color:#167160;font-size:7px;font-weight:900}.recipe-cost-search{height:38px;margin-top:10px;padding:0 9px;display:flex;align-items:center;gap:6px;border:1px solid #d7e2df;border-radius:9px;background:#f9fbfa}.recipe-cost-search svg{width:14px;color:#78908a}.recipe-cost-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:8px}.recipe-incomplete-toggle{margin:8px 0;display:flex;align-items:center;gap:6px;color:#61756f;font-size:7px;font-weight:800}.recipe-menu-list{max-height:650px;display:grid;gap:6px;overflow:auto}.recipe-menu-list>button{padding:8px;display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:8px;border:1px solid #e0e8e6;border-radius:9px;background:#fff;color:#244b44;text-align:left}.recipe-menu-list>button.active{border-color:#4ba28e;background:#f1faf7}.recipe-menu-image{width:38px;height:38px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#e7f2ef;color:#4d8176}.recipe-menu-image img{width:100%;height:100%;object-fit:cover}.recipe-menu-list b,.recipe-menu-list small{display:block}.recipe-menu-list b{overflow:hidden;font-size:8px;text-overflow:ellipsis;white-space:nowrap}.recipe-menu-list small{margin-top:2px;color:#7b8c87;font-size:6px}.recipe-menu-list em{padding:3px 6px;border-radius:99px;background:#fff1de;color:#93651a;font-size:6px;font-style:normal;font-weight:900}.recipe-menu-list em.ready{background:#e3f5ef;color:#16715e}.recipe-menu-list svg{width:13px}.recipe-detail-panel{padding:15px}.recipe-detail-head{display:grid;grid-template-columns:1fr auto;align-items:start;gap:10px}.recipe-detail-head h2{margin:3px 0 1px;font-size:19px}.recipe-detail-head p:not(.eyebrow){margin:0;color:#73847f;font-size:8px}.recipe-detail-head button{min-height:38px;padding:0 11px;display:flex;align-items:center;gap:6px;border:0;border-radius:9px;background:#087b69;color:#fff;font-size:8px;font-weight:900}.recipe-detail-head button svg{width:15px}.recipe-cost-kpis{margin:12px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.recipe-cost-kpis article{padding:11px;border:1px solid #dfe8e5;border-radius:10px;background:#f9fbfa}.recipe-cost-kpis span,.recipe-cost-kpis b,.recipe-cost-kpis small{display:block}.recipe-cost-kpis span{color:#6d807a;font-size:7px}.recipe-cost-kpis b{margin:3px 0;color:#14493f;font-size:18px}.recipe-cost-kpis small{color:#869590;font-size:6px}.recipe-cost-kpis article.warning{border-color:#e7c778;background:#fff9e9}.recipe-cost-kpis article.good{border-color:#9ed3c5;background:#f3fbf8}.recipe-cost-warning,.recipe-cost-success{margin:9px 0;padding:8px 10px;display:flex;align-items:center;gap:7px;border-radius:9px;font-size:7px;font-weight:800}.recipe-cost-warning{background:#fff2e9;color:#8e5229}.recipe-cost-success{background:#e9f7f2;color:#176f5e}.recipe-cost-warning svg,.recipe-cost-success svg{width:16px}.recipe-lines{display:grid;gap:6px}.recipe-line{padding:9px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:9px;border:1px solid #e0e8e6;border-radius:9px}.recipe-line b,.recipe-line small{display:block}.recipe-line b{font-size:8px}.recipe-line small{margin-top:2px;color:#7c8c88;font-size:6px}.recipe-line>span{font-size:8px;font-weight:900}.recipe-line>strong{min-width:70px;color:#0c6d5d;font-size:9px;text-align:right}.recipe-empty{padding:32px 12px;display:grid;place-items:center;gap:5px;border:1px dashed #cfded9;border-radius:10px;color:#7e8f8a;text-align:center}.recipe-empty svg{width:31px}.recipe-empty b{font-size:10px}.recipe-empty small{font-size:7px}.recipe-edit-form{margin-top:10px}.recipe-edit-list{max-height:520px;display:grid;gap:6px;overflow:auto}.recipe-edit-row{padding:8px;display:grid;grid-template-columns:minmax(150px,1fr) 100px 44px 90px;align-items:center;gap:7px;border:1px solid #dfe8e5;border-radius:9px}.recipe-edit-row b,.recipe-edit-row small{display:block}.recipe-edit-row b{font-size:8px}.recipe-edit-row small{margin-top:2px;color:#7c8c88;font-size:6px}.recipe-edit-row input{width:100%;height:35px;padding:0 8px;border:1px solid #cfddd9;border-radius:8px;font:inherit;font-size:8px;text-align:right}.recipe-edit-row>em{color:#667a74;font-size:7px;font-style:normal}.recipe-edit-row>strong{color:#0b6e5e;font-size:8px;text-align:right}.recipe-edit-actions{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px}.recipe-edit-actions p{margin:0;color:#9b4d3b;font-size:7px}.recipe-edit-actions>div{display:flex;gap:6px}.recipe-edit-actions button{min-height:36px;padding:0 11px;display:flex;align-items:center;gap:6px;border:1px solid #cadcd7;border-radius:9px;background:#fff;color:#557068;font-size:8px;font-weight:900}.recipe-edit-actions button.primary{border-color:#087b69;background:#087b69;color:#fff}.recipe-edit-actions svg{width:15px}.recipe-cost-page .eyebrow{margin:0;color:#16806c;font-size:6px;font-weight:900;letter-spacing:.13em}.recipe-cost-empty-list{padding:20px;color:#859590;font-size:8px;text-align:center}@media(max-width:900px){.recipe-cost-page{grid-template-columns:1fr}.recipe-menu-panel{position:static}.recipe-menu-list{max-height:300px;grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.recipe-cost-page{gap:9px}.recipe-menu-panel,.recipe-detail-panel{padding:11px}.recipe-menu-list{grid-template-columns:1fr}.recipe-detail-head{grid-template-columns:1fr}.recipe-detail-head button{justify-content:center}.recipe-cost-kpis{grid-template-columns:1fr}.recipe-edit-row{grid-template-columns:1fr 80px 35px}.recipe-edit-row>strong{grid-column:2/-1}.recipe-edit-actions{align-items:stretch;flex-direction:column}.recipe-edit-actions>div{display:grid;grid-template-columns:1fr 1fr}.recipe-edit-actions button{justify-content:center}}
    `}</style>
    <aside className="recipe-menu-panel">
      <header className="recipe-cost-heading"><div><p className="eyebrow">RECIPE COSTING</p><h3>สูตรและต้นทุนเมนู</h3></div><span>{menusWithRecipes.size}/{activeMenus.length} สูตร</span></header>
      <label className="recipe-cost-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือหมวดหมู่…"/></label>
      <label className="recipe-incomplete-toggle"><input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)}/> แสดงเฉพาะเมนูที่ยังไม่มีสูตร</label>
      <div className="recipe-menu-list">{filteredMenus.map((menu) => {
        const lines = recipes.filter((line) => line.menuItemId === menu.id);
        const cost = recipeCost(lines, latestUnitCosts);
        return <button type="button" className={selectedMenu?.id === menu.id ? "active" : ""} key={menu.id} onClick={() => chooseMenu(menu.id)}><span className="recipe-menu-image">{menu.imageUrl ? <img src={menu.imageUrl} alt=""/> : <UtensilsCrossed/>}</span><span><b>{menu.name}</b><small>{menu.category} • {lines.length ? `ต้นทุน ${money(cost)}` : "ยังไม่มีสูตร"}</small></span><em className={lines.length ? "ready" : ""}>{lines.length ? `${lines.length} รายการ` : "รอทำ"}</em><ChevronRight/></button>;
      })}{!filteredMenus.length && <p className="recipe-cost-empty-list">ไม่พบเมนูตามตัวกรอง</p>}</div>
    </aside>

    <section className="recipe-detail-panel">{selectedMenu ? <>
      <header className="recipe-detail-head"><div><p className="eyebrow">COST PER SERVING</p><h2>{selectedMenu.name}</h2><p>{selectedMenu.category} • ราคาขาย {money(selectedMenu.price)} ต่อ 1 จาน</p></div>{!editing && <button type="button" onClick={startEditing}><Calculator/> {selectedLines.length ? "แก้สูตรและต้นทุน" : "สร้างสูตร"}</button>}</header>
      <div className="recipe-cost-kpis">
        <article className={!selectedLines.length || missingCostLines.length ? "warning" : ""}><span>ต้นทุนวัตถุดิบ/จาน</span><b>{money(selectedCost)}</b><small>{missingCostLines.length ? `ขาดราคาซื้อ ${missingCostLines.length} รายการ` : "อ้างอิงราคาซื้อล่าสุด"}</small></article>
        <article className={grossProfit > 0 ? "good" : "warning"}><span>กำไรขั้นต้น/จาน</span><b>{money(grossProfit)}</b><small>ราคาขายหักต้นทุนวัตถุดิบ</small></article>
        <article className={foodCostPercent > 40 ? "warning" : "good"}><span>Food Cost</span><b>{foodCostPercent.toFixed(1)}%</b><small>{foodCostPercent > 40 ? "สูงกว่าเกณฑ์แนะนำ 40%" : "อยู่ในระดับควบคุมได้"}</small></article>
      </div>
      {message && <p className="recipe-cost-success"><CheckCircle2/>{message}</p>}
      {!editing && missingCostLines.length > 0 && <p className="recipe-cost-warning"><AlertTriangle/>ต้นทุนยังไม่สมบูรณ์ กรุณารับสินค้าและระบุราคาซื้อของ {missingCostLines.length} วัตถุดิบ</p>}
      {!editing ? <div className="recipe-lines">{selectedLines.map((line) => { const item = itemById.get(line.inventoryItemId); const unitCost = latestUnitCosts[line.inventoryItemId] ?? 0; return <article className="recipe-line" key={line.id}><span><b>{item?.name ?? line.inventoryItemId}</b><small>{item?.sku ?? "–"} • ราคาล่าสุด {unitCost ? money(unitCost) : "ยังไม่มีราคา"}/{item ? unitLabels[item.unit] : "หน่วย"}</small></span><span>{quantity(line.quantity)} {item ? unitLabels[item.unit] : ""}</span><strong>{money(Math.round(unitCost * line.quantity / 1000))}</strong></article>; })}{!selectedLines.length && <div className="recipe-empty"><PackageSearch/><b>เมนูนี้ยังไม่มีสูตรวัตถุดิบ</b><small>สร้างสูตรเพื่อให้ระบบตัดสต๊อกและคำนวณต้นทุนเมื่อขาย</small></div>}</div>
      : <form className="recipe-edit-form" onSubmit={save}><div className="recipe-edit-list">{inventory.filter((item) => item.active).map((item) => { const raw = values[item.id] ?? ""; const used = Number(raw) || 0; const lineCost = Math.round((latestUnitCosts[item.id] ?? 0) * used); return <label className="recipe-edit-row" key={item.id}><span><b>{item.name}</b><small>{item.sku} • คงเหลือ {quantity(item.currentStock)} {unitLabels[item.unit]} • {latestUnitCosts[item.id] ? `${money(latestUnitCosts[item.id])}/${unitLabels[item.unit]}` : "ยังไม่มีราคาซื้อ"}</small></span><input type="number" min="0" step="0.001" value={raw} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="0.000"/><em>{unitLabels[item.unit]}</em><strong>{used > 0 ? money(lineCost) : "–"}</strong></label>; })}</div><footer className="recipe-edit-actions"><p>{message}</p><div><button type="button" onClick={() => { setEditing(false); setMessage(""); }}>ยกเลิก</button><button className="primary" disabled={working}>{working ? <LoaderCircle className="spin"/> : <Save/>} บันทึกสูตร</button></div></footer></form>}
    </> : <div className="recipe-empty"><CircleDollarSign/><b>ยังไม่มีเมนูสำหรับคำนวณต้นทุน</b></div>}</section>
  </div>;
}
