"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  BellRing,
  CalendarClock,
  Calculator,
  ChefHat,
  ChevronUp,
  CircleUserRound,
  Clock3,
  ClipboardCheck,
  Coffee,
  History,
  Hotel,
  LayoutDashboard,
  KeyRound,
  LoaderCircle,
  LogOut,
  MonitorCog,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Table2,
  Truck,
  UtensilsCrossed,
  UsersRound,
  Store,
  UserPlus,
  WalletCards,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import AuditPanel, { type AuditEntry } from "./audit-panel";
import {
  InventoryManagement,
  MenuManagement,
  type InventoryItem,
  type ManagedMenuItem,
  type MenuRecipe,
  type StockMovement,
  type StockReceipt,
} from "./management-panels";
import DeliveryManagement, { DeliveryRider, type DeliveryOrder, type DeliveryOrderItem } from "./delivery-management";
import DutyShiftPanel, { type DutyAssignment, type DutyShift, type DutyStation } from "./duty-shift-panel";
import HostDesk, { type GuestVisit } from "./host-desk";
import ReadinessPanel, { type ReadinessRun } from "./readiness-panel";
import RecipeCostingPanel from "./recipe-costing-panel";
import StockCountPanel, { type StockCountLine, type StockCountSession } from "./stock-count-panel";
import OpeningClosingPanel, { type OpeningClosingIndicators, type OpeningClosingRun } from "./opening-closing-panel";
import PrinterReadinessPanel, { type PrinterTestRecord, type PrinterTestStation } from "./printer-readiness-panel";
import { createOfflineActionQueue, type OfflineActionQueue, type OfflineQueueSnapshot } from "./offline-action-queue";
import { ServiceRequestDesk, TableQrManagement, type ServiceRequest } from "./table-service-management";
import {
  CheckoutModal,
  ReceiptModal,
  ShiftPanel,
  TableOperationsModal,
  type CashMovement,
  type CashShift,
  type OrderPayment,
} from "./pos-v1-controls";
import { AutoPrintQueuePanel, defaultDepartment, KitchenPrintModal, PrinterSettingsPanel, printerDepartments, type PrintJob, type PrintQueueJob, type PrinterSettings } from "./printing-controls";

type Role = "instructor" | "manager" | "cashier" | "student";
type Profile = { id: string; email: string; name: string; username?: string; role: Role; active: boolean; lastSeenAt: string };
type DiningTable = { id: number; number: number; zone: string; seats: number; status: "available" | "occupied" | "cleaning"; publicToken?: string | null };
type MenuItem = ManagedMenuItem;
type OrderStatus = "open" | "sent" | "preparing" | "ready" | "served" | "paid" | "refunded" | "void";
type Order = { id: string; orderNumber: string; tableId: number; status: OrderStatus; openedBy: string; subtotal: number; discountType: "none" | "percent" | "amount"; discountValue: number; discountAmount: number; serviceChargeRate: number; serviceChargeAmount: number; vatRate: number; vatAmount: number; total: number; paymentMethod: string | null; amountTendered: number; changeAmount: number; receiptNumber: string | null; paidBy: string | null; shiftId: string | null; openedAt: string; updatedAt: string; closedAt: string | null };
type OrderItem = { id: string; orderId: string; menuItemId: number; name: string; unitPrice: number; optionSummary: string; optionPrice: number; note: string; quantity: number; status: string };
type AuditLog = AuditEntry;
type LatestUnitCost = { inventoryItemId: string; unitCost: number; receivedAt: string };
type Snapshot = { profile: Profile; dutyStations: DutyStation[]; dutyShifts: DutyShift[]; dutyAssignments: DutyAssignment[]; guestVisits: GuestVisit[]; readinessRuns: ReadinessRun[]; openingClosingRuns: OpeningClosingRun[]; stockCountSessions: StockCountSession[]; stockCountLines: StockCountLine[]; latestUnitCosts: LatestUnitCost[]; tables: DiningTable[]; menu: MenuItem[]; menuAdmin: MenuItem[]; users: Profile[]; orders: Order[]; items: OrderItem[]; logs: AuditLog[]; inventory: InventoryItem[]; recipes: MenuRecipe[]; movements: StockMovement[]; receipts: StockReceipt[]; deliveryOrders: DeliveryOrder[]; deliveryItems: DeliveryOrderItem[]; deliveryLineGroupUrl: string; serviceRequests: ServiceRequest[]; billingSettings: { vatRate: number; serviceChargeRate: number; promptPayId: string; promptPayName: string }; printerSettings: PrinterSettings; printJobs: PrintJob[]; printQueueJobs: PrintQueueJob[]; shifts: CashShift[]; cashMovements: CashMovement[]; payments: OrderPayment[]; serverTime: string };
type View = "dashboard" | "duty" | "host" | "operations" | "readiness" | "tables" | "service" | "table_qr" | "kitchen" | "bar" | "delivery" | "menu" | "costing" | "inventory" | "stock_count" | "finance" | "audit" | "team";
type SnapshotResponse = Partial<Snapshot> & Pick<Snapshot, "profile" | "tables" | "menu" | "orders" | "items" | "deliveryOrders" | "deliveryLineGroupUrl" | "serviceRequests" | "billingSettings" | "printerSettings" | "serverTime"> & { error?: string };
type ActionResponse = { ok?: boolean; error?: string; orderId?: string; receiptNumber?: string; changeAmount?: number; paymentReference?: string; receivedByName?: string; queueJob?: PrintQueueJob; skipped?: boolean; retrying?: boolean; queued?: boolean; duplicate?: boolean; repairedItems?: number };

const offlineSafeActions = new Set(["addItem", "setItemQuantity", "updateItemDetails", "sendKitchen", "setDepartmentStatus", "acknowledgeService", "resolveService"]);
const emptyOfflineSnapshot: OfflineQueueSnapshot = { items: [], pending: 0, syncing: 0, failed: 0, online: true, isSyncing: false };

const roleLabels: Record<Role, string> = { instructor: "อาจารย์ผู้ควบคุม", manager: "ผู้จัดการ", cashier: "แคชเชียร์", student: "นักศึกษา" };
const statusLabels: Record<OrderStatus, string> = { open: "กำลังรับรายการ", sent: "ส่งเข้าครัว", preparing: "กำลังปรุง", ready: "พร้อมเสิร์ฟ", served: "เสิร์ฟแล้ว", paid: "ชำระแล้ว", refunded: "คืนเงินแล้ว", void: "ยกเลิก" };
const activeStatuses: OrderStatus[] = ["open", "sent", "preparing", "ready", "served"];
const barDepartments = ["บาร์เครื่องดื่ม"];
const kitchenDepartments = printerDepartments.filter((department) => !barDepartments.includes(department));
const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
const time = (value: string) => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function parseApiResponse<T>(response: Response, responseText: string): T {
  if (!responseText) throw new Error(`ระบบกลางตอบกลับไม่สมบูรณ์ (HTTP ${response.status})`);
  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(response.status === 503
      ? "ระบบกำลังประมวลผล กรุณารอสักครู่แล้วลองอีกครั้ง"
      : `ระบบกลางตอบกลับไม่สมบูรณ์ (HTTP ${response.status})`);
  }
}

type NotificationTone = "order" | "kitchen" | "ready" | "waiter" | "bill" | "delivery" | "rider";
type SystemAlert = { tone: NotificationTone; label: string };

const tonePatterns: Record<NotificationTone, Array<[number, number]>> = {
  order: [[659, .08], [784, .12]],
  kitchen: [[523, .09], [659, .09], [784, .14]],
  ready: [[784, .08], [988, .16]],
  waiter: [[880, .09], [659, .09], [880, .14]],
  bill: [[523, .11], [523, .11], [784, .18]],
  delivery: [[440, .1], [554, .1], [659, .16]],
  rider: [[659, .08], [880, .16]],
};

function detectSystemAlerts(previous: Snapshot | null, next: Snapshot): SystemAlert[] {
  if (!previous) return [];
  const alerts: SystemAlert[] = [];
  const previousRequests = new Set(previous.serviceRequests.map((request) => request.id));
  const newRequests = next.serviceRequests.filter((request) => request.status === "open" && !previousRequests.has(request.id));
  if (newRequests.some((request) => request.type === "bill")) alerts.push({ tone: "bill", label: "มีโต๊ะขอคิดเงิน" });
  if (newRequests.some((request) => request.type === "waiter")) alerts.push({ tone: "waiter", label: "มีโต๊ะเรียกพนักงาน" });
  if (newRequests.some((request) => request.type === "seated")) alerts.push({ tone: "waiter", label: "พนักงานต้อนรับพาลูกค้านั่งโต๊ะแล้ว" });

  const previousOrders = new Map(previous.orders.map((order) => [order.id, order]));
  const sentToKitchen = next.orders.some((order) => order.status === "sent" && previousOrders.get(order.id)?.status !== "sent");
  const readyToServe = next.orders.some((order) => order.status === "ready" && previousOrders.get(order.id)?.status !== "ready");
  if (sentToKitchen) alerts.push({ tone: "kitchen", label: "มีออเดอร์ใหม่เข้าครัว" });
  if (readyToServe) alerts.push({ tone: "ready", label: "อาหารพร้อมเสิร์ฟแล้ว" });

  const previousItems = new Map(previous.items.map((item) => [item.id, item.quantity]));
  const hasNewItems = next.items.some((item) => !previousItems.has(item.id) || item.quantity > (previousItems.get(item.id) ?? 0));
  const previousOrderIds = new Set(previous.orders.map((order) => order.id));
  const hasNewOrder = next.orders.some((order) => !previousOrderIds.has(order.id));
  if (!sentToKitchen && (hasNewItems || hasNewOrder)) alerts.push({ tone: "order", label: "มีรายการอาหารใหม่" });

  const previousDeliveries = new Map(previous.deliveryOrders.map((order) => [order.id, order]));
  if (next.deliveryOrders.some((order) => order.status === "pending" && !previousDeliveries.has(order.id))) alerts.push({ tone: "delivery", label: "มีออเดอร์เดลิเวอรีใหม่" });
  if (next.deliveryOrders.some((order) => order.status === "preparing" && previousDeliveries.get(order.id)?.status !== "preparing")) alerts.push({ tone: "rider", label: "มีงานเดลิเวอรีพร้อมรับ" });
  return alerts;
}

function useNotificationSound() {
  const contextRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);
  const readyRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const setPreference = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabled(value);
    window.localStorage.setItem("hotel-central-notification-sound", value ? "on" : "off");
    if (!value) {
      readyRef.current = false;
      setReady(false);
      void contextRef.current?.suspend();
    }
  }, []);

  const unlock = useCallback(async () => {
    if (!enabledRef.current) return false;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (context.state !== "running") await context.resume();
    const isReady = context.state === "running";
    readyRef.current = isReady;
    setReady(isReady);
    return isReady;
  }, []);

  const play = useCallback(async (tone: NotificationTone) => {
    if (!enabledRef.current || !readyRef.current) return;
    const context = contextRef.current;
    if (!context) return;
    if (context.state !== "running") await context.resume().catch(() => undefined);
    if (context.state !== "running") return;
    let start = context.currentTime + .015;
    for (const [frequency, duration] of tonePatterns[tone]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone === "bill" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.18, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
      start += duration + .045;
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("hotel-central-notification-sound");
    if (stored === "off") {
      enabledRef.current = false;
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || ready) return;
    const activate = () => { void unlock(); };
    window.addEventListener("pointerdown", activate, { once: true });
    window.addEventListener("keydown", activate, { once: true });
    return () => { window.removeEventListener("pointerdown", activate); window.removeEventListener("keydown", activate); };
  }, [enabled, ready, unlock]);

  const handleButton = useCallback(async () => {
    if (enabledRef.current && readyRef.current) {
      setPreference(false);
      return;
    }
    setPreference(true);
    if (await unlock()) await play("order");
  }, [play, setPreference, unlock]);

  return { enabled, ready, play, handleButton };
}

export default function PosApp({ signedInUser }: { signedInUser: { id: string; name: string; email: string; signOutUrl: string } }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("tables");
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [category, setCategory] = useState("ทั้งหมด");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [lastAlert, setLastAlert] = useState("");
  const [online, setOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueSnapshot>(emptyOfflineSnapshot);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ order: Order; items: OrderItem[]; payments: Array<{ method: string; amount: number; status?: string; referenceCode?: string; receivedByName?: string; reversalReason?: string }> } | null>(null);
  const sound = useNotificationSound();
  const soundPlayRef = useRef(sound.play);
  const snapshotRef = useRef<Snapshot | null>(null);
  const viewRef = useRef<View>("tables");
  const alertTimerRef = useRef<number | null>(null);
  const offlineQueueRef = useRef<OfflineActionQueue | null>(null);

  useEffect(() => { soundPlayRef.current = sound.play; }, [sound.play]);

  const load = useCallback(async (quiet = false, announce = false, scopeOverride?: View, mode: "full" | "live" = "full") => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/pos?scope=${encodeURIComponent(scopeOverride ?? viewRef.current)}${mode === "live" ? "&mode=live" : ""}`, { cache: "no-store" });
      const responseText = await response.text();
      const payload = parseApiResponse<SnapshotResponse>(response, responseText);
      if (response.status === 401) {
        // Static HTML is public, but all POS data/actions stay protected by API auth.
        window.location.replace("/login?return_to=%2F");
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "โหลดข้อมูลไม่สำเร็จ");
      const previous = snapshotRef.current;
      const next: Snapshot = {
        ...previous,
        ...payload,
        menuAdmin: payload.menuAdmin ?? previous?.menuAdmin ?? [],
        users: payload.users ?? previous?.users ?? [],
        logs: payload.logs ?? previous?.logs ?? [],
        inventory: payload.inventory ?? previous?.inventory ?? [],
        recipes: payload.recipes ?? previous?.recipes ?? [],
        movements: payload.movements ?? previous?.movements ?? [],
        receipts: payload.receipts ?? previous?.receipts ?? [],
        deliveryItems: payload.deliveryItems ?? previous?.deliveryItems ?? [],
        shifts: payload.shifts ?? previous?.shifts ?? [],
        cashMovements: payload.cashMovements ?? previous?.cashMovements ?? [],
        payments: payload.payments ?? previous?.payments ?? [],
        printJobs: payload.printJobs ?? previous?.printJobs ?? [],
        printQueueJobs: payload.printQueueJobs ?? previous?.printQueueJobs ?? [],
        dutyStations: payload.dutyStations ?? previous?.dutyStations ?? [],
        dutyShifts: payload.dutyShifts ?? previous?.dutyShifts ?? [],
        dutyAssignments: payload.dutyAssignments ?? previous?.dutyAssignments ?? [],
        guestVisits: payload.guestVisits ?? previous?.guestVisits ?? [],
        readinessRuns: payload.readinessRuns ?? previous?.readinessRuns ?? [],
        openingClosingRuns: payload.openingClosingRuns ?? previous?.openingClosingRuns ?? [],
        stockCountSessions: payload.stockCountSessions ?? previous?.stockCountSessions ?? [],
        stockCountLines: payload.stockCountLines ?? previous?.stockCountLines ?? [],
        latestUnitCosts: payload.latestUnitCosts ?? previous?.latestUnitCosts ?? [],
      } as Snapshot;
      const alerts = announce ? detectSystemAlerts(previous, next) : [];
      snapshotRef.current = next;
      setData(next);
      setOnline(true);
      setError("");
      if (alerts.length) {
        alerts.forEach((alert, index) => window.setTimeout(() => void soundPlayRef.current(alert.tone), index * 280));
        setLastAlert(alerts[alerts.length - 1].label);
        if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = window.setTimeout(() => setLastAlert(""), 5500);
      }
    } catch (cause) {
      setOnline(false);
      setError(cause instanceof Error ? cause.message : "เชื่อมต่อระบบกลางไม่ได้");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const queue = createOfflineActionQueue();
    offlineQueueRef.current = queue;
    const unsubscribe = queue.subscribe((snapshot) => {
      setOfflineQueue(snapshot);
      setOnline(snapshot.online);
    });
    const syncAndRefresh = async () => {
      const before = await queue.snapshot();
      const after = await queue.sync();
      if (before.items.length > after.items.length) await load(true, false);
    };
    void syncAndRefresh();
    window.addEventListener("online", syncAndRefresh);
    return () => {
      window.removeEventListener("online", syncAndRefresh);
      unsubscribe();
      queue.dispose();
      offlineQueueRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    // Do not poll while the tab is hidden, or start a second background
    // refresh before the previous one finishes. Refresh immediately on return.
    // This reduces needless Worker CPU consumption on idle devices.
    let polling = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || polling || !snapshotRef.current) return;
      // Finance and audit contain historical snapshots. A tables-only poll would
      // overwrite those reports with the shorter active-order window.
      // Keep them stable until the user taps the existing Refresh button.
      if (["finance", "audit"].includes(viewRef.current)) return;
      polling = true;
      try {
        await load(true, true, undefined, "live");
      } finally {
        polling = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    // Keep the kitchen/bar/service screens responsive; poll administration and
    // less time-sensitive views less frequently. No visual or feature removal.
    // The timer itself is local: only a completed refresh invokes the Worker.
    let lastRefreshAt = 0;
    const scheduledRefresh = () => {
      const scope = viewRef.current;
      const fastScreen = ["kitchen", "bar", "service", "host", "delivery"].includes(scope);
      const interval = fastScreen ? 12_000 : 30_000;
      if (Date.now() - lastRefreshAt < interval) return;
      lastRefreshAt = Date.now();
      void refresh();
    };
    const timer = window.setInterval(scheduledRefresh, 12_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    viewRef.current = view;
    if (snapshotRef.current) void load(true, false);
  }, [view, load]);

  const act = useCallback(async (body: Record<string, unknown>) => {
    setWorking(true);
    try {
      const durableBody = { ...body, clientRequestId: crypto.randomUUID() };
      if (offlineSafeActions.has(String(body.action ?? "")) && offlineQueueRef.current) {
        const result = await offlineQueueRef.current.execute<ActionResponse>(durableBody);
        if (result.queued) {
          setOnline(false);
          setLastAlert("บันทึกรายการไว้ในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่ออินเทอร์เน็ตกลับมา");
          return { ok: true, queued: true } satisfies ActionResponse;
        }
        setOnline(true);
        await load(true, false);
        return result.payload;
      }
      const response = await fetch("/api/pos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(durableBody) });
      const responseText = await response.text();
      const payload = parseApiResponse<ActionResponse>(response, responseText);
      if (!response.ok) throw new Error(payload.error ?? "ทำรายการไม่สำเร็จ");
      setOnline(true);
      await load(true, false);
      return payload;
    } catch (cause) {
      if (cause instanceof TypeError) setOnline(false);
      setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setWorking(false);
    }
  }, [load]);

  const activeOrders = useMemo(() => data?.orders.filter((order) => activeStatuses.includes(order.status)) ?? [], [data]);
  const selectedOrder = selectedTable ? activeOrders.find((order) => order.tableId === selectedTable) : undefined;
  const selectedItems = selectedOrder ? data?.items.filter((item) => item.orderId === selectedOrder.id) ?? [] : [];
  const management = data ? ["instructor", "manager"].includes(data.profile.role) : false;
  const dutyStationSet = new Set(data?.dutyStations ?? []);
  const canOperateTables = management || data?.profile.role === "cashier" || dutyStationSet.has("host") || dutyStationSet.has("service") || dutyStationSet.has("cashier_trainee");
  const canHost = management || dutyStationSet.has("host");
  const canHandleService = management || dutyStationSet.has("host") || dutyStationSet.has("service");
  const canKitchen = management || dutyStationSet.has("kitchen");
  const canBar = management || dutyStationSet.has("bar");
  const canDelivery = management || dutyStationSet.has("delivery");
  const canPay = data ? ["instructor", "manager", "cashier"].includes(data.profile.role) || dutyStationSet.has("cashier_trainee") : false;
  const categories = ["ทั้งหมด", ...Array.from(new Set(data?.menu.map((item) => item.category) ?? []))];
  const filteredMenu = data?.menu.filter((item) => category === "ทั้งหมด" || item.category === category) ?? [];
  const serviceBadge = data?.serviceRequests.filter((request) => request.status !== "resolved").length ?? 0;
  const departmentByMenuId = useMemo(() => new Map((data?.menu ?? []).map((item) => [item.id, data?.printerSettings.categoryDepartments[item.category] || defaultDepartment(item.category)])), [data?.menu, data?.printerSettings.categoryDepartments]);
  const activeOrderIds = useMemo(() => new Set(activeOrders.map((order) => order.id)), [activeOrders]);
  const pendingProductionItems = data?.items.filter((item) => activeOrderIds.has(item.orderId) && ["sent", "preparing"].includes(item.status)) ?? [];
  const kitchenBadge = new Set(pendingProductionItems.filter((item) => !barDepartments.includes(departmentByMenuId.get(item.menuItemId) ?? "ครัวร้อน")).map((item) => item.orderId)).size;
  const barBadge = new Set(pendingProductionItems.filter((item) => barDepartments.includes(departmentByMenuId.get(item.menuItemId) ?? "ครัวร้อน")).map((item) => item.orderId)).size;
  const tableBadge = activeOrders.length;
  const deliveryBadge = data?.deliveryOrders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length ?? 0;
  const totalAttentionBadge = serviceBadge + kitchenBadge + barBadge + deliveryBadge;
  const badgeText = (value: number) => value > 99 ? "99+" : String(value);
  const serviceDate = data ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.serverTime)) : "";
  const latestUnitCostRecord = Object.fromEntries((data?.latestUnitCosts ?? []).map((row) => [row.inventoryItemId, row.unitCost]));
  const checkedInAssignments = data?.dutyAssignments.filter((assignment) => assignment.status === "checked_in") ?? [];
  const openingClosingIndicators: OpeningClosingIndicators = {
    staffCheckedIn: checkedInAssignments.length,
    kitchenAssigned: checkedInAssignments.some((assignment) => assignment.station === "kitchen"),
    barAssigned: checkedInAssignments.some((assignment) => assignment.station === "bar"),
    activeInventoryItems: data?.inventory.filter((item) => item.active).length ?? 0,
    lowStockItems: data?.inventory.filter((item) => item.active && item.currentStock <= item.minimumStock).length ?? 0,
    cashShiftOpen: data?.shifts.some((shift) => shift.status === "open") ?? false,
    printerQueueFailures: data?.printQueueJobs.filter((job) => job.status === "failed").length ?? 0,
    openOrders: activeOrders.length,
    pendingProductionItems: pendingProductionItems.length,
    unresolvedServiceRequests: serviceBadge,
    lastBackupAt: data?.logs.find((log) => log.action === "EXPORT_BACKUP")?.createdAt ?? null,
  };
  const printerTests: PrinterTestRecord[] = (data?.logs ?? []).flatMap((log) => {
    if (!['PRINTER_TEST_PASS', 'PRINTER_TEST_FAIL'].includes(log.action)) return [];
    const [stationValue, paperValue, ...detailParts] = log.detail.split(" • ");
    if (!['kitchen', 'bar', 'receipt'].includes(stationValue)) return [];
    return [{
      id: log.id,
      station: stationValue as PrinterTestStation,
      paperWidth: paperValue.includes("58") ? 58 : 80,
      status: log.action === "PRINTER_TEST_PASS" ? "pass" as const : "fail" as const,
      detail: detailParts.join(" • "),
      actorName: log.actorName,
      createdAt: log.createdAt,
    }];
  });

  useEffect(() => {
    if (!data || management) return;
    const allowed = new Set<View>(["duty"]);
    if (canHost) allowed.add("host");
    if (canOperateTables) allowed.add("tables");
    if (canHandleService) allowed.add("service");
    if (canKitchen) allowed.add("kitchen");
    if (canBar) allowed.add("bar");
    if (canDelivery) allowed.add("delivery");
    if (canPay) allowed.add("finance");
    if (!allowed.has(view)) setView("duty");
  }, [canBar, canDelivery, canHandleService, canHost, canKitchen, canOperateTables, canPay, data, management, view]);

  const chooseTable = async (tableId: number) => {
    setSelectedTable(tableId);
    setView("tables");
    if (!activeOrders.some((order) => order.tableId === tableId)) await act({ action: "openOrder", tableId });
  };

  if (loading && !data) {
    return <main className="center-screen"><LoaderCircle className="spin" /><h1>กำลังเชื่อมต่อระบบกลาง</h1><p>Hotel Central POS</p></main>;
  }

  if (!data) {
    return <main className="center-screen"><ShieldCheck /><h1>ยังเข้าใช้งานไม่ได้</h1><p>{error || "ไม่พบข้อมูลผู้ใช้"}</p><button onClick={() => void load()}>ลองอีกครั้ง</button></main>;
  }

  const nav: Array<{ id: View; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    ...(management ? [{ id: "dashboard" as View, label: "ภาพรวม", icon: LayoutDashboard }] : []),
    { id: "duty" as View, label: "หน้าที่ประจำกะ", icon: CalendarClock },
    ...(canHost ? [{ id: "host" as View, label: "พนักงานต้อนรับ", icon: Hotel }] : []),
    ...(canOperateTables ? [{ id: "tables" as View, label: "โต๊ะ / รับออเดอร์", icon: Table2, badge: tableBadge }] : []),
    ...(canHandleService ? [{ id: "service" as View, label: "เรียกบริการ", icon: BellRing, badge: serviceBadge }] : []),
    ...(canPay ? [{ id: "finance" as View, label: "กะ / การเงิน", icon: WalletCards }] : []),
    ...(!management && canKitchen ? [{ id: "kitchen" as View, label: "จอครัว", icon: ChefHat, badge: kitchenBadge }] : []),
    ...(!management && canBar ? [{ id: "bar" as View, label: "จอบาร์ / เครื่องดื่ม", icon: Coffee, badge: barBadge }] : []),
    ...(!management && canDelivery ? [{ id: "delivery" as View, label: "งานส่งอาหาร", icon: Truck, badge: deliveryBadge }] : []),
    ...(management ? [{ id: "table_qr" as View, label: "QR ประจำโต๊ะ", icon: QrCode }, { id: "kitchen" as View, label: "จอครัว", icon: ChefHat, badge: kitchenBadge }, { id: "bar" as View, label: "จอบาร์ / เครื่องดื่ม", icon: Coffee, badge: barBadge }, { id: "delivery" as View, label: "เดลิเวอรี", icon: Truck, badge: deliveryBadge }, { id: "menu" as View, label: "จัดการเมนู", icon: UtensilsCrossed }, { id: "costing" as View, label: "สูตร / ต้นทุน", icon: Calculator }, { id: "inventory" as View, label: "สต๊อกสินค้า", icon: PackageSearch }, { id: "stock_count" as View, label: "ตรวจนับสต๊อก", icon: ClipboardCheck }, { id: "operations" as View, label: "เปิด–ปิดร้าน", icon: Store }, { id: "readiness" as View, label: "ตรวจความพร้อม", icon: MonitorCog }, { id: "audit" as View, label: "ประวัติการแก้ไข", icon: History }, { id: "team" as View, label: "ผู้ใช้งาน", icon: UsersRound }] : []),
  ];

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <div className="brand"><span className="brand-mark">H</span><span><b>Hotel Central</b><small>POS • UNIVERSITY</small></span></div>
        <nav>{nav.map(({ id, label, icon: Icon, badge }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); if (id !== "tables") setSelectedTable(null); }}><span className="nav-icon-wrap"><Icon size={19}/>{Boolean(badge) && <b className="nav-count-badge">{badgeText(badge ?? 0)}</b>}</span><span>{label}</span></button>)}</nav>
        <div className="mode-card"><BookOpenCheck size={20}/><div><b>PRE-PRODUCTION</b><small>ระบบทดสอบก่อนเปิดร้านจริง</small></div></div>
        <a className="signout" href={signedInUser.signOutUrl}><LogOut size={17}/> ออกจากระบบ</a>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">ห้องอาหารโรงแรมมหาวิทยาลัย</p><h1>{view === "dashboard" ? "ศูนย์ควบคุม" : view === "duty" ? "หน้าที่ประจำกะ" : view === "host" ? "จอพนักงานต้อนรับ" : view === "operations" ? "ควบคุมเปิด–ปิดร้าน" : view === "readiness" ? "ตรวจความพร้อมก่อนเปิดร้าน" : view === "service" ? "คำขอบริการจากโต๊ะ" : view === "finance" ? "กะและการเงิน" : view === "audit" ? "ประวัติการทำรายการ" : view === "table_qr" ? "QR สั่งอาหารประจำโต๊ะ" : view === "kitchen" ? "จอครัวกลาง" : view === "bar" ? "จอบาร์เครื่องดื่ม" : view === "delivery" ? "เดลิเวอรีในมหาวิทยาลัย" : view === "menu" ? "จัดการเมนู" : view === "costing" ? "สูตรอาหารและต้นทุน" : view === "inventory" ? "สต๊อกสินค้า" : view === "stock_count" ? "ตรวจนับสต๊อกประจำวัน" : view === "team" ? "จัดการผู้ใช้งาน" : selectedTable ? `โต๊ะ ${selectedTable}` : "แผนผังโต๊ะ"}</h1></div>
          <div className="top-actions"><button className="icon-button attention-button" title="รายการที่ต้องดำเนินการ" onClick={() => { setView(serviceBadge ? "service" : kitchenBadge && management ? "kitchen" : barBadge && management ? "bar" : deliveryBadge ? "delivery" : "tables"); setSelectedTable(null); }}><BellRing size={18}/>{totalAttentionBadge > 0 && <b className="top-count-badge">{badgeText(totalAttentionBadge)}</b>}</button><button className={`icon-button sound-toggle ${sound.enabled && sound.ready ? "active" : ""}`} title={sound.enabled && sound.ready ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"} onClick={() => void sound.handleButton()}>{sound.enabled && sound.ready ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className="icon-button refresh-button" title="รีเฟรช" onClick={() => void load()}><RefreshCw size={18}/></button><div className={`online ${online ? "" : "offline"}`}><i/> {online ? "เชื่อมต่อระบบกลาง" : "ออฟไลน์ • กำลังลองใหม่"}</div><div className="profile"><CircleUserRound/><span><b>{data.profile.name}</b><small>{roleLabels[data.profile.role]}</small></span></div></div>
        </header>

        {error && <div className="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {sound.enabled && !sound.ready && <div className="sound-permission-banner"><Volume2/><span><b>เปิดเสียงแจ้งเตือนการบริการ</b><small>แตะปุ่มเพื่อรับเสียงออเดอร์ เรียกพนักงาน คิดเงิน ครัว และเดลิเวอรี</small></span><button onClick={() => void sound.handleButton()}>เปิดเสียง</button></div>}
        {lastAlert && <div className="system-alert-toast"><BellRing/><span><b>{lastAlert}</b><small>แจ้งเตือนจากระบบกลาง</small></span></div>}
        {offlineQueue.items.length > 0 && <div className={`offline-queue-banner ${offlineQueue.failed ? "has-failed" : ""}`}><RefreshCw className={offlineQueue.isSyncing ? "spin" : ""}/><span><b>{offlineQueue.failed ? `มี ${offlineQueue.failed} รายการที่ซิงก์ไม่สำเร็จ` : `เก็บ ${offlineQueue.pending + offlineQueue.syncing} รายการไว้ในเครื่อง`}</b><small>{offlineQueue.online ? "กำลังส่งตามลำดับไปยังระบบกลาง" : "ปลอดภัยในเครื่องนี้ และจะส่งอัตโนมัติเมื่ออินเทอร์เน็ตกลับมา"}</small></span><div><button disabled={!offlineQueue.online || offlineQueue.isSyncing} onClick={() => void offlineQueueRef.current?.sync().then(() => load(true, false))}>ซิงก์ตอนนี้</button>{offlineQueue.items.filter((item) => item.status === "failed").slice(0, 1).map((item) => <span key={item.id}><button onClick={() => void offlineQueueRef.current?.retry(item.id).then(() => load(true, false))}>ลองใหม่</button><button className="danger" onClick={() => void offlineQueueRef.current?.discard(item.id)}>ลบทิ้ง</button></span>)}</div></div>}

        {view === "dashboard" && management && <Dashboard data={data} activeOrders={activeOrders} onGo={(next) => setView(next)} />}
        {view === "duty" && <DutyShiftPanel profile={data.profile} management={management} users={data.users} shifts={data.dutyShifts} assignments={data.dutyAssignments} working={working} onAction={(body) => act(body).then(Boolean)}/>}
        {view === "host" && canHost && <HostDesk visits={data.guestVisits} tables={data.tables} working={working} onAction={(body) => act(body).then(Boolean)}/>}
        {view === "readiness" && management && <ReadinessPanel runs={data.readinessRuns} logs={data.logs} working={working} onAction={(body) => act(body).then(Boolean)}/>}
        {view === "operations" && management && <div className="operations-control-page"><OpeningClosingPanel profileName={data.profile.name} serviceDate={serviceDate} runs={data.openingClosingRuns} indicators={openingClosingIndicators} working={working} onAction={(body) => act(body).then(Boolean)}/><div className="content operations-printer-wrap"><PrinterReadinessPanel paperWidth={data.printerSettings.paperWidth} tests={printerTests} working={working} onPaperWidthChange={(paperWidth) => void act({ action: "setPrinterSettings", paperWidth, categoryDepartments: data.printerSettings.categoryDepartments })} onAction={(body) => act(body).then(Boolean)}/></div></div>}
        {view === "tables" && canOperateTables && !selectedTable && <TableMap tables={data.tables} orders={activeOrders} onChoose={(id) => void chooseTable(id)} />}
        {view === "tables" && canOperateTables && selectedTable && <OrderScreen table={data.tables.find((row) => row.id === selectedTable)!} order={selectedOrder} items={selectedItems} categories={categories} category={category} setCategory={setCategory} menu={filteredMenu} working={working} canPay={canPay} onBack={() => setSelectedTable(null)} onAdd={(menuItemId) => selectedOrder && void act({ action: "addItem", orderId: selectedOrder.id, menuItemId })} onQuantity={(itemId, quantity) => selectedOrder && void act({ action: "setItemQuantity", orderId: selectedOrder.id, itemId, quantity })} onUpdateItem={(itemId, optionSummary, optionPrice, note) => selectedOrder ? act({ action: "updateItemDetails", orderId: selectedOrder.id, itemId, optionSummary, optionPrice, note }).then(Boolean) : Promise.resolve(false)} onSend={() => selectedOrder && void act({ action: "sendKitchen", orderId: selectedOrder.id })} onCheckout={() => setCheckoutOpen(true)} onOperations={() => setOperationsOpen(true)} />}
        {view === "service" && canHandleService && <ServiceRequestDesk requests={data.serviceRequests} tables={data.tables} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "table_qr" && management && <TableQrManagement tables={data.tables} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "kitchen" && canKitchen && <ProductionBoard mode="kitchen" settingsEditable={management} orders={activeOrders} items={data.items} tables={data.tables} menu={data.menu} printJobs={data.printJobs} printQueueJobs={data.printQueueJobs} settings={data.printerSettings} working={working} onAction={act} onStatus={(orderId, departments, status) => void act({ action: "setDepartmentStatus", orderId, departments, status })} />}
        {view === "bar" && canBar && <ProductionBoard mode="bar" settingsEditable={management} orders={activeOrders} items={data.items} tables={data.tables} menu={data.menu} printJobs={data.printJobs} printQueueJobs={data.printQueueJobs} settings={data.printerSettings} working={working} onAction={act} onStatus={(orderId, departments, status) => void act({ action: "setDepartmentStatus", orderId, departments, status })} />}
        {view === "delivery" && management && <DeliveryManagement orders={data.deliveryOrders} items={data.deliveryItems} lineGroupUrl={data.deliveryLineGroupUrl} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "delivery" && !management && canDelivery && <DeliveryRider profileId={data.profile.id} orders={data.deliveryOrders} items={data.deliveryItems} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "menu" && management && <MenuManagement menus={data.menuAdmin} inventory={data.inventory} recipes={data.recipes} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "costing" && management && <div className="content"><RecipeCostingPanel menus={data.menuAdmin} inventory={data.inventory} recipes={data.recipes} latestUnitCosts={latestUnitCostRecord} working={working} onAction={(body) => act(body).then(Boolean)} /></div>}
        {view === "inventory" && management && <InventoryManagement items={data.inventory} movements={data.movements} receipts={data.receipts} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "stock_count" && management && <StockCountPanel serviceDate={serviceDate} profileName={data.profile.name} canApprove={management} inventory={data.inventory} sessions={data.stockCountSessions} lines={data.stockCountLines} working={working} onAction={(body) => act(body).then(Boolean)} />}
        {view === "finance" && canPay && <ShiftPanel shifts={data.shifts} movements={data.cashMovements} payments={data.payments} orders={data.orders} settings={data.billingSettings} working={working} management={management} instructor={data.profile.role === "instructor"} onAction={(body) => act(body).then(Boolean)} onOpenReceipt={(orderId) => { const order = data.orders.find((row) => row.id === orderId); if (order) setReceipt({ order, items: data.items.filter((item) => item.orderId === orderId), payments: data.payments.filter((payment) => payment.orderId === orderId) }); }} />}
        {view === "audit" && management && <AuditPanel logs={data.logs} />}
        {view === "team" && management && <Team users={data.users} current={data.profile} working={working} onRole={(userId, role) => void act({ action: "setRole", userId, role })} onCreate={(account) => act({ action: "createUser", ...account }).then(Boolean)} onReset={(userId, password) => act({ action: "resetPassword", userId, password }).then(Boolean)} />}
      </section>

      {checkoutOpen && selectedOrder && <CheckoutModal order={selectedOrder} items={selectedItems} settings={data.billingSettings} hasOpenShift={data.shifts.some((shift) => shift.status === "open")} working={working} onClose={() => setCheckoutOpen(false)} onApply={(values) => act({ action: "updateOrderCharges", orderId: selectedOrder.id, ...values }).then(Boolean)} onPay={async (values) => {
        const paidOrder = selectedOrder;
        const paidItems = [...selectedItems];
        const result = await act({ action: "settleOrder", orderId: selectedOrder.id, ...values });
        if (!result) return false;
        setCheckoutOpen(false);
        setReceipt({ order: { ...paidOrder, status: "paid", receiptNumber: result.receiptNumber ?? null, changeAmount: result.changeAmount ?? 0, amountTendered: Math.round(values.amountTendered * 100), paymentMethod: values.payments.map((row) => row.method).join("+"), closedAt: new Date().toISOString() }, items: paidItems, payments: values.payments.map((payment) => ({ method: payment.method, amount: Math.round(payment.amount * 100), status: "confirmed", referenceCode: result.paymentReference, receivedByName: result.receivedByName })) });
        setSelectedTable(null);
        return true;
      }} />}
      {operationsOpen && selectedOrder && <TableOperationsModal order={selectedOrder} items={selectedItems} tables={data.tables} activeOrders={activeOrders} working={working} canVoid={management} onClose={() => setOperationsOpen(false)} onAction={async (body) => { const ok = Boolean(await act(body)); if (ok && body.action === "voidOrder") setSelectedTable(null); return ok; }} />}
      {receipt && <ReceiptModal order={receipt.order} items={receipt.items} payments={receipt.payments} settings={data.billingSettings} printerSettings={data.printerSettings} printJobs={data.printJobs.filter((job) => job.orderId === receipt.order.id && job.documentType === "receipt")} working={working} onRecordPrint={(values) => act({ action: "recordPrint", documentType: "receipt", orderId: receipt.order.id, ...values }).then(Boolean)} onClose={() => setReceipt(null)} />}

      <nav className="mobile-nav">{nav.map(({ id, label, icon: Icon, badge }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSelectedTable(null); }}><span className="nav-icon-wrap"><Icon size={20}/>{Boolean(badge) && <b className="nav-count-badge">{badgeText(badge ?? 0)}</b>}</span><span>{label.split(" /")[0]}</span></button>)}</nav>
    </main>
  );
}

function Dashboard({ data, activeOrders, onGo }: { data: Snapshot; activeOrders: Order[]; onGo: (view: View) => void }) {
  const occupied = data.tables.filter((table) => table.status === "occupied").length;
  const todayPaid = data.orders.filter((order) => order.status === "paid" && new Date(order.closedAt ?? order.updatedAt).toDateString() === new Date().toDateString());
  const serviceCount = data.serviceRequests.filter((request) => request.status !== "resolved").length;
  const cards = [
    { label: "โต๊ะที่ใช้งาน", value: `${occupied} / 40`, detail: `ว่าง ${40 - occupied} โต๊ะ`, icon: Table2, tone: "blue" },
    { label: "ออเดอร์ในระบบ", value: String(activeOrders.length), detail: `รอครัว ${activeOrders.filter((o) => ["sent", "preparing"].includes(o.status)).length}`, icon: ShoppingBag, tone: "orange" },
    { label: "คำขอบริการ", value: String(serviceCount), detail: "เรียกพนักงาน / คิดเงิน", icon: BellRing, tone: "green" },
    { label: "ยอดทดสอบวันนี้", value: money(todayPaid.reduce((sum, row) => sum + row.total, 0)), detail: `${todayPaid.length} บิล`, icon: WalletCards, tone: "purple" },
  ];
  return <div className="content"><section className="hero"><div><span className="pill"><MonitorCog size={15}/> COMMAND CENTER</span><h2>ควบคุมทุกโต๊ะจากคอมพิวเตอร์เครื่องเดียว</h2><p>ติดตามโทรศัพท์นักศึกษา ออเดอร์ และสถานะครัวแบบรวมศูนย์</p></div><button onClick={() => onGo("tables")}>เปิดแผนผัง 40 โต๊ะ</button></section><section className="stat-grid">{cards.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className="stat-card"><span className={`icon-tile ${tone}`}><Icon/></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>)}</section><section className="dashboard-grid"><article className="panel"><div className="panel-title"><div><p className="eyebrow">LIVE OPERATIONS</p><h3>ออเดอร์ล่าสุด</h3></div><button className="text-button" onClick={() => onGo("kitchen")}>ดูจอครัว</button></div><div className="order-list">{activeOrders.slice(0, 6).map((order) => <div className="order-row" key={order.id}><b>โต๊ะ {order.tableId}</b><span className={`status ${order.status}`}>{statusLabels[order.status]}</span><small>{order.orderNumber}</small><strong>{money(order.total)}</strong></div>)}{!activeOrders.length && <Empty text="ยังไม่มีออเดอร์ในระบบ"/>}</div></article><article className="panel"><div className="panel-title"><div><p className="eyebrow">AUDIT TRAIL</p><h3>กิจกรรมระบบ</h3></div><button className="text-button" onClick={() => onGo("audit")}>ดูทั้งหมด</button></div><div className="timeline">{data.logs.slice(0, 6).map((log) => <div key={log.id}><i/><p>{log.detail}<small>{time(log.createdAt)} • {log.actorName} • {log.action}</small></p></div>)}{!data.logs.length && <Empty text="ยังไม่มีกิจกรรม"/>}</div></article></section></div>;
}

function TableMap({ tables, orders, onChoose }: { tables: DiningTable[]; orders: Order[]; onChoose: (id: number) => void }) {
  const zones = Array.from(new Set(tables.map((table) => table.zone)));
  return <div className="content"><div className="legend"><span><i className="available"/>ว่าง</span><span><i className="occupied"/>มีลูกค้า</span><span><i className="ready"/>พร้อมเสิร์ฟ</span></div>{zones.map((zone) => <section className="zone" key={zone}><div className="zone-heading"><div><p className="eyebrow">ZONE</p><h2>{zone}</h2></div><span>{tables.filter((table) => table.zone === zone).length} โต๊ะ</span></div><div className="table-grid">{tables.filter((table) => table.zone === zone).map((table) => { const order = orders.find((row) => row.tableId === table.id); return <button key={table.id} className={`table-card ${order?.status ?? table.status}`} onClick={() => onChoose(table.id)}><span className="table-number">{String(table.number).padStart(2, "0")}</span><div><b>โต๊ะ {table.number}</b><small>{table.seats} ที่นั่ง</small></div>{order ? <><span className={`status ${order.status}`}>{statusLabels[order.status]}</span><strong>{money(order.total)}</strong></> : <span className="available-label">พร้อมใช้งาน</span>}</button>; })}</div></section>)}</div>;
}

function OrderScreen({ table, order, items, categories, category, setCategory, menu, working, canPay, onBack, onAdd, onQuantity, onUpdateItem, onSend, onCheckout, onOperations }: { table: DiningTable; order?: Order; items: OrderItem[]; categories: string[]; category: string; setCategory: (value: string) => void; menu: MenuItem[]; working: boolean; canPay: boolean; onBack: () => void; onAdd: (id: number) => void; onQuantity: (itemId: string, quantity: number) => void; onUpdateItem: (itemId: string, optionSummary: string, optionPrice: number, note: string) => Promise<boolean>; onSend: () => void; onCheckout: () => void; onOperations: () => void }) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [editOption, setEditOption] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  useEffect(() => setTicketOpen(false), [table.id]);
  const draftCount = items.filter((item) => item.status === "draft").reduce((sum, item) => sum + item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  function openEditor(item: OrderItem) { setEditingItem(item); setEditOption(item.optionSummary); setEditPrice(String(item.optionPrice / 100)); setEditNote(item.note); }
  async function saveItem(event: FormEvent) { event.preventDefault(); if (!editingItem) return; if (await onUpdateItem(editingItem.id, editOption, Number(editPrice) || 0, editNote)) setEditingItem(null); }
  return <div className="order-layout">
    <section className="menu-area">
      <button className="back-button" onClick={onBack}>← กลับไปแผนผัง</button>
      <div className="table-context"><div><span>โต๊ะ {table.number}</span><p>{table.zone} • {table.seats} ที่นั่ง</p></div>{order && <button className="table-tools-button" onClick={onOperations}><Table2/> ย้าย / รวม / แยกบิล</button>}</div>
      <div className="category-tabs">{categories.map((value) => <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{value}</button>)}</div>
      <div className="menu-grid">{menu.map((item) => <button key={item.id} className={`menu-card order-menu-card ${!item.available ? "unavailable" : ""}`} disabled={working || order?.status === "paid" || !item.available} onClick={() => onAdd(item.id)}>
        <span className={`order-menu-photo ${item.imageUrl ? "" : "placeholder"}`}>
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <ChefHat size={34}/>}<small>{item.category}</small>
        </span>
        <span className="order-menu-info"><b>{item.name}</b><small>{item.description || "เมนูแนะนำของห้องอาหาร"}</small></span>
        <span className="order-menu-bottom"><strong>{money(item.price)}</strong>{item.available ? <i><Plus size={18}/></i> : <em>หมดชั่วคราว</em>}</span>
      </button>)}</div>
    </section>
    {ticketOpen && <button className="staff-ticket-backdrop" onClick={() => setTicketOpen(false)} aria-label="ปิดรายการสั่ง" />}
    <aside className={`ticket ${ticketOpen ? "mobile-open" : ""}`}>
      <div className="ticket-head">
        <div><p className="eyebrow">CURRENT ORDER</p><h2>{order?.orderNumber ?? "กำลังเปิดโต๊ะ…"}</h2></div>
        <div className="ticket-head-actions">
          {order && <span className={`status ${order.status}`}>{statusLabels[order.status]}</span>}
          <button className="staff-ticket-close" onClick={() => setTicketOpen(false)} aria-label="ปิดรายการสั่ง"><X /></button>
        </div>
      </div>
      <div className="ticket-items">
        {items.map((item) => <div className={item.status === "draft" ? "ticket-editable" : ""} key={item.id}>
          {item.status === "draft" ? <span className="ticket-quantity">
            <button disabled={working} onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus /></button>
            <b>{item.quantity}</b>
            <button disabled={working} onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus /></button>
          </span> : <span>{item.quantity}×</span>}
          <p>{item.name}{item.optionSummary && <small className="item-option">{item.optionSummary} {item.optionPrice > 0 && `(+${money(item.optionPrice)})`}</small>}{item.note && <small className="item-note">หมายเหตุ: {item.note}</small>}<small>{item.status === "draft" ? "ลดเป็น 0 เพื่อลบ" : "ส่งแล้ว"}</small>{item.status === "draft" && <button className="edit-item-button" onClick={() => openEditor(item)}>แก้ตัวเลือก/หมายเหตุ</button>}</p>
          <b>{money((item.unitPrice + item.optionPrice) * item.quantity)}</b>
        </div>)}
        {!items.length && <Empty text="แตะเมนูเพื่อเริ่มรับออเดอร์" />}
      </div>
      <div className="ticket-summary">{Boolean(order?.discountAmount) && <p><span>ส่วนลด</span><b>-{money(order?.discountAmount ?? 0)}</b></p>}{Boolean(order?.serviceChargeAmount) && <p><span>ค่าบริการ</span><b>{money(order?.serviceChargeAmount ?? 0)}</b></p>}{Boolean(order?.vatAmount) && <p><span>VAT</span><b>{money(order?.vatAmount ?? 0)}</b></p>}</div>
      <div className="ticket-total"><span>ยอดสุทธิ <small>{order?.vatRate || order?.serviceChargeRate ? "รวมภาษีและค่าบริการแล้ว" : "ยังไม่คิด VAT / Service Charge"}</small></span><strong>{money(order?.total ?? 0)}</strong></div>
      <div className="ticket-actions">
        <button className="primary" disabled={!draftCount || working} onClick={onSend}><Send size={18} /> ส่งเข้าครัว ({draftCount})</button>
        {canPay && order && order.status !== "open" && <button className="secondary checkout-button" disabled={working} onClick={onCheckout}><WalletCards size={18} /> คิดเงิน / ส่วนลด / ใบเสร็จ</button>}
      </div>
    </aside>
    <button className="staff-mobile-order-bar" onClick={() => setTicketOpen(true)}>
      <span className="staff-cart-icon"><ShoppingCart />{itemCount > 0 && <b>{itemCount}</b>}</span>
      <span><b>รายการสั่ง โต๊ะ {table.number}</b><small>{draftCount ? `${draftCount} รายการรอส่งครัว` : itemCount ? "แตะเพื่อตรวจรายการ" : "ยังไม่มีรายการ"}</small></span>
      <strong>{money(order?.total ?? 0)}</strong>
      <ChevronUp />
    </button>
    {editingItem && <div className="modal-backdrop v1-modal-backdrop"><form className="item-details-modal" onSubmit={saveItem}><header><div><p className="eyebrow">ITEM DETAILS</p><h3>{editingItem.name}</h3></div><button type="button" onClick={() => setEditingItem(null)}><X/></button></header><label><span>ตัวเลือกเพิ่มเติม</span><input value={editOption} onChange={(event) => setEditOption(event.target.value)} placeholder="เช่น พิเศษ, ไม่เผ็ด, เพิ่มไข่" maxLength={160}/></label><label><span>ราคาเพิ่ม (บาท)</span><input type="number" min="0" step="0.01" value={editPrice} onChange={(event) => setEditPrice(event.target.value)}/></label><label><span>หมายเหตุถึงครัว</span><textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="เช่น แพ้อาหาร, ไม่ใส่ผัก" maxLength={300}/></label><footer><button type="button" className="secondary" onClick={() => setEditingItem(null)}>ยกเลิก</button><button className="primary" disabled={working}>บันทึก</button></footer></form></div>}
  </div>;
}

type ProductionStatus = "sent" | "preparing" | "ready";
const productionStatusLabels: Record<ProductionStatus, string> = { sent: "รอเริ่มทำ", preparing: "กำลังทำ", ready: "พร้อมส่งออก" };

function ProductionBoard({ mode, settingsEditable, orders, items, tables, menu, printJobs, printQueueJobs, settings, working, onStatus, onAction }: { mode: "kitchen" | "bar"; settingsEditable: boolean; orders: Order[]; items: OrderItem[]; tables: DiningTable[]; menu: MenuItem[]; printJobs: PrintJob[]; printQueueJobs: PrintQueueJob[]; settings: PrinterSettings; working: boolean; onStatus: (orderId: string, departments: string[], status: "preparing" | "ready" | "served") => void; onAction: (body: Record<string, unknown>) => Promise<ActionResponse | null> }) {
  const departments = mode === "bar" ? barDepartments : kitchenDepartments;
  const [printOrderId, setPrintOrderId] = useState<string | null>(null);
  const categoryByMenuId = useMemo(() => new Map(menu.map((item) => [item.id, item.category])), [menu]);
  const belongsHere = useCallback((item: OrderItem) => {
    const category = categoryByMenuId.get(item.menuItemId) ?? "อาหาร";
    return departments.includes(settings.categoryDepartments[category] || defaultDepartment(category));
  }, [categoryByMenuId, departments, settings.categoryDepartments]);
  const queue = orders.map((order) => ({
    order,
    rows: items.filter((item) => item.orderId === order.id && belongsHere(item) && ["sent", "preparing", "ready"].includes(item.status)),
  })).filter((entry) => entry.rows.length);
  const printOrder = queue.find((entry) => entry.order.id === printOrderId)?.order;
  const categories = Array.from(new Set(menu.map((item) => item.category)));
  const stationName = mode === "bar" ? "บาร์เครื่องดื่ม" : "ครัว";
  const StationIcon = mode === "bar" ? Coffee : ChefHat;

  function productionStatus(rows: OrderItem[]): ProductionStatus {
    if (rows.some((item) => item.status === "sent")) return "sent";
    if (rows.some((item) => item.status === "preparing")) return "preparing";
    return "ready";
  }

  return <div className={`content production-board ${mode === "bar" ? "bar-board" : ""}`}>
    <div className="kitchen-head"><div><p className="eyebrow">{mode === "bar" ? "BEVERAGE DISPLAY SYSTEM" : "KITCHEN DISPLAY SYSTEM"}</p><h2>{mode === "bar" ? "คิวเครื่องดื่มแยกจากครัว" : "คิวอาหารของครัว"}</h2></div><span className="live-badge"><i/> อัปเดตอัตโนมัติทุก 6 วินาที</span></div>
    {mode === "bar" && <section className="bar-station-banner"><Coffee/><div><b>จอบาร์รับเฉพาะหมวดที่กำหนดเป็น “บาร์เครื่องดื่ม”</b><small>สถานะของเครื่องดื่มแยกจากอาหาร ครัวจึงไม่เผลอกดรายการของบาร์</small></div></section>}
    <AutoPrintQueuePanel jobs={printQueueJobs} orders={orders} items={items} settings={settings} onAction={onAction} departmentFilter={departments} preferenceKey={`hotel-central-auto-print-${mode}`} title={mode === "bar" ? "คิวพิมพ์ใบบาร์อัตโนมัติ" : "คิวพิมพ์ใบครัวอัตโนมัติ"} stationLabel={mode === "bar" ? "หน้าจอบาร์" : "หน้าจอครัว"}/>
    {mode === "kitchen" && settingsEditable && <PrinterSettingsPanel categories={categories} settings={settings} working={working} onSave={(values) => onAction({ action: "setPrinterSettings", ...values }).then(Boolean)}/>}
    <div className="kitchen-grid">{queue.map(({ order, rows }) => {
      const state = productionStatus(rows);
      const printed = printJobs.filter((job) => job.orderId === order.id && job.documentType === "kitchen" && departments.includes(job.department)).length;
      const nextStatus = state === "sent" ? "preparing" : state === "preparing" ? "ready" : "served";
      const nextLabel = state === "sent" ? (mode === "bar" ? "เริ่มทำเครื่องดื่ม" : "เริ่มปรุง") : state === "preparing" ? "พร้อมส่งออก" : (mode === "bar" ? "ส่งเครื่องดื่มแล้ว" : "เสิร์ฟแล้ว");
      return <article className={`kitchen-card production-card ${state}`} key={order.id}><header><div><span>โต๊ะ {tables.find((table) => table.id === order.tableId)?.number}</span><small>{order.orderNumber} • {stationName}</small></div><b><Clock3 size={15}/>{time(order.openedAt)}</b></header><div className="kitchen-items">{rows.map((item) => <p key={item.id}><strong>{item.quantity}×</strong><span>{item.name}{item.optionSummary && <small>{item.optionSummary}</small>}{item.note && <em>หมายเหตุ: {item.note}</em>}<small className={`item-production-status ${item.status}`}>{item.status === "sent" ? "รอทำ" : item.status === "preparing" ? "กำลังทำ" : "พร้อมแล้ว"}</small></span></p>)}</div><footer><span className={`status ${state}`}>{productionStatusLabels[state]}</span><div className="kitchen-card-actions"><button className="print-ticket-button" disabled={working} onClick={() => setPrintOrderId(order.id)}><Printer/> {printed ? `พิมพ์ซ้ำ (${printed})` : mode === "bar" ? "พิมพ์ใบบาร์" : "พิมพ์ใบครัว"}</button><button disabled={working} onClick={() => onStatus(order.id, departments, nextStatus)}>{nextLabel}</button></div></footer></article>;
    })}{!queue.length && <div className="wide-empty"><StationIcon/><h3>{mode === "bar" ? "บาร์ยังไม่มีคิวเครื่องดื่ม" : "ครัวยังไม่มีคิวอาหาร"}</h3><p>รายการที่ส่งจากโต๊ะจะถูกแยกมาที่จุดผลิตนี้โดยอัตโนมัติ</p></div>}</div>
    {printOrder && <KitchenPrintModal order={printOrder} items={items} menu={menu} jobs={printJobs} settings={settings} working={working} departmentFilter={departments} onClose={() => setPrintOrderId(null)} onRecord={(values) => onAction(values).then(Boolean)}/>}
  </div>;
}

function Team({ users, current, working, onRole, onCreate, onReset }: { users: Profile[]; current: Profile; working: boolean; onRole: (id: string, role: string) => void; onCreate: (account: { name: string; username: string; password: string; role: Role }) => Promise<boolean>; onReset: (id: string, password: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [message, setMessage] = useState("");
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetValue, setResetValue] = useState("");

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (await onCreate({ name, username, password, role })) {
      setName(""); setUsername(""); setPassword(""); setRole("student");
      setMessage("สร้างบัญชีเรียบร้อยแล้ว");
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    const isCurrentUser = resetTarget.id === current.id;
    if (await onReset(resetTarget.id, resetValue)) {
      setMessage(`รีเซ็ตรหัสผ่านของ ${resetTarget.username ?? resetTarget.name} แล้ว`);
      setResetTarget(null);
      setResetValue("");
      if (isCurrentUser) window.location.assign("/login");
    }
  }

  return <div className="content">
    <section className="info-banner"><ShieldCheck/><div><b>สิทธิ์ควบคุมแบบรวมศูนย์</b><p>อาจารย์สร้างบัญชีและกำหนดหน้าที่ให้แต่ละคน ข้อมูลทุกเครื่องใช้ฐานข้อมูลเดียวกัน</p></div></section>
    {current.role === "instructor" && <article className="panel account-creator">
      <div className="panel-title"><div><p className="eyebrow">NEW ACCOUNT</p><h3>สร้างบัญชีนักศึกษาและพนักงาน</h3></div><button className="text-button password-button" type="button" onClick={() => setResetTarget(current)}><KeyRound size={15}/> เปลี่ยนรหัสผ่านของฉัน</button></div>
      <form className="account-form" onSubmit={createAccount}>
        <label><span>ชื่อที่แสดง</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></label>
        <label><span>ชื่อผู้ใช้</span><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} pattern="[a-z0-9._-]{3,32}" placeholder="student01" autoCapitalize="none" required /></label>
        <label><span>รหัสผ่านเริ่มต้น</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} required /></label>
        <label><span>บทบาท</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="student">นักศึกษา</option><option value="cashier">แคชเชียร์</option><option value="manager">ผู้จัดการ</option></select></label>
        <button className="primary" disabled={working} type="submit"><UserPlus size={17}/> สร้างบัญชี</button>
      </form>
      {message && <p className="form-message">{message}</p>}
    </article>}
    <article className="panel user-panel">
      <div className="panel-title"><div><p className="eyebrow">ACCESS CONTROL</p><h3>บัญชีผู้ใช้งาน</h3></div><span>{users.length} บัญชี</span></div>
      <div className="user-list">{users.map((user) => <div className="user-row" key={user.id}><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><b>{user.name}{user.id === current.id && " (คุณ)"}</b><small>@{user.username ?? user.email}</small></div><span className="last-seen">ล่าสุด {time(user.lastSeenAt)}</span>{current.role === "instructor" && user.id !== current.id ? <div className="user-actions"><select value={user.role} disabled={working} onChange={(event) => onRole(user.id, event.target.value)}><option value="student">นักศึกษา</option><option value="cashier">แคชเชียร์</option><option value="manager">ผู้จัดการ</option></select><button type="button" disabled={working} title="รีเซ็ตรหัสผ่าน" onClick={() => setResetTarget(user)}><KeyRound size={15}/></button></div> : <span className="role-chip">{roleLabels[user.role]}</span>}</div>)}</div>
    </article>
    {resetTarget && <div className="modal-backdrop" role="presentation"><form className="password-modal" onSubmit={resetPassword}><span className="modal-icon"><KeyRound size={22}/></span><h3>{resetTarget.id === current.id ? "เปลี่ยนรหัสผ่านของฉัน" : `รีเซ็ตรหัสผ่าน @${resetTarget.username ?? resetTarget.name}`}</h3><p>ใช้รหัสผ่านอย่างน้อย 10 ตัวอักษร หลังบันทึก เซสชันเดิมของบัญชีนี้จะออกจากระบบทุกเครื่อง</p><label><span>รหัสผ่านใหม่</span><input autoFocus type="password" value={resetValue} onChange={(event) => setResetValue(event.target.value)} minLength={10} maxLength={128} required /></label><div><button type="button" className="secondary" onClick={() => { setResetTarget(null); setResetValue(""); }}>ยกเลิก</button><button type="submit" className="primary" disabled={working}>บันทึกรหัสผ่าน</button></div></form></div>}
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><ShoppingBag/><p>{text}</p></div>; }
