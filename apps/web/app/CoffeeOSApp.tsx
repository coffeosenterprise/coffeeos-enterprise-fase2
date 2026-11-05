'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type View = 'pos' | 'catalog' | 'inventory' | 'cash' | 'reports' | 'setup';
type Notice = { type: 'success' | 'error'; text: string };

interface Session {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  email: string;
}

interface TokenPayload {
  sub: string;
  tenantId: string;
  permissions: string[];
}

interface Company { id: string; name: string }
interface Branch { id: string; name: string; companyId: string }
interface Terminal { id: string; name: string; branchId: string }
interface Ingredient { id: string; name: string; unit: string }
interface Stock {
  id: string;
  quantity: string;
  minQuantity: string;
  averageUnitCost: string;
  ingredient: Ingredient;
}
interface InventoryMovement {
  id: string;
  type: string;
  quantity: string;
  balanceBefore?: string | null;
  balanceAfter: string;
  reason?: string | null;
  note?: string | null;
  unitCost?: string | null;
  totalCost?: string | null;
  createdAt: string;
  stock: { ingredient: Ingredient };
  actor?: { firstName: string; lastName: string; email: string } | null;
}
interface InventoryRecipe {
  id: string;
  name: string;
  outputQuantity: string;
  deductMode: 'auto_on_sale' | 'hybrid' | 'manual_prep';
  outputIngredient: Ingredient;
  items: {
    ingredientId: string;
    quantity: string;
    ingredient: Ingredient;
  }[];
}
interface Recipe {
  ingredientId: string;
  quantity: string;
  ingredient: Ingredient;
}
interface ModifierOption {
  id: string;
  name: string;
  priceDelta: string;
  ingredients: Recipe[];
}
interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}
interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  ingredients: Recipe[];
  modifierGroups: ModifierGroup[];
}
interface Category {
  id: string;
  name: string;
  color: string;
  products: Product[];
}
interface CashSession {
  id: string;
  openingAmount: string;
  status: string;
  openedAt: string;
  branch: Branch;
  terminal: Terminal;
}
interface ClosedCashSession extends CashSession {
  closedAt: string;
  expectedCash?: string | null;
  countedCash?: string | null;
  difference?: string | null;
  salesTotal?: string | null;
  saleCount?: number | null;
}
interface CartLine {
  key: string;
  product: Product;
  quantity: number;
  options: ModifierOption[];
}
interface Receipt {
  id: string;
  folio: number;
  total: string;
  subtotal: string;
  cashReceived: string;
  changeAmount: string;
  paymentMethod: 'cash' | 'card' | 'transfer';
  createdAt: string;
  branch: Branch;
  terminal: Terminal;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    modifiers: { id: string; name: string; priceDelta: string }[];
  }[];
}
interface RecentSale extends Receipt {
  costTotal: string;
  grossProfit: string;
  grossMargin: string;
}

interface TicketSettings {
  businessName: string;
  rfc: string;
  address: string;
  phone: string;
  footerMessage: string;
  defaultFormat: 'thermal' | 'sheet';
}

const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  businessName: 'CoffeeOS Café',
  rfc: 'XAXX010101000',
  address: 'Av. Principal #123, Centro',
  phone: '55 1234 5678',
  footerMessage: '¡Gracias por su compra! Vuelva pronto.',
  defaultFormat: 'thermal',
};
interface SalesSummary {
  saleCount: number;
  total: string;
  costTotal: string;
  grossProfit: string;
  grossMargin: string;
  cash: string;
  card: string;
  transfer: string;
}
interface ReportAggregate {
  revenue: string;
  cost: string;
  profit: string;
  margin: string;
  units: number;
}
interface ReportsOverview {
  period: { from: string; to: string };
  sales: ReportAggregate & { count: number; averageTicket: string };
  comparison: {
    revenue: { current: string; previous: string; difference: string; trend: string };
    cost: { current: string; previous: string; difference: string; trend: string };
    profit: { current: string; previous: string; difference: string; trend: string };
    margin: { current: string; previous: string; difference: string; trend: string };
    units: { current: string; previous: string; difference: string; trend: string };
  };
  daily: (ReportAggregate & { date: string })[];
  products: (ReportAggregate & { productId: string; name: string; category: string })[];
  categories: (ReportAggregate & { name: string })[];
  topProducts: (ReportAggregate & { productId: string; name: string; category: string })[];
  lowMarginProducts: (ReportAggregate & { productId: string; name: string; category: string })[];
  inventory: {
    value: string;
    trackedIngredients: number;
    lowStock: {
      ingredientId: string;
      name: string;
      quantity: string;
      minQuantity: string;
      unit: string;
      averageUnitCost: string;
    }[];
  };
  alerts: {
    lowMarginProducts: number;
    lowStockIngredients: number;
    salesWithoutCost: number;
    productsWithoutRecipe: number;
  };
}
interface CloseSummary {
  saleCount: number;
  salesTotal: string;
  expectedCash: string;
  countedCash: string;
  difference: string;
  cashSalesTotal: string;
  cardSalesTotal: string;
  transferSalesTotal: string;
  lowStock: Stock[];
}

interface RecipeRow {
  ingredientId: string;
  quantity: number;
}

interface ModifierOptionDraft {
  id?: string;
  name: string;
  priceDelta: number;
  ingredientId: string;
  quantity: number;
}

interface ModifierGroupDraft {
  id?: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOptionDraft[];
}

const SESSION_KEY = 'coffeeos.session';

function decodeToken(token: string): TokenPayload | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as TokenPayload;
  } catch {
    return null;
  }
}

function messageOf(payload: unknown, fallback = 'No fue posible completar la operación') {
  if (!payload || typeof payload !== 'object') return fallback;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('. ');
  if (message && typeof message === 'object') {
    const nested = (message as { message?: unknown }).message;
    if (typeof nested === 'string') return nested;
    if (Array.isArray(nested)) return nested.join('. ');
  }
  return fallback;
}

function money(value: number | string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number(value || 0));
}

function paymentLabel(method: 'cash' | 'card' | 'transfer') {
  return method === 'cash'
    ? 'Efectivo'
    : method === 'card'
      ? 'Tarjeta'
      : 'Transferencia';
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function CoffeeLogo({
  size = 32,
  monochrome = false,
  className = '',
}: {
  size?: number;
  monochrome?: boolean;
  className?: string;
}) {
  if (monochrome) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
      >
        <path d="M16 11C16 8 18 6 18 4" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M24 12C24 8 26 6 26 3" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M32 11C32 8 34 6 34 4" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M10 16H38V28C38 34.6274 32.6274 40 26 40H22C15.3726 40 10 34.6274 10 28V16Z"
          fill="#000"
        />
        <path
          d="M38 20H40C42.2091 20 44 21.7909 44 24C44 26.2091 42.2091 28 40 28H38"
          stroke="#000"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M8 44H40" stroke="#000" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id="cupGrad" x1="10" y1="16" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c87b45" />
          <stop offset="1" stopColor="#8d4a23" />
        </linearGradient>
        <linearGradient id="steamGrad" x1="16" y1="3" x2="34" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e2a172" />
          <stop offset="1" stopColor="#c87b45" />
        </linearGradient>
      </defs>
      <path d="M16 11C16 8 18 6 18 4" stroke="url(#steamGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 12C24 8 26 6 26 3" stroke="url(#steamGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 11C32 8 34 6 34 4" stroke="url(#steamGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M10 16H38V28C38 34.6274 32.6274 40 26 40H22C15.3726 40 10 34.6274 10 28V16Z"
        fill="url(#cupGrad)"
      />
      <path
        d="M24 23.5C22.5 21.5 19.5 22 19.5 24C19.5 26.5 24 29.5 24 29.5C24 29.5 28.5 26.5 28.5 24C28.5 22 25.5 21.5 24 23.5Z"
        fill="#fcf8f2"
        fillOpacity="0.85"
      />
      <path
        d="M38 20H40C42.2091 20 44 21.7909 44 24C44 26.2091 42.2091 28 40 28H38"
        stroke="#c87b45"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M8 44H40" stroke="#194c3b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function BarcodeSVG({ value }: { value: string | number }) {
  const folioFormatted = String(value).padStart(6, '0');
  return (
    <div className="ticket-barcode-wrap">
      <svg viewBox="0 0 220 38" className="ticket-barcode-svg">
        <rect x="5" y="0" width="3" height="38" fill="#000" />
        <rect x="11" y="0" width="2" height="38" fill="#000" />
        <rect x="16" y="0" width="5" height="38" fill="#000" />
        <rect x="25" y="0" width="2" height="38" fill="#000" />
        <rect x="30" y="0" width="4" height="38" fill="#000" />
        <rect x="37" y="0" width="1" height="38" fill="#000" />
        <rect x="41" y="0" width="3" height="38" fill="#000" />
        <rect x="47" y="0" width="6" height="38" fill="#000" />
        <rect x="56" y="0" width="2" height="38" fill="#000" />
        <rect x="61" y="0" width="4" height="38" fill="#000" />
        <rect x="68" y="0" width="2" height="38" fill="#000" />
        <rect x="73" y="0" width="5" height="38" fill="#000" />
        <rect x="81" y="0" width="2" height="38" fill="#000" />
        <rect x="86" y="0" width="3" height="38" fill="#000" />
        <rect x="92" y="0" width="6" height="38" fill="#000" />
        <rect x="101" y="0" width="2" height="38" fill="#000" />
        <rect x="106" y="0" width="4" height="38" fill="#000" />
        <rect x="113" y="0" width="1" height="38" fill="#000" />
        <rect x="117" y="0" width="5" height="38" fill="#000" />
        <rect x="125" y="0" width="3" height="38" fill="#000" />
        <rect x="131" y="0" width="2" height="38" fill="#000" />
        <rect x="136" y="0" width="4" height="38" fill="#000" />
        <rect x="143" y="0" width="2" height="38" fill="#000" />
        <rect x="148" y="0" width="6" height="38" fill="#000" />
        <rect x="157" y="0" width="2" height="38" fill="#000" />
        <rect x="162" y="0" width="3" height="38" fill="#000" />
        <rect x="168" y="0" width="5" height="38" fill="#000" />
        <rect x="176" y="0" width="2" height="38" fill="#000" />
        <rect x="181" y="0" width="4" height="38" fill="#000" />
        <rect x="188" y="0" width="3" height="38" fill="#000" />
        <rect x="194" y="0" width="5" height="38" fill="#000" />
        <rect x="202" y="0" width="2" height="38" fill="#000" />
        <rect x="207" y="0" width="4" height="38" fill="#000" />
        <rect x="214" y="0" width="3" height="38" fill="#000" />
      </svg>
      <div className="ticket-barcode-label">*{folioFormatted}*</div>
    </div>
  );
}

function blankModifierGroup(): ModifierGroupDraft {
  return {
    name: '',
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [{ name: '', priceDelta: 0, ingredientId: '', quantity: 0 }],
  };
}

export default function CoffeeOSApp() {
  const [session, setSession] = useState<Session | null>(null);
  const refreshPromise = useRef<
    Promise<Pick<Session, 'accessToken' | 'refreshToken'>> | null
  >(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<
    'login' | 'register' | 'recover-verification' | 'verify'
  >('login');
  const [pendingVerification, setPendingVerification] = useState({
    tenantSlug: '',
    email: '',
    password: '',
    developmentCode: '',
  });
  const [view, setView] = useState<View>('pos');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [inventoryRecipes, setInventoryRecipes] = useState<InventoryRecipe[]>([]);
  const [editingInventoryRecipeId, setEditingInventoryRecipeId] = useState('');
  const [recipeStock, setRecipeStock] = useState<Stock | null>(null);
  const [inventoryRecipeDraft, setInventoryRecipeDraft] = useState({
    name: '',
    outputIngredientId: '',
    outputQuantity: '1',
    deductMode: 'auto_on_sale' as 'auto_on_sale' | 'hybrid' | 'manual_prep',
  });
  const [inventoryRecipeRows, setInventoryRecipeRows] = useState<
    { ingredientId: string; quantity: string }[]
  >([{ ingredientId: '', quantity: '1' }]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cashHistory, setCashHistory] = useState<ClosedCashSession[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [reportFrom, setReportFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([{ ingredientId: '', quantity: 1 }]);
  const [modifierGroups, setModifierGroups] = useState([blankModifierGroup()]);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [productDraft, setProductDraft] = useState({
    categoryId: '',
    name: '',
    description: '',
    price: '',
  });
  const [posSearch, setPosSearch] = useState('');
  const [showDailySales, setShowDailySales] = useState(false);
  const [ticketFormat, setTicketFormat] = useState<'thermal' | 'sheet'>('thermal');
  const [ticketSettings, setTicketSettings] = useState<TicketSettings>(DEFAULT_TICKET_SETTINGS);
  const [inventorySubView, setInventorySubView] = useState<'stocks' | 'valuation'>('stocks');
  const [printCorteZ, setPrintCorteZ] = useState<ClosedCashSession | null>(null);
  const [setupTab, setSetupTab] = useState<'ticket' | 'branches'>('ticket');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('coffeeos_ticket_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTicketSettings((prev) => ({ ...prev, ...parsed }));
        if (parsed.defaultFormat) setTicketFormat(parsed.defaultFormat);
      }
    } catch {}
  }, []);

  function saveTicketSettings(updated: Partial<TicketSettings>) {
    const next = { ...ticketSettings, ...updated };
    setTicketSettings(next);
    try {
      localStorage.setItem('coffeeos_ticket_settings', JSON.stringify(next));
    } catch {}
    setNotice({ type: 'success', text: 'Preferencias del ticket guardadas correctamente.' });
  }

  const payload = useMemo(
    () => (session ? decodeToken(session.accessToken) : null),
    [session],
  );
  const permissions = useMemo(
    () => payload?.permissions ?? [],
    [payload],
  );
  const can = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  const persistSession = useCallback((next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        try {
          setSession(JSON.parse(saved) as Session);
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const publicRequest = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageOf(body));
    return body as T;
  }, []);

  const apiRequest = useCallback(async <T,>(path: string, init?: RequestInit) => {
    if (!session) throw new Error('No hay una sesión activa');
    const send = (token: string) =>
      fetch(`/api/v1${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
    let response = await send(session.accessToken);
    if (response.status === 401 && session.refreshToken) {
      if (!refreshPromise.current) {
        refreshPromise.current = (async () => {
          const refreshedResponse = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: session.refreshToken }),
          });
          if (!refreshedResponse.ok) {
            throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
          }
          return refreshedResponse.json() as Promise<
            Pick<Session, 'accessToken' | 'refreshToken'>
          >;
        })().finally(() => {
          refreshPromise.current = null;
        });
      }

      try {
        const refreshed = await refreshPromise.current;
        persistSession({ ...session, ...refreshed });
        response = await send(refreshed.accessToken);
      } catch {
        // El refresh token puede expirar, revocarse o quedar invalidado
        // después de una rotación de JWT_SECRET. Se borran únicamente los
        // tokens locales; los datos del negocio permanecen en el servidor.
        persistSession(null);
        throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
      }
    }
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      persistSession(null);
      throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
    }
    if (!response.ok) throw new Error(messageOf(body));
    return body as T;
  }, [persistSession, session]);

  const run = useCallback(async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ type: 'success', text: success });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Ocurrió un error',
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    if (!session) return;
    const result = await apiRequest<Company[]>('/organization/companies');
    setCompanies(result);
    setCompanyId((current) => current || result[0]?.id || '');
  }, [apiRequest, session]);

  const loadCatalog = useCallback(async () => {
    if (!session || !can('sales.create')) return;
    const result = await apiRequest<Category[]>('/catalog');
    setCatalog(result);
    setCategoryFilter((current) => current || result[0]?.id || '');
    setProductDraft((current) => ({
      ...current,
      categoryId: current.categoryId || result[0]?.id || '',
    }));
  }, [apiRequest, can, session]);

  const loadStocks = useCallback(async () => {
    if (!branchId || !can('inventory.manage')) return;
    const [stockResult, recipeResult] = await Promise.all([
      apiRequest<Stock[]>(`/inventory?branchId=${branchId}`),
      apiRequest<InventoryRecipe[]>('/inventory/recipes'),
    ]);
    setStocks(stockResult);
    setInventoryRecipes(recipeResult);
  }, [apiRequest, branchId, can]);

  const loadInventoryMovements = useCallback(async () => {
    if (!branchId || !can('inventory.manage')) return;
    setInventoryMovements(
      await apiRequest<InventoryMovement[]>(`/inventory/movements?branchId=${branchId}`),
    );
  }, [apiRequest, branchId, can]);

  const loadCash = useCallback(async () => {
    if (!terminalId || !can('cash.manage')) return;
    setCashSession(
      await apiRequest<CashSession | null>(`/cash/current?terminalId=${terminalId}`),
    );
  }, [apiRequest, can, terminalId]);

  const loadCashHistory = useCallback(async () => {
    if (!can('cash.manage')) return;
    setCashHistory(
      await apiRequest<ClosedCashSession[]>(
        `/cash/history${branchId ? `?branchId=${branchId}` : ''}`,
      ),
    );
  }, [apiRequest, branchId, can]);

  const loadSales = useCallback(async () => {
    if (!cashSession?.id || !can('sales.create')) {
      setRecentSales([]);
      setSalesSummary(null);
      return;
    }
    const [recent, summary] = await Promise.all([
      apiRequest<RecentSale[]>(`/sales?cashSessionId=${cashSession.id}`),
      apiRequest<SalesSummary>(`/sales/summary?cashSessionId=${cashSession.id}`),
    ]);
    setRecentSales(recent);
    setSalesSummary(summary);
  }, [apiRequest, can, cashSession]);

  const loadReports = useCallback(async () => {
    if (!session || !can('sales.create')) {
      setReports(null);
      return;
    }
    const params = new URLSearchParams();
    if (reportFrom) params.set('from', reportFrom);
    if (reportTo) params.set('to', reportTo);
    if (branchId) params.set('branchId', branchId);
    setReports(
      await apiRequest<ReportsOverview>(`/reports/overview?${params.toString()}`),
    );
  }, [apiRequest, branchId, can, reportFrom, reportTo, session]);

  function exportReportCsv() {
    if (!reports) return;
    const rows = [
      ['Sección', 'Nombre', 'Categoría', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen'],
      ...reports.products.map((product) => [
        'Producto',
        product.name,
        product.category,
        String(product.units),
        product.revenue,
        product.cost,
        product.profit,
        product.margin,
      ]),
      ...reports.categories.map((category) => [
        'Categoría',
        category.name,
        '',
        String(category.units),
        category.revenue,
        category.cost,
        category.profit,
        category.margin,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coffeeos-reporte-${reportFrom}-${reportTo}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!session) return;
    const load = window.setTimeout(() => {
      void Promise.all([loadCompanies(), loadCatalog()]);
    }, 0);
    return () => window.clearTimeout(load);
  }, [session, loadCompanies, loadCatalog]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      if (!companyId || !session) {
        setBranches([]);
        return;
      }
      void apiRequest<Branch[]>(`/organization/companies/${companyId}/branches`)
        .then((result) => {
          setBranches(result);
          setBranchId((current) =>
            result.some((branch) => branch.id === current) ? current : result[0]?.id || '',
          );
        })
        .catch((error) =>
          setNotice({
            type: 'error',
            text: error instanceof Error ? error.message : 'No se pudieron cargar las sucursales',
          }),
        );
    }, 0);
    return () => window.clearTimeout(load);
  }, [apiRequest, companyId, session]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      if (!branchId || !session) {
        setTerminals([]);
        setStocks([]);
        return;
      }
      void Promise.all([
        apiRequest<Terminal[]>(`/organization/branches/${branchId}/terminals`).then((result) => {
          setTerminals(result);
          setTerminalId((current) =>
            result.some((terminal) => terminal.id === current) ? current : result[0]?.id || '',
          );
        }),
        loadStocks(),
        loadInventoryMovements(),
      ]).catch((error) =>
        setNotice({ type: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar los datos' }),
      );
    }, 0);
    return () => window.clearTimeout(load);
  }, [apiRequest, branchId, loadInventoryMovements, loadStocks, session]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      if (terminalId) void loadCash();
    }, 0);
    return () => window.clearTimeout(load);
  }, [terminalId, loadCash]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      void loadCashHistory().catch((error) =>
        setNotice({
          type: 'error',
          text: error instanceof Error ? error.message : 'No se pudo cargar el historial de caja',
        }),
      );
    }, 0);
    return () => window.clearTimeout(load);
  }, [loadCashHistory]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      void loadSales().catch((error) =>
        setNotice({
          type: 'error',
          text: error instanceof Error ? error.message : 'No se pudieron cargar las ventas',
        }),
      );
    }, 0);
    return () => window.clearTimeout(load);
  }, [loadSales]);

  useEffect(() => {
    if (view !== 'reports') return;
    const load = window.setTimeout(() => {
      void loadReports().catch((error) =>
        setNotice({
          type: 'error',
          text: error instanceof Error ? error.message : 'No se pudieron cargar los reportes',
        }),
      );
    }, 0);
    return () => window.clearTimeout(load);
  }, [loadReports, view]);

  async function login(tenantSlug: string, email: string, password: string) {
    const result = await publicRequest<Pick<Session, 'accessToken' | 'refreshToken'>>(
      '/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ tenantSlug, email, password }),
      },
    );
    persistSession({ ...result, tenantSlug, email });
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await login(
        String(form.get('tenantSlug')),
        String(form.get('email')),
        String(form.get('password')),
      );
    }, 'Bienvenido a CoffeeOS.');
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tenantSlug = String(form.get('slug')).toLowerCase().trim().replace(/\s+/g, '-');
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    void run(async () => {
      const result = await publicRequest<{
        verificationRequired: boolean;
        developmentCode?: string;
      }>('/v1/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('businessName'),
          slug: tenantSlug,
          plan: 'starter',
          owner: {
            email,
            password,
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
          },
        }),
      });
      setPendingVerification({
        tenantSlug,
        email,
        password,
        developmentCode: result.developmentCode ?? '',
      });
      setAuthMode('verify');
    }, 'Negocio creado. Revisa tu correo para obtener el código.');
  }

  function handleRecoverVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tenantSlug = String(form.get('tenantSlug'))
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));

    void run(async () => {
      const result = await publicRequest<{ developmentCode?: string }>(
        '/v1/auth/email/resend',
        {
          method: 'POST',
          body: JSON.stringify({ tenantSlug, email }),
        },
      );
      setPendingVerification({
        tenantSlug,
        email,
        password,
        developmentCode: result.developmentCode ?? '',
      });
      setAuthMode('verify');
    }, 'Código reenviado. Revisa tu correo.');
  }

  function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await publicRequest('/v1/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: pendingVerification.tenantSlug,
          email: pendingVerification.email,
          code: form.get('code'),
        }),
      });
      await login(
        pendingVerification.tenantSlug,
        pendingVerification.email,
        pendingVerification.password,
      );
    }, 'Correo verificado. Tu negocio ya está activo.');
  }

  function logout() {
    void apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    persistSession(null);
    setCompanies([]);
    setBranches([]);
    setTerminals([]);
    setCatalog([]);
    setStocks([]);
    setCart([]);
    setCashSession(null);
  }

  function submitCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      const company = await apiRequest<Company>('/organization/companies', {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), currency: 'MXN' }),
      });
      setCompanies((current) => [...current, company]);
      setCompanyId(company.id);
      setBranches([]);
      setBranchId('');
      setTerminals([]);
      setTerminalId('');
      formElement.reset();
    }, 'Empresa creada.');
  }

  function submitBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      const branch = await apiRequest<Branch>(
        `/organization/companies/${companyId}/branches`,
        {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), address: form.get('address') }),
        },
      );
      setBranches((current) => [...current, branch]);
      setBranchId(branch.id);
      setTerminals([]);
      setTerminalId('');
      formElement.reset();
    }, 'Sucursal creada.');
  }

  function submitTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      const terminal = await apiRequest<Terminal>(
        `/organization/branches/${branchId}/terminals`,
        {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), code: form.get('code') }),
        },
      );
      setTerminals((current) => [...current, terminal]);
      setTerminalId(terminal.id);
      formElement.reset();
    }, 'Terminal creada.');
  }

  function submitIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      const stock = await apiRequest<Stock>('/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          name: form.get('name'),
          unit: form.get('unit'),
          quantity: Number(form.get('quantity')),
          minQuantity: Number(form.get('minQuantity')),
          initialUnitCost: Number(form.get('initialUnitCost') || 0),
        }),
      });
      setStocks((current) =>
        [...current, stock].sort((a, b) =>
          a.ingredient.name.localeCompare(b.ingredient.name, 'es'),
        ),
      );
      formElement.reset();
    }, 'Ingrediente agregado al inventario.');
  }

  function resetInventoryRecipeEditor() {
    setEditingInventoryRecipeId('');
    setRecipeStock(null);
    setInventoryRecipeDraft({
      name: '',
      outputIngredientId: '',
      outputQuantity: '1',
      deductMode: 'auto_on_sale',
    });
    setInventoryRecipeRows([{ ingredientId: '', quantity: '1' }]);
  }

  function openIngredientRecipe(stock: Stock) {
    setRecipeStock(stock);
    const existing = inventoryRecipes.find(
      (r) => r.outputIngredient.id === stock.ingredient.id,
    );
    if (existing) {
      setEditingInventoryRecipeId(existing.id);
      setInventoryRecipeDraft({
        name: existing.name || stock.ingredient.name,
        outputIngredientId: stock.ingredient.id,
        outputQuantity: String(existing.outputQuantity),
        deductMode: existing.deductMode || 'auto_on_sale',
      });
      setInventoryRecipeRows(
        existing.items.map((item) => ({
          ingredientId: item.ingredientId,
          quantity: String(item.quantity),
        })),
      );
    } else {
      setEditingInventoryRecipeId('');
      setInventoryRecipeDraft({
        name: `Receta de ${stock.ingredient.name}`,
        outputIngredientId: stock.ingredient.id,
        outputQuantity: '1',
        deductMode: 'auto_on_sale',
      });
      setInventoryRecipeRows([{ ingredientId: '', quantity: '1' }]);
    }
  }

  function submitInventoryRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validItems = inventoryRecipeRows
      .filter((row) => row.ingredientId && Number(row.quantity) > 0)
      .map((row) => ({
        ingredientId: row.ingredientId,
        quantity: Number(row.quantity),
      }));
    if (
      !inventoryRecipeDraft.outputIngredientId ||
      Number(inventoryRecipeDraft.outputQuantity) <= 0 ||
      validItems.length === 0
    ) {
      setNotice({
        type: 'error',
        text: 'Completa al menos un ingrediente y su cantidad consumida.',
      });
      return;
    }

    void run(async () => {
      await apiRequest('/inventory/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: inventoryRecipeDraft.name.trim() || undefined,
          outputIngredientId: inventoryRecipeDraft.outputIngredientId,
          outputQuantity: Number(inventoryRecipeDraft.outputQuantity),
          deductMode: inventoryRecipeDraft.deductMode,
          items: validItems,
        }),
      });
      resetInventoryRecipeEditor();
      setInventoryRecipes(await apiRequest<InventoryRecipe[]>('/inventory/recipes'));
    }, 'Receta del ingrediente guardada exitosamente.');
  }

  function deleteInventoryRecipe(recipe: InventoryRecipe) {
    if (!window.confirm(`¿Quieres eliminar la receta del ingrediente "${recipe.outputIngredient.name}"?`)) return;
    void run(async () => {
      await apiRequest(`/inventory/recipes/${recipe.id}`, {
        method: 'DELETE',
      });
      resetInventoryRecipeEditor();
      setInventoryRecipes((current) =>
        current.filter((item) => item.id !== recipe.id),
      );
    }, 'Receta eliminada.');
  }

  function executeInventoryRecipe(recipe: InventoryRecipe) {
    const value = window.prompt(
      `¿Cuántas unidades de ${recipe.outputIngredient.name} (${recipe.outputIngredient.unit}) preparaste?\nEl sistema descontará automáticamente los insumos consumidos.`,
      Number(recipe.outputQuantity).toString(),
    );
    if (value === null) return;
    const units = Number(value);
    if (!Number.isFinite(units) || units <= 0) {
      setNotice({ type: 'error', text: 'Escribe una cantidad mayor que cero.' });
      return;
    }
    const batches = units / Number(recipe.outputQuantity);
    void run(async () => {
      await apiRequest(`/inventory/recipes/${recipe.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({ branchId, batches }),
      });
      await Promise.all([loadStocks(), loadInventoryMovements()]);
    }, `Preparación registrada: se sumaron ${units} ${recipe.outputIngredient.unit} de ${recipe.outputIngredient.name}.`);
  }

  function restock(stock: Stock) {
    const amount = window.prompt(`¿Cuánto deseas agregar de ${stock.ingredient.name} (${stock.ingredient.unit})?`);
    if (!amount) return;
    const unitCost = window.prompt(
      `¿Cuál es el costo por ${stock.ingredient.unit} de esta entrada?`,
      Number(stock.averageUnitCost || 0).toFixed(2),
    );
    if (unitCost === null) return;
    void run(async () => {
      const updated = await apiRequest<Stock>(
        `/inventory/stocks/${stock.id}/restock`,
        {
        method: 'POST',
        body: JSON.stringify({
          quantity: Number(amount),
          unitCost: Number(unitCost),
          note: 'Reposición manual',
        }),
        },
      );
      setStocks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await loadInventoryMovements();
    }, 'Entrada registrada.');
  }

  function registerInventoryMovement(stock: Stock, type: 'salida' | 'ajuste') {
    const amount = window.prompt(
      type === 'salida'
        ? `¿Cuánto deseas retirar de ${stock.ingredient.name} (${stock.ingredient.unit})?`
        : `¿Cuánto deseas agregar como ajuste a ${stock.ingredient.name} (${stock.ingredient.unit})?`,
    );
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    const reason = window.prompt('Motivo del movimiento (opcional):') || undefined;
    void run(async () => {
      await apiRequest(`/inventory/stocks/${stock.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          quantity: Number(amount),
          reason,
        }),
      });
      await Promise.all([loadStocks(), loadInventoryMovements()]);
    }, type === 'salida' ? 'Salida registrada.' : 'Ajuste registrado.');
  }

  function submitIngredientEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStock) return;
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const updated = await apiRequest<Stock>(
        `/inventory/stocks/${editingStock.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.get('name'),
            unit: form.get('unit'),
            quantity: Number(form.get('quantity')),
            minQuantity: Number(form.get('minQuantity')),
          }),
        },
      );
      setStocks((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) =>
            a.ingredient.name.localeCompare(b.ingredient.name, 'es'),
          ),
      );
      setCatalog((current) =>
        current.map((category) => ({
          ...category,
          products: category.products.map((product) => ({
            ...product,
            ingredients: product.ingredients.map((recipe) =>
              recipe.ingredientId === updated.ingredient.id
                ? { ...recipe, ingredient: updated.ingredient }
                : recipe,
            ),
            modifierGroups: product.modifierGroups.map((group) => ({
              ...group,
              options: group.options.map((option) => ({
                ...option,
                ingredients: option.ingredients.map((recipe) =>
                  recipe.ingredientId === updated.ingredient.id
                    ? { ...recipe, ingredient: updated.ingredient }
                    : recipe,
                ),
              })),
            })),
          })),
        })),
      );
      setEditingStock(null);
    }, 'Ingrediente actualizado correctamente.');
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      const category = await apiRequest<Omit<Category, 'products'>>(
        '/catalog/categories',
        {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), color: form.get('color') }),
        },
      );
      setCatalog((current) => [...current, { ...category, products: [] }]);
      setCategoryFilter(category.id);
      setProductDraft((current) => ({ ...current, categoryId: category.id }));
      formElement.reset();
    }, 'Categoría creada.');
  }

  function updateRecipe(index: number, field: 'ingredientId' | 'quantity', value: string | number) {
    setRecipeRows((rows) => rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row,
    ));
  }

  function updateGroup(index: number, field: string, value: string | number | boolean) {
    setModifierGroups((groups) => groups.map((group, groupIndex) =>
      groupIndex === index ? { ...group, [field]: value } : group,
    ));
  }

  function updateOption(groupIndex: number, optionIndex: number, field: string, value: string | number) {
    setModifierGroups((groups) => groups.map((group, currentGroupIndex) =>
      currentGroupIndex === groupIndex
        ? {
            ...group,
            options: group.options.map((option, currentOptionIndex) =>
              currentOptionIndex === optionIndex ? { ...option, [field]: value } : option,
            ),
          }
        : group,
    ));
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setModifierGroups((groups) =>
      groups.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex
          ? {
              ...group,
              options: group.options.filter(
                (_, currentOptionIndex) => currentOptionIndex !== optionIndex,
              ),
            }
          : group,
      ),
    );
  }

  function productDefinitionError() {
    const recipeIds = recipeRows
      .filter((row) => row.ingredientId && Number(row.quantity) > 0)
      .map((row) => row.ingredientId);
    if (new Set(recipeIds).size !== recipeIds.length) {
      return 'La receta base no puede repetir el mismo ingrediente.';
    }

    const activeGroups = modifierGroups.filter(
      (group) => group.name.trim() && group.options.some((option) => option.name.trim()),
    );
    const groupNames = activeGroups.map((group) =>
      group.name.trim().toLocaleLowerCase('es'),
    );
    if (new Set(groupNames).size !== groupNames.length) {
      return 'No puedes repetir el nombre de un grupo de opciones.';
    }

    for (const group of activeGroups) {
      const activeOptions = group.options.filter((option) => option.name.trim());
      const optionNames = activeOptions.map((option) =>
        option.name.trim().toLocaleLowerCase('es'),
      );
      if (new Set(optionNames).size !== optionNames.length) {
        return `El grupo "${group.name}" tiene opciones repetidas.`;
      }
      const maximum = Math.max(1, Number(group.maxSelections) || 1);
      if (maximum > activeOptions.length) {
        return `El máximo de "${group.name}" no puede superar sus ${activeOptions.length} opciones.`;
      }
    }

    return null;
  }

  function resetProductEditor(categoryId = categoryFilter) {
    setEditingProduct(null);
    setProductDraft({
      categoryId,
      name: '',
      description: '',
      price: '',
    });
    setRecipeRows([{ ingredientId: '', quantity: 1 }]);
    setModifierGroups([blankModifierGroup()]);
  }

  function beginEditProduct(categoryId: string, product: Product) {
    setEditingProduct(product);
    setProductDraft({
      categoryId,
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
    });
    setRecipeRows(
      product.ingredients.length
        ? product.ingredients.map((recipe) => ({
            ingredientId: recipe.ingredientId,
            quantity: Number(recipe.quantity),
          }))
        : [{ ingredientId: '', quantity: 1 }],
    );
    setModifierGroups(
      product.modifierGroups.length
        ? product.modifierGroups.map((group) => ({
            id: group.id,
            name: group.name,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: Math.max(1, group.maxSelections),
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDelta: Number(option.priceDelta),
              ingredientId: option.ingredients[0]?.ingredientId ?? '',
              quantity: Number(option.ingredients[0]?.quantity ?? 0),
            })),
          }))
        : [blankModifierGroup()],
    );
    document
      .querySelector('.product-builder')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const definitionError = productDefinitionError();
    if (definitionError) {
      setNotice({ type: 'error', text: definitionError });
      return;
    }
    const categoryId = productDraft.categoryId;
    const cleanRecipes = recipeRows.filter((row) => row.ingredientId && Number(row.quantity) > 0);
    const cleanGroups = modifierGroups
      .filter((group) => group.name && group.options.some((option) => option.name))
      .map((group) => ({
        ...(group.id ? { id: group.id } : {}),
        name: group.name,
        required: group.required,
        minSelections: group.required ? Math.max(1, Number(group.minSelections)) : Number(group.minSelections),
        maxSelections: Math.max(1, Number(group.maxSelections) || 1),
        options: group.options.filter((option) => option.name).map((option) => ({
          ...(option.id ? { id: option.id } : {}),
          name: option.name,
          priceDelta: Number(option.priceDelta),
          ingredients: option.ingredientId && Number(option.quantity) > 0
            ? [{ ingredientId: option.ingredientId, quantity: Number(option.quantity) }]
            : [],
        })),
      }));
    void run(async () => {
      const product = await apiRequest<Product>(
        editingProduct
          ? `/catalog/products/${editingProduct.id}`
          : '/catalog/products',
        {
        method: editingProduct ? 'PATCH' : 'POST',
        body: JSON.stringify({
          categoryId,
          name: productDraft.name,
          description: productDraft.description,
          price: Number(productDraft.price),
          ingredients: cleanRecipes.map((row) => ({
            ingredientId: row.ingredientId,
            quantity: Number(row.quantity),
          })),
          modifierGroups: cleanGroups,
        }),
        },
      );
      setCatalog((current) =>
        current.map((category) => ({
          ...category,
          products: (
            category.id === categoryId
              ? [
                  ...category.products.filter(
                    (item) => item.id !== product.id,
                  ),
                  product,
                ]
              : category.products.filter((item) => item.id !== product.id)
          ).sort((a, b) => a.name.localeCompare(b.name, 'es')),
        })),
      );
      setCategoryFilter(categoryId);
      resetProductEditor(categoryId);
    }, editingProduct ? 'Producto y receta actualizados.' : 'Producto y receta creados.');
  }

  function confirmDeleteProduct() {
    if (!deletingProduct) return;
    const product = deletingProduct;
    void run(async () => {
      await apiRequest(`/catalog/products/${product.id}`, {
        method: 'DELETE',
      });
      setCatalog((current) =>
        current.map((category) => ({
          ...category,
          products: category.products.filter((item) => item.id !== product.id),
        })),
      );
      setCart((current) =>
        current.filter((line) => line.product.id !== product.id),
      );
      if (selectedProduct?.id === product.id) setSelectedProduct(null);
      setDeletingProduct(null);
      resetProductEditor();
    }, `Producto "${product.name}" eliminado del menú.`);
  }

  function beginAddProduct(product: Product) {
    if (product.modifierGroups.length === 0) {
      addToCart(product, [], 1);
      return;
    }
    setSelectedProduct(product);
    setSelectedOptions([]);
    setSelectedQuantity(1);
  }

  function toggleOption(group: ModifierGroup, optionId: string) {
    setSelectedOptions((current) => {
      const groupIds = new Set(group.options.map((option) => option.id));
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      const maximum = Math.max(1, group.maxSelections || 1);
      if (maximum === 1) {
        return [...current.filter((id) => !groupIds.has(id)), optionId];
      }
      const selectedInGroup = current.filter((id) => groupIds.has(id)).length;
      if (selectedInGroup >= maximum) {
        setNotice({
          type: 'error',
          text: `Sólo puedes elegir ${maximum} opciones de ${group.name}.`,
        });
        return current;
      }
      return [...current, optionId];
    });
  }

  function addToCart(product: Product, optionIds: string[], quantity: number) {
    const options = product.modifierGroups.flatMap((group) =>
      group.options.filter((option) => optionIds.includes(option.id)),
    );
    const key = `${product.id}:${optionIds.slice().sort().join(',')}`;
    setCart((lines) => {
      const existing = lines.find((line) => line.key === key);
      return existing
        ? lines.map((line) => line.key === key ? { ...line, quantity: line.quantity + quantity } : line)
        : [...lines, { key, product, options, quantity }];
    });
    setSelectedProduct(null);
  }

  const cartTotal = cart.reduce((sum, line) => {
    const extras = line.options.reduce((optionSum, option) => optionSum + Number(option.priceDelta), 0);
    return sum + (Number(line.product.price) + extras) * line.quantity;
  }, 0);

  function beginPayment() {
    if (!cashSession) {
      setNotice({ type: 'error', text: 'Primero abre la caja de esta terminal.' });
      setView('cash');
      return;
    }
    setPaymentMethod('cash');
    setCashReceived('');
    setPaymentOpen(true);
  }

  function charge() {
    if (!cashSession) {
      setNotice({ type: 'error', text: 'Primero abre la caja de esta terminal.' });
      setView('cash');
      return;
    }
    void run(async () => {
      const sale = await apiRequest<Receipt>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          terminalId,
          cashSessionId: cashSession.id,
          paymentMethod,
          cashReceived: paymentMethod === 'cash' ? Number(cashReceived) : 0,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            modifierOptionIds: line.options.map((option) => option.id),
          })),
        }),
      });
      setReceipt(sale);
      setPaymentOpen(false);
      setCart([]);
      setCashReceived('');
      setPaymentMethod('cash');
      await loadStocks();
      await loadSales();
    }, 'Venta registrada correctamente.');
  }

  function openCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const opened = await apiRequest<CashSession>('/cash/open', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          terminalId,
          openingAmount: Number(form.get('openingAmount')),
        }),
      });
      setCashSession(opened);
      setCloseSummary(null);
    }, 'Caja abierta. Ya puedes comenzar a vender.');
  }

  function closeCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cashSession) return;
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const summary = await apiRequest<CloseSummary>(`/cash/${cashSession.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ countedCash: Number(form.get('countedCash')) }),
      });
      setCloseSummary(summary);
      setCashSession(null);
    }, 'Día finalizado y caja cerrada.');
  }

  if (!ready) return <main className="coffee-loading">CoffeeOS</main>;

  if (!session) {
    return (
      <main className="coffee-auth">
        <section className="coffee-auth-hero">
          <div className="coffee-logo"><CoffeeLogo size={38} /> <span>CoffeeOS</span></div>
          <div>
            <small>PUNTO DE VENTA PARA NEGOCIOS REALES</small>
            <h1>Vende rápido.<br />Controla cada ingrediente.</h1>
            <p>Productos, extras, inventario, efectivo, tickets y cierre diario en un solo lugar.</p>
          </div>
          <p>Tu información queda separada y protegida por negocio.</p>
        </section>
        <section className="coffee-auth-panel">
          <div className="coffee-auth-card">
            <div className="auth-switch">
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Ingresar</button>
              <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Crear negocio</button>
            </div>
            {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
            {authMode === 'login' && (
              <form className="coffee-form" onSubmit={handleLogin}>
                <header><small>BIENVENIDO</small><h2>Inicia sesión</h2><p>Entra con el identificador y correo de tu negocio.</p></header>
                <label>Identificador<input name="tenantSlug" placeholder="mi-cafeteria" required /></label>
                <label>Correo<input name="email" type="email" required /></label>
                <label>Contraseña<input name="password" type="password" required /></label>
                <button className="coffee-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar a CoffeeOS'}</button>
                <button
                  type="button"
                  className="coffee-link"
                  onClick={() => {
                    setNotice(null);
                    setAuthMode('recover-verification');
                  }}
                >
                  Verificar una cuenta pendiente
                </button>
              </form>
            )}
            {authMode === 'register' && (
              <form className="coffee-form two" onSubmit={handleRegister}>
                <header className="wide"><small>NUEVO NEGOCIO</small><h2>Crea tu espacio</h2><p>Te enviaremos un código de seis dígitos para confirmar el correo.</p></header>
                <label className="wide">Nombre del negocio<input name="businessName" required /></label>
                <label className="wide">Identificador<input name="slug" pattern="[a-z0-9-]+" placeholder="mi-negocio" required /></label>
                <label>Nombre<input name="firstName" required /></label>
                <label>Apellido<input name="lastName" required /></label>
                <label className="wide">Correo<input name="email" type="email" required /></label>
                <label className="wide">Contraseña<input name="password" type="password" minLength={8} required /></label>
                <button className="coffee-primary wide" disabled={busy}>{busy ? 'Creando…' : 'Crear y verificar'}</button>
              </form>
            )}
            {authMode === 'recover-verification' && (
              <form className="coffee-form" onSubmit={handleRecoverVerification}>
                <header>
                  <small>CUENTA PENDIENTE</small>
                  <h2>Recupera la verificación</h2>
                  <p>Usa los mismos datos con los que creaste el negocio. Te enviaremos un código nuevo.</p>
                </header>
                <label>Identificador<input name="tenantSlug" placeholder="mi-negocio" required /></label>
                <label>Correo<input name="email" type="email" required /></label>
                <label>Contraseña<input name="password" type="password" minLength={8} required /></label>
                <button className="coffee-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar código nuevo'}</button>
                <button
                  type="button"
                  className="coffee-link"
                  onClick={() => {
                    setNotice(null);
                    setAuthMode('login');
                  }}
                >
                  Volver a ingresar
                </button>
              </form>
            )}
            {authMode === 'verify' && (
              <form className="coffee-form" onSubmit={handleVerify}>
                <header><small>SEGURIDAD</small><h2>Verifica tu correo</h2><p>Escribe el código enviado a {pendingVerification.email}.</p></header>
                <label>Código de 6 dígitos<input name="code" inputMode="numeric" maxLength={6} defaultValue={pendingVerification.developmentCode} required /></label>
                {pendingVerification.developmentCode && <p className="dev-code">Prueba local: el código fue completado automáticamente. También puedes verlo en MailHog.</p>}
                <button className="coffee-primary" disabled={busy}>Verificar y entrar</button>
                <button type="button" className="coffee-link" onClick={() => void run(async () => {
                  const result = await publicRequest<{ developmentCode?: string }>('/v1/auth/email/resend', {
                    method: 'POST',
                    body: JSON.stringify({
                      tenantSlug: pendingVerification.tenantSlug,
                      email: pendingVerification.email,
                    }),
                  });
                  setPendingVerification((current) => ({ ...current, developmentCode: result.developmentCode ?? '' }));
                }, 'Código reenviado.')}>Reenviar código</button>
              </form>
            )}
          </div>
        </section>
      </main>
    );
  }

  const searchLower = posSearch.trim().toLowerCase();
  const visibleProducts = catalog
    .filter((category) => !categoryFilter || category.id === categoryFilter)
    .flatMap((category) => category.products)
    .filter(
      (product) =>
        !searchLower ||
        product.name.toLowerCase().includes(searchLower) ||
        (product.description && product.description.toLowerCase().includes(searchLower)),
    );
  const lowStock = stocks.filter((stock) => Number(stock.quantity) <= Number(stock.minQuantity));

  return (
    <main className="coffee-app">
      <aside className="coffee-sidebar">
        <div className="coffee-logo"><CoffeeLogo size={32} /> <span>CoffeeOS</span></div>
        <div className="business-chip"><small>NEGOCIO</small><strong>{session.tenantSlug}</strong></div>
        <nav>
          {can('sales.create') && <button className={view === 'pos' ? 'active' : ''} onClick={() => setView('pos')}><Icon>▦</Icon>Punto de venta</button>}
          {can('catalog.manage') && <button className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')}><Icon>☕</Icon>Menú y productos</button>}
          {can('inventory.manage') && <button className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}><Icon>▤</Icon>Inventario {lowStock.length > 0 && <b>{lowStock.length}</b>}</button>}
          {can('cash.manage') && <button className={view === 'cash' ? 'active' : ''} onClick={() => setView('cash')}><Icon>$</Icon>Caja y cierre</button>}
          {can('sales.create') && <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}><Icon>▥</Icon>Reportes</button>}
          {can('organization.manage') && <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}><Icon>⚙</Icon>Configuración</button>}
        </nav>
        <button className="logout-button" onClick={logout}>Cerrar sesión</button>
      </aside>

      <section className="coffee-workspace">
        <header className="coffee-topbar">
          <div><small>SUCURSAL Y TERMINAL</small><h1>{({ pos: 'Nueva venta', catalog: 'Menú y productos', inventory: 'Inventario', cash: 'Caja y cierre diario', reports: 'Reportes y rentabilidad', setup: 'Configuración inicial' })[view]}</h1></div>
          <div className="context-selectors">
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Sin sucursal</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={terminalId} onChange={(event) => setTerminalId(event.target.value)}>
              <option value="">Sin terminal</option>
              {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
            </select>
            <span className={`cash-indicator ${cashSession ? 'open' : ''}`}>{cashSession ? 'Caja abierta' : 'Caja cerrada'}</span>
          </div>
        </header>

        {notice && <div className={`notice floating ${notice.type}`}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}

        <div className="coffee-content">
          {view !== 'setup' && (!branchId || !terminalId) && (
            <div className="empty-banner">
              <h2>Completa la configuración inicial</h2>
              <p>Crea una empresa, una sucursal y una terminal para comenzar.</p>
              <button className="coffee-primary compact" onClick={() => setView('setup')}>Ir a configuración</button>
            </div>
          )}

          {view === 'setup' && (
            <div className="page-stack">
              <div className="intro">
                <div>
                  <small>AJUSTES DEL SISTEMA</small>
                  <h2>Configuración de Cafetería y Tickets</h2>
                  <p>Personaliza los datos impresos en los tickets de venta, define el formato de impresión y administra sucursales y terminales.</p>
                </div>
              </div>

              <div className="subview-tabs">
                <button
                  type="button"
                  className={setupTab === 'ticket' ? 'active' : ''}
                  onClick={() => setSetupTab('ticket')}
                >
                  🧾 Datos del Ticket e Impresión
                </button>
                <button
                  type="button"
                  className={setupTab === 'branches' ? 'active' : ''}
                  onClick={() => setSetupTab('branches')}
                >
                  🏢 Sucursales y Terminales ({branches.length} / {terminals.length})
                </button>
              </div>

              {setupTab === 'ticket' && (
                <div className="setup-ticket-grid">
                  <form
                    className="panel coffee-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      saveTicketSettings({
                        businessName: String(form.get('businessName') || ''),
                        rfc: String(form.get('rfc') || ''),
                        address: String(form.get('address') || ''),
                        phone: String(form.get('phone') || ''),
                        footerMessage: String(form.get('footerMessage') || ''),
                        defaultFormat: form.get('defaultFormat') as 'thermal' | 'sheet',
                      });
                    }}
                  >
                    <h3>Datos para el Ticket Impreso</h3>
                    <p>Estos datos se imprimen en el encabezado y pie de cada ticket térmico o en hoja carta.</p>
                    <label>
                      Nombre comercial de la cafetería
                      <input
                        name="businessName"
                        defaultValue={ticketSettings.businessName}
                        placeholder="Ej. CoffeeOS Café Gourmet"
                        required
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        RFC / Identificación fiscal
                        <input
                          name="rfc"
                          defaultValue={ticketSettings.rfc}
                          placeholder="XAXX010101000"
                        />
                      </label>
                      <label>
                        Teléfono de contacto
                        <input
                          name="phone"
                          defaultValue={ticketSettings.phone}
                          placeholder="55 1234 5678"
                        />
                      </label>
                    </div>
                    <label>
                      Dirección comercial
                      <input
                        name="address"
                        defaultValue={ticketSettings.address}
                        placeholder="Av. Principal #123, Col. Centro"
                      />
                    </label>
                    <label>
                      Mensaje de agradecimiento (Pie del ticket)
                      <input
                        name="footerMessage"
                        defaultValue={ticketSettings.footerMessage}
                        placeholder="¡Gracias por su compra! Vuelva pronto."
                      />
                    </label>
                    <label>
                      Formato de impresión predeterminado
                      <select name="defaultFormat" defaultValue={ticketSettings.defaultFormat}>
                        <option value="thermal">📠 Rollo Térmico (80mm / 58mm POS)</option>
                        <option value="sheet">📄 Hoja Normal (Carta / A4 para pruebas)</option>
                      </select>
                      <small>En la ventana del ticket podrás alternar entre rollo térmico y hoja carta en cualquier momento.</small>
                    </label>
                    <button className="coffee-primary" disabled={busy}>
                      Guardar configuración del ticket
                    </button>
                  </form>

                  <div className="panel ticket-live-preview">
                    <div className="panel-title">
                      <h3>Vista previa del ticket</h3>
                      <span className="count-badge">Diseño en vivo</span>
                    </div>
                    <div className="sample-ticket-preview">
                      <div className="ticket-header-logo">
                        <CoffeeLogo size={36} monochrome={true} />
                      </div>
                      <div className="sample-ticket-name">{ticketSettings.businessName || 'CoffeeOS Café'}</div>
                      <div className="sample-ticket-muted">RFC: {ticketSettings.rfc || 'XAXX010101000'}</div>
                      <div className="sample-ticket-muted">{ticketSettings.address || 'Av. Principal #123, Centro'}</div>
                      <div className="sample-ticket-muted">Tel: {ticketSettings.phone || '55 1234 5678'}</div>
                      <hr className="ticket-divider" />
                      <div className="sample-ticket-row"><span>Ticket #000101</span><span>{new Date().toLocaleDateString('es-MX')}</span></div>
                      <div className="sample-ticket-row"><span>Caja: Principal</span><span>Turno: Abierto</span></div>
                      <hr className="ticket-divider" />
                      <div className="sample-ticket-row"><span>1 × Americano Especial 12oz</span><b>$45.00</b></div>
                      <div className="sample-ticket-sub">+ Jarabe Avellana (+$10.00)</div>
                      <div className="sample-ticket-row"><span>1 × Muffin Chocolate</span><b>$38.00</b></div>
                      <hr className="ticket-divider" />
                      <div className="sample-ticket-row"><span>Subtotal</span><b>$93.00</b></div>
                      <div className="sample-ticket-row total"><span>TOTAL</span><b>$93.00</b></div>
                      <div className="sample-ticket-row"><span>Método</span><span>Efectivo</span></div>
                      <div className="sample-ticket-row"><span>Recibido</span><span>$100.00</span></div>
                      <div className="sample-ticket-row"><span>Cambio</span><b>$7.00</b></div>
                      <div className="ticket-barcode-wrap">
                        <BarcodeSVG value="101" />
                      </div>
                      <div className="sample-ticket-footer">{ticketSettings.footerMessage}</div>
                    </div>
                  </div>
                </div>
              )}

              {setupTab === 'branches' && (
                <>
                  <div className="panel" style={{ padding: '18px 22px', marginBottom: '20px' }}>
                    <div className="panel-title">
                      <h3>Estructura actual del negocio</h3>
                      <span>{companies.length} empresa(s) · {branches.length} sucursal(es) · {terminals.length} terminal(es)</span>
                    </div>
                    <div className="structure-summary-grid">
                      {companies.map((c) => (
                        <div key={c.id} className="structure-card">
                          <small>EMPRESA</small>
                          <strong>{c.name}</strong>
                          <div className="structure-branches">
                            {branches.filter((b) => b.companyId === c.id).map((b) => (
                              <div key={b.id} className="structure-branch-item">
                                <span>📍 {b.name}</span>
                                <div className="structure-terminals">
                                  {terminals.filter((t) => t.branchId === b.id).map((t) => (
                                    <span key={t.id} className="terminal-pill">💻 {t.name}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="three-cards">
                    <form className="panel coffee-form" onSubmit={submitCompany}>
                      <span className="step">1</span><h3>Empresa</h3>
                      <label>Nombre<input name="name" placeholder="Cafetería Central" required /></label>
                      <button className="coffee-primary compact" disabled={busy}>Crear empresa</button>
                    </form>
                    <form className="panel coffee-form" onSubmit={submitBranch}>
                      <span className="step">2</span><h3>Sucursal</h3>
                      <label>Empresa<select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required><option value="">Selecciona</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
                      <label>Nombre<input name="name" placeholder="Sucursal Centro" required /></label>
                      <label>Dirección<input name="address" /></label>
                      <button className="coffee-primary compact" disabled={busy || !companyId}>Crear sucursal</button>
                    </form>
                    <form className="panel coffee-form" onSubmit={submitTerminal}>
                      <span className="step">3</span><h3>Terminal</h3>
                      <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Selecciona</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                      <label>Nombre<input name="name" placeholder="Caja principal" required /></label>
                      <label>Código<input name="code" placeholder="CAJA-01" required /></label>
                      <button className="coffee-primary compact" disabled={busy || !branchId}>Crear terminal</button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'inventory' && branchId && (
            <div className="page-stack">
              <div className="intro">
                <div>
                  <small>CONTROL DE EXISTENCIAS Y COSTOS</small>
                  <h2>Inventario y Auditoría</h2>
                  <p>Gestiona existencias en tiempo real, fórmulas de preparación y genera reportes valorizados imprimibles.</p>
                </div>
                <span className={`alert-pill ${lowStock.length ? 'danger' : ''}`}>{lowStock.length} avisos de stock</span>
              </div>

              <div className="subview-tabs">
                <button
                  type="button"
                  className={inventorySubView === 'stocks' ? 'active' : ''}
                  onClick={() => setInventorySubView('stocks')}
                >
                  📦 Existencias y Movimientos ({stocks.length})
                </button>
                <button
                  type="button"
                  className={inventorySubView === 'valuation' ? 'active' : ''}
                  onClick={() => setInventorySubView('valuation')}
                >
                  📊 Reporte Valorizado Imprimible
                </button>
              </div>

              {inventorySubView === 'valuation' && (
                <div className="valuation-report-container">
                  <div className="valuation-screen-actions">
                    <div className="report-kpis">
                      <div className="panel">
                        <small>INSUMOS REGISTRADOS</small>
                        <strong>{stocks.length}</strong>
                        <span>Total de materias primas</span>
                      </div>
                      <div className="panel">
                        <small>VALOR TOTAL DEL INVENTARIO</small>
                        <strong>{money(stocks.reduce((acc, s) => acc + (Number(s.quantity) * Number(s.averageUnitCost || 0)), 0))}</strong>
                        <span>Costo promedio ponderado</span>
                      </div>
                      <div className="panel">
                        <small>INSUMOS BAJO MÍNIMO</small>
                        <strong className={lowStock.length > 0 ? 'text-danger' : ''}>{lowStock.length}</strong>
                        <span>Requieren resurtido urgente</span>
                      </div>
                    </div>
                    <div className="valuation-action-bar">
                      <button
                        type="button"
                        className="coffee-primary"
                        onClick={() => window.print()}
                      >
                        🖨️ Imprimir Reporte de Inventario
                      </button>
                    </div>
                  </div>

                  <div id="print-inventory-report" className="printable-report-sheet">
                    <header className="report-print-header">
                      <div className="report-brand-row">
                        <CoffeeLogo size={42} monochrome={true} />
                        <div>
                          <h2>{ticketSettings.businessName || 'CoffeeOS Café'}</h2>
                          <p>RFC: {ticketSettings.rfc} · Tel: {ticketSettings.phone}</p>
                          <small>{ticketSettings.address}</small>
                        </div>
                      </div>
                      <div className="report-title-badge">
                        <h1>REPORTE DE AUDITORÍA Y VALORACIÓN DE INVENTARIO</h1>
                        <p>Sucursal: <strong>{branches.find((b) => b.id === branchId)?.name || 'Sucursal Principal'}</strong> · Emitido: <strong>{new Date().toLocaleString('es-MX')}</strong></p>
                      </div>
                    </header>

                    <table className="printable-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Insumo / Materia Prima</th>
                          <th>Unidad</th>
                          <th className="num">Existencia</th>
                          <th className="num">Mínimo</th>
                          <th className="num">Costo Unit. Promedio</th>
                          <th className="num">Valor Total</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stocks.map((stock, idx) => {
                          const isLow = Number(stock.quantity) <= Number(stock.minQuantity);
                          const totalVal = Number(stock.quantity) * Number(stock.averageUnitCost || 0);
                          return (
                            <tr key={stock.id} className={isLow ? 'row-alert' : ''}>
                              <td>{idx + 1}</td>
                              <td><strong>{stock.ingredient.name}</strong></td>
                              <td>{stock.ingredient.unit}</td>
                              <td className="num">{Number(stock.quantity).toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                              <td className="num">{Number(stock.minQuantity).toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                              <td className="num">{money(stock.averageUnitCost)}</td>
                              <td className="num"><strong>{money(totalVal)}</strong></td>
                              <td>
                                <span className={`status-tag ${isLow ? 'danger' : 'ok'}`}>
                                  {isLow ? '⚠️ Reabastecer' : '✓ Óptimo'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'right' }}><strong>VALOR TOTAL DEL INVENTARIO:</strong></td>
                          <td className="num"><strong>{money(stocks.reduce((acc, s) => acc + (Number(s.quantity) * Number(s.averageUnitCost || 0)), 0))}</strong></td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>

                    <div className="report-signature-block">
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <strong>Responsable de Inventario</strong>
                        <p>Nombre y firma de quien realizó el conteo</p>
                      </div>
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <strong>Administrador / Gerente</strong>
                        <p>Aprobación y sello de auditoría</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {inventorySubView === 'stocks' && (
                <>
              <div className="inventory-layout">
                <form className="panel coffee-form" onSubmit={submitIngredient}>
                  <h3>Nuevo ingrediente</h3>
                  <label>Nombre<input name="name" placeholder="Nutella" required /></label>
                  <label>Unidad<select name="unit" defaultValue="g"><option value="pieza">pieza</option><option value="g">gramos (g)</option><option value="kg">kilogramos (kg)</option><option value="ml">mililitros (ml)</option><option value="l">litros (l)</option></select></label>
                  <div className="form-row"><label>Cantidad inicial<input name="quantity" type="number" step="0.001" min="0" required /></label><label>Costo unitario inicial<input name="initialUnitCost" type="number" step="0.0001" min="0" defaultValue="0" required /></label></div>
                  <label>Avisar al llegar a<input name="minQuantity" type="number" step="0.001" min="0" required /></label>
                  <button className="coffee-primary compact" disabled={busy}>Agregar al inventario</button>
                </form>
                <div className="panel table-panel">
                  <div className="panel-title"><h3>Existencias actuales</h3><span>{stocks.length} ingredientes</span></div>
                  <div className="stock-grid">
                    {stocks.map((stock) => {
                      const isLow = Number(stock.quantity) <= Number(stock.minQuantity);
                      const recipe = inventoryRecipes.find((r) => r.outputIngredient.id === stock.ingredient.id);
                      return (
                        <article key={stock.id} className={isLow ? 'low' : ''}>
                          <div>
                            <div>
                              <strong>{stock.ingredient.name}</strong>
                              <small>{stock.ingredient.unit}</small>
                            </div>
                            {recipe && (
                              <span
                                className={`recipe-badge ${recipe.deductMode === 'auto_on_sale' ? 'auto' : recipe.deductMode === 'hybrid' ? 'hybrid' : 'manual'}`}
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  background: recipe.deductMode === 'auto_on_sale' ? '#dcfce7' : recipe.deductMode === 'hybrid' ? '#fef3c7' : '#f3e8ff',
                                  color: recipe.deductMode === 'auto_on_sale' ? '#15803d' : recipe.deductMode === 'hybrid' ? '#b45309' : '#7e22ce',
                                }}
                                title={`Modo de descuento: ${recipe.deductMode}`}
                              >
                                {recipe.deductMode === 'auto_on_sale' && '⚡ Auto en venta'}
                                {recipe.deductMode === 'hybrid' && '🔄 Híbrido'}
                                {recipe.deductMode === 'manual_prep' && '👨‍🍳 Manual'}
                              </span>
                            )}
                          </div>
                          <b>{Number(stock.quantity).toLocaleString('es-MX')}</b>
                          <p>Mínimo: {Number(stock.minQuantity).toLocaleString('es-MX')} · Costo promedio: {money(stock.averageUnitCost)}</p>
                          {isLow && <span>Reponer pronto</span>}
                          <div className="stock-actions" style={{ display: 'grid', gridTemplateColumns: recipe ? '1fr 1fr' : '1fr 1fr', gap: '6px' }}>
                            <button type="button" onClick={() => restock(stock)}>+ Existencia</button>
                            <button type="button" onClick={() => setEditingStock(stock)}>Editar</button>
                            <button
                              type="button"
                              style={recipe ? { background: '#e0f2fe', color: '#0369a1' } : {}}
                              onClick={() => openIngredientRecipe(stock)}
                              title={recipe ? 'Ver o modificar receta de este ingrediente' : 'Crear receta para este ingrediente'}
                            >
                              {recipe ? '⚙ Receta' : '+ Receta'}
                            </button>
                            {recipe && (
                              <button
                                type="button"
                                style={{ background: '#fef3c7', color: '#92400e' }}
                                onClick={() => executeInventoryRecipe(recipe)}
                                title="Registrar preparación de unidades de este ingrediente"
                              >
                                Preparar
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {stocks.length === 0 && <div className="blank-state">Todavía no hay ingredientes. Agrega el primero.</div>}
                  </div>
                </div>
              </div>

              {recipeStock && (
                <div className="panel coffee-form" style={{ marginTop: '20px', border: '2px solid var(--green)', background: '#fff' }}>
                  <div className="panel-title">
                    <div>
                      <small style={{ color: 'var(--green-2)', fontWeight: 700, letterSpacing: '1px' }}>RECETA DEL INGREDIENTE</small>
                      <h3>Receta para: {recipeStock.ingredient.name} ({recipeStock.ingredient.unit})</h3>
                    </div>
                    <button type="button" className="coffee-link" onClick={() => resetInventoryRecipeEditor()}>
                      Cerrar ✕
                    </button>
                  </div>
                  <p className="field-help" style={{ marginBottom: '16px' }}>
                    Configura de qué insumos primarios se compone <strong>{recipeStock.ingredient.name}</strong> y cómo se descontará al operar el negocio.
                  </p>

                  <form onSubmit={submitInventoryRecipe} style={{ display: 'grid', gap: '16px' }}>
                    <div>
                      <label style={{ fontWeight: 700, marginBottom: '8px' }}>¿Cómo quieres que se descuente el inventario?</label>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', background: inventoryRecipeDraft.deductMode === 'auto_on_sale' ? '#f0fdf4' : '#fff' }}>
                          <input
                            type="radio"
                            name="deductMode"
                            value="auto_on_sale"
                            checked={inventoryRecipeDraft.deductMode === 'auto_on_sale'}
                            onChange={() => setInventoryRecipeDraft((c) => ({ ...c, deductMode: 'auto_on_sale' }))}
                            style={{ width: 'auto', minHeight: 'auto', marginTop: '3px' }}
                          />
                          <div>
                            <strong>⚡ Descuento automático al vender en POS (Sub-receta)</strong>
                            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                              Al vender cualquier producto que use {recipeStock.ingredient.name}, el sistema descuenta automáticamente sus insumos primarios del inventario. No requiere preparar existencias con anticipación.
                            </p>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', background: inventoryRecipeDraft.deductMode === 'hybrid' ? '#fefce8' : '#fff' }}>
                          <input
                            type="radio"
                            name="deductMode"
                            value="hybrid"
                            checked={inventoryRecipeDraft.deductMode === 'hybrid'}
                            onChange={() => setInventoryRecipeDraft((c) => ({ ...c, deductMode: 'hybrid' }))}
                            style={{ width: 'auto', minHeight: 'auto', marginTop: '3px' }}
                          />
                          <div>
                            <strong>🔄 Híbrido / Inteligente</strong>
                            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                              Si tienes {recipeStock.ingredient.name} en existencia, consume ese stock primero. Si no alcanza o está en 0, descuenta automáticamente los insumos primarios de su receta en la venta.
                            </p>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', background: inventoryRecipeDraft.deductMode === 'manual_prep' ? '#faf5ff' : '#fff' }}>
                          <input
                            type="radio"
                            name="deductMode"
                            value="manual_prep"
                            checked={inventoryRecipeDraft.deductMode === 'manual_prep'}
                            onChange={() => setInventoryRecipeDraft((c) => ({ ...c, deductMode: 'manual_prep' }))}
                            style={{ width: 'auto', minHeight: 'auto', marginTop: '3px' }}
                          />
                          <div>
                            <strong>👨‍🍳 Preparación manual</strong>
                            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                              Solo descuenta insumos cuando pulses el botón &quot;Preparar&quot; para registrar piezas elaboradas que se suman a la existencia.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="form-row">
                      <label>
                        Nombre descriptivo (opcional)
                        <input
                          value={inventoryRecipeDraft.name}
                          onChange={(event) => setInventoryRecipeDraft((c) => ({ ...c, name: event.target.value }))}
                          placeholder={`Receta de ${recipeStock.ingredient.name}`}
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Cantidad de {recipeStock.ingredient.name} que rinde esta proporción
                        <input
                          type="number"
                          min="0.0001"
                          step="0.001"
                          value={inventoryRecipeDraft.outputQuantity}
                          onChange={(event) => setInventoryRecipeDraft((c) => ({ ...c, outputQuantity: event.target.value }))}
                          required
                        />
                      </label>
                    </div>

                    <fieldset>
                      <legend>Insumos necesarios para producir {inventoryRecipeDraft.outputQuantity} {recipeStock.ingredient.unit} de {recipeStock.ingredient.name}</legend>
                      {inventoryRecipeRows.map((row, index) => (
                        <div className="builder-row" key={index}>
                          <select
                            value={row.ingredientId}
                            onChange={(event) => setInventoryRecipeRows((rows) => rows.map((item, i) => i === index ? { ...item, ingredientId: event.target.value } : item))}
                            required
                          >
                            <option value="">Selecciona ingrediente de consumo</option>
                            {stocks
                              .filter((s) => s.ingredient.id !== recipeStock.ingredient.id)
                              .map((s) => (
                                <option key={s.ingredient.id} value={s.ingredient.id}>
                                  {s.ingredient.name} ({s.ingredient.unit})
                                </option>
                              ))}
                          </select>
                          <input
                            type="number"
                            min="0.0001"
                            step="0.001"
                            placeholder="Cantidad consumida"
                            value={row.quantity}
                            onChange={(event) => setInventoryRecipeRows((rows) => rows.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))}
                            required
                          />
                          <button
                            type="button"
                            disabled={inventoryRecipeRows.length === 1}
                            onClick={() => setInventoryRecipeRows((rows) => rows.filter((_, i) => i !== index))}
                            title="Quitar insumo"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="coffee-link"
                        onClick={() => setInventoryRecipeRows((rows) => [...rows, { ingredientId: '', quantity: '1' }])}
                      >
                        + Añadir otro insumo a la receta
                      </button>
                    </fieldset>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
                      <button className="coffee-primary" disabled={busy}>
                        {editingInventoryRecipeId ? 'Guardar cambios de la receta' : `Guardar receta de ${recipeStock.ingredient.name}`}
                      </button>
                      {editingInventoryRecipeId && (
                        <button
                          type="button"
                          className="delete-product-button"
                          disabled={busy}
                          onClick={() => {
                            const rec = inventoryRecipes.find((r) => r.id === editingInventoryRecipeId);
                            if (rec) deleteInventoryRecipe(rec);
                          }}
                        >
                          Eliminar receta
                        </button>
                      )}
                      <button type="button" className="coffee-link" onClick={() => resetInventoryRecipeEditor()}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              )}
                </>
              )}
            </div>
          )}

          {view === 'inventory' && branchId && inventorySubView === 'stocks' && (
            <div className="page-stack">
              <div className="panel table-panel">
                <div className="panel-title"><h3>Historial de movimientos</h3><span>{inventoryMovements.length} recientes</span></div>
                {inventoryMovements.length === 0 ? <p>No hay movimientos registrados todavía.</p> : <div className="recent-sales-list">{inventoryMovements.map((movement) => <article className="recent-sale" key={movement.id}><div><strong>{movement.stock.ingredient.name} · {movement.type}</strong><small>{new Date(movement.createdAt).toLocaleString('es-MX')} · {movement.reason || movement.note || 'Sin motivo'} · Costo: {money(movement.unitCost ?? 0)}</small></div><b className={Number(movement.quantity) < 0 ? 'negative' : ''}>{Number(movement.quantity) > 0 ? '+' : ''}{Number(movement.quantity).toLocaleString('es-MX')} {movement.stock.ingredient.unit}</b><span>{movement.actor ? `${movement.actor.firstName} ${movement.actor.lastName}` : 'Sistema'}</span></article>)}</div>}
              </div>
              <form className="panel coffee-form" onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                const stock = stocks.find((item) => item.id === String(form.get('stockId')));
                if (!stock) return;
                void run(async () => {
                  await apiRequest(`/inventory/stocks/${stock.id}/movements`, { method: 'POST', body: JSON.stringify({ type: form.get('type'), quantity: Number(form.get('quantity')), unitCost: Number(form.get('unitCost') || 0), reason: form.get('reason') }) });
                  formElement.reset();
                  await Promise.all([loadStocks(), loadInventoryMovements()]);
                }, 'Movimiento registrado.');
              }}>
                <h3>Registrar movimiento</h3>
                <div className="form-row"><label>Ingrediente<select name="stockId" required><option value="">Selecciona</option>{stocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.ingredient.name}</option>)}</select></label><label>Tipo<select name="type" defaultValue="salida"><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="ajuste">Ajuste positivo</option><option value="merma">Merma</option></select></label></div>
                <div className="form-row"><label>Cantidad<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Costo unitario<input name="unitCost" type="number" min="0" step="0.0001" defaultValue="0" /></label></div>
                <label>Motivo<input name="reason" maxLength={250} placeholder="Ej. desperdicio, reposición..." /></label>
                <button className="coffee-primary compact" disabled={busy || stocks.length === 0}>Guardar movimiento</button>
              </form>
            </div>
          )}

          {view === 'catalog' && branchId && (
            <div className="page-stack">
              <div className="intro"><div><small>MENÚ CONFIGURABLE</small><h2>Categorías, productos, recetas y extras</h2><p>El precio y el consumo de inventario se guardan en el producto. Los extras pueden sumar precio y descontar otro ingrediente.</p></div></div>
              <div className="catalog-layout">
                <div className="side-forms">
                  <form className="panel coffee-form" onSubmit={submitCategory}>
                    <h3>Nueva categoría</h3>
                    <label>Nombre<input name="name" placeholder="Bebidas Calientes" required /></label>
                    <label>Color<input name="color" type="color" defaultValue="#C87B45" /></label>
                    <button className="coffee-primary compact">Crear categoría</button>
                  </form>
                  <div className="panel category-list"><h3>Categorías</h3>{catalog.map((category) => <span key={category.id}><i style={{ background: category.color }} />{category.name}<b>{category.products.length}</b></span>)}</div>
                  <div className="panel catalog-product-list"><h3>Productos guardados</h3>{catalog.flatMap((category) => category.products.map((product) => <button type="button" key={product.id} onClick={() => beginEditProduct(category.id, product)}><span><strong>{product.name}</strong><small>{category.name} · {product.ingredients.length} ingredientes · {product.modifierGroups.reduce((sum, group) => sum + group.options.length, 0)} opciones</small></span><b>Editar</b></button>))}{catalog.every((category) => category.products.length === 0) && <p>Todavía no hay productos.</p>}</div>
                </div>
                <form className="panel coffee-form product-builder" onSubmit={submitProduct}>
                  <div className="panel-title"><div><small>{editingProduct ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}</small><h3>{editingProduct ? `Corrige ${editingProduct.name}` : 'Configura lo que vendes'}</h3></div>{editingProduct && <button type="button" className="coffee-link" onClick={() => resetProductEditor()}>Cancelar edición</button>}</div>
                  <div className="form-row"><label>Categoría<select name="categoryId" value={productDraft.categoryId} onChange={(event) => setProductDraft((current) => ({ ...current, categoryId: event.target.value }))} required><option value="">Selecciona</option>{catalog.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Precio base<input name="price" type="number" step="0.01" min="0" value={productDraft.price} onChange={(event) => setProductDraft((current) => ({ ...current, price: event.target.value }))} required /></label></div>
                  <label>Nombre<input name="name" placeholder="Capuchino de la Casa" value={productDraft.name} onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))} required /></label>
                  <label>Descripción<input name="description" placeholder="Café espresso con leche espumada y jarabe artesanal" value={productDraft.description} onChange={(event) => setProductDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  <fieldset><legend>Receta base que se descuenta por unidad</legend>{recipeRows.map((row, index) => <div className="builder-row" key={index}><select value={row.ingredientId} onChange={(event) => updateRecipe(index, 'ingredientId', event.target.value)}><option value="">Ingrediente</option>{stocks.map((stock) => <option key={stock.ingredient.id} value={stock.ingredient.id}>{stock.ingredient.name} ({stock.ingredient.unit})</option>)}</select><input type="number" step="0.001" min="0" value={row.quantity} onChange={(event) => updateRecipe(index, 'quantity', Number(event.target.value))} /><button type="button" onClick={() => setRecipeRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}<button type="button" className="coffee-link" onClick={() => setRecipeRows((rows) => [...rows, { ingredientId: '', quantity: 1 }])}>+ Añadir ingrediente a la receta</button></fieldset>
                  <fieldset><legend>Opciones y extras</legend><p className="field-help">Cada opción puede sumar precio y consumir un ingrediente. El máximo indica cuántas opciones puede elegir el cliente.</p>{modifierGroups.map((group, groupIndex) => <div className="modifier-builder" key={groupIndex}><div className="builder-row group-head"><input placeholder="Grupo: Tipo de leche, tamaño, jarabe…" value={group.name} onChange={(event) => updateGroup(groupIndex, 'name', event.target.value)} /><label className="check-label"><input type="checkbox" checked={group.required} onChange={(event) => updateGroup(groupIndex, 'required', event.target.checked)} />Obligatorio</label><input aria-label="Máximo" title="Cantidad máxima que puede elegir el cliente" type="number" min="1" value={group.maxSelections} onChange={(event) => updateGroup(groupIndex, 'maxSelections', Number(event.target.value))} /><button type="button" title="Eliminar grupo" onClick={() => setModifierGroups((groups) => groups.filter((_, index) => index !== groupIndex))}>×</button></div>{group.options.map((option, optionIndex) => <div className="option-row" key={option.id ?? optionIndex}><input placeholder="Opción: Leche de almendra, shot extra…" value={option.name} onChange={(event) => updateOption(groupIndex, optionIndex, 'name', event.target.value)} /><input aria-label="Precio extra" type="number" step="0.01" min="0" placeholder="+ precio" value={option.priceDelta} onChange={(event) => updateOption(groupIndex, optionIndex, 'priceDelta', Number(event.target.value))} /><select value={option.ingredientId} onChange={(event) => updateOption(groupIndex, optionIndex, 'ingredientId', event.target.value)}><option value="">Sin consumo extra</option>{stocks.map((stock) => <option key={stock.ingredient.id} value={stock.ingredient.id}>{stock.ingredient.name} ({stock.ingredient.unit})</option>)}</select><input aria-label="Consumo" title="Cantidad que se descontará del inventario" type="number" step="0.001" min="0" value={option.quantity} onChange={(event) => updateOption(groupIndex, optionIndex, 'quantity', Number(event.target.value))} /><button type="button" className="remove-option" title={`Eliminar opción ${option.name || ''}`} onClick={() => removeOption(groupIndex, optionIndex)}>×</button></div>)}<button type="button" className="coffee-link" onClick={() => setModifierGroups((groups) => groups.map((item, index) => index === groupIndex ? { ...item, options: [...item.options, { name: '', priceDelta: 0, ingredientId: '', quantity: 0 }] } : item))}>+ Añadir opción</button></div>)}<button type="button" className="coffee-link" onClick={() => setModifierGroups((groups) => [...groups, blankModifierGroup()])}>+ Añadir grupo de opciones</button></fieldset>
                  <div className="product-actions"><button className="coffee-primary" disabled={busy || catalog.length === 0}>{editingProduct ? 'Guardar cambios de producto y receta' : 'Guardar producto'}</button>{editingProduct && <button type="button" className="delete-product-button" disabled={busy} onClick={() => setDeletingProduct(editingProduct)}>Eliminar producto</button>}</div>
                </form>
              </div>
            </div>
          )}

          {view === 'cash' && terminalId && (
            <div className="page-stack">
              <div className="intro"><div><small>CONTROL DE EFECTIVO</small><h2>{cashSession ? 'Caja abierta' : 'Abre tu caja para comenzar'}</h2><p>El cierre compara el efectivo esperado con el contado y muestra las existencias que debes reponer.</p></div></div>
              {!cashSession ? (
                <form className="panel coffee-form cash-card" onSubmit={openCash}>
                  <div className="cash-symbol">$</div><h3>Fondo inicial</h3><p>Escribe cuánto efectivo hay en caja antes de la primera venta.</p>
                  <label>Efectivo inicial<input name="openingAmount" type="number" step="0.01" min="0" defaultValue="0" required /></label>
                  <button className="coffee-primary" disabled={busy}>Abrir caja y comenzar</button>
                </form>
              ) : (
                <div className="cash-columns">
                  <div className="panel cash-status-card"><small>TURNO ACTUAL</small><h3>{cashSession.terminal.name}</h3><strong>{money(cashSession.openingAmount)}</strong><p>Fondo inicial · abierta {new Date(cashSession.openedAt).toLocaleString('es-MX')}</p><button className="coffee-primary compact" onClick={() => setView('pos')}>Ir a vender</button></div>
                  <form className="panel coffee-form" onSubmit={closeCash}><h3>Finalizar día</h3><p>Cuenta todo el efectivo físico antes de cerrar.</p><label>Efectivo contado<input name="countedCash" type="number" min="0" step="0.01" required /></label><button className="danger-button" disabled={busy}>Cerrar caja y ver resumen</button></form>
                </div>
              )}
              {closeSummary && (
                <div className="panel close-summary">
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Resumen del cierre de turno</h3>
                    <button
                      type="button"
                      className="coffee-primary compact"
                      onClick={() =>
                        setPrintCorteZ({
                          id: 'cierre-actual',
                          openingAmount: '0',
                          status: 'closed',
                          openedAt: new Date().toISOString(),
                          closedAt: new Date().toISOString(),
                          branch: branches.find((b) => b.id === branchId) || { id: branchId, name: 'Sucursal', companyId: '' },
                          terminal: terminals.find((t) => t.id === terminalId) || { id: terminalId, name: 'Terminal', branchId },
                          expectedCash: closeSummary.expectedCash,
                          countedCash: closeSummary.countedCash,
                          difference: closeSummary.difference,
                          salesTotal: closeSummary.salesTotal,
                          saleCount: closeSummary.saleCount,
                        })
                      }
                    >
                      🖨️ Imprimir Corte Z
                    </button>
                  </div>
                  <div>
                    <span><small>Ventas</small><b>{closeSummary.saleCount}</b></span>
                    <span><small>Total vendido</small><b>{money(closeSummary.salesTotal)}</b></span>
                    <span><small>Efectivo</small><b>{money(closeSummary.cashSalesTotal)}</b></span>
                    <span><small>Tarjeta</small><b>{money(closeSummary.cardSalesTotal)}</b></span>
                    <span><small>Transferencia</small><b>{money(closeSummary.transferSalesTotal)}</b></span>
                    <span><small>Efectivo esperado</small><b>{money(closeSummary.expectedCash)}</b></span>
                    <span><small>Diferencia</small><b className={Number(closeSummary.difference) < 0 ? 'negative' : ''}>{money(closeSummary.difference)}</b></span>
                  </div>
                  <h4>Necesitas reponer</h4>
                  {closeSummary.lowStock.length ? (
                    closeSummary.lowStock.map((stock) => (
                      <p key={stock.id}>{stock.ingredient.name}: quedan {Number(stock.quantity)} {stock.ingredient.unit}</p>
                    ))
                  ) : (
                    <p>Todo el inventario está por encima de sus mínimos.</p>
                  )}
                </div>
              )}
              {salesSummary && (
                <div className="panel close-summary">
                  <h3>Resumen de ventas</h3>
                  <div>
                    <span><small>Ventas</small><b>{salesSummary.saleCount}</b></span>
                    <span><small>Total general</small><b>{money(salesSummary.total)}</b></span>
                    <span><small>Costo</small><b>{money(salesSummary.costTotal)}</b></span>
                    <span><small>Utilidad bruta</small><b>{money(salesSummary.grossProfit)}</b></span>
                    <span><small>Margen</small><b>{Number(salesSummary.grossMargin).toFixed(2)}%</b></span>
                    <span><small>Efectivo</small><b>{money(salesSummary.cash)}</b></span>
                    <span><small>Tarjeta</small><b>{money(salesSummary.card)}</b></span>
                    <span><small>Transferencia</small><b>{money(salesSummary.transfer)}</b></span>
                  </div>
                  <h3>Ventas recientes</h3>
                  {recentSales.length === 0 ? (
                    <p>Todavía no hay ventas en esta caja.</p>
                  ) : (
                    recentSales.map((sale) => (
                      <article className="recent-sale" key={sale.id}>
                        <div>
                          <strong>Venta #{sale.folio}</strong>
                          <small>
                            {new Date(sale.createdAt).toLocaleString('es-MX')} · {sale.items.reduce((sum, item) => sum + item.quantity, 0)} producto(s) · utilidad {money(sale.grossProfit)} ({Number(sale.grossMargin).toFixed(2)}%)
                          </small>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <b>{money(sale.total)}</b>
                          <span>{paymentLabel(sale.paymentMethod)}</span>
                          <button
                            type="button"
                            className="coffee-link compact"
                            onClick={() => setReceipt(sale)}
                          >
                            🖨️ Ver Ticket
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'reports' && (
            <div className="page-stack reports-page">
              <div className="intro">
                <div><small>ANÁLISIS DEL NEGOCIO</small><h2>Ventas, costos y utilidad</h2><p>Consulta el desempeño de tu negocio usando los costos congelados en cada venta.</p></div>
                <form className="report-filters" onSubmit={(event) => { event.preventDefault(); void run(loadReports, 'Reporte actualizado.'); }}>
                  <label>Desde<input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></label>
                  <label>Hasta<input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} /></label>
                  <button className="coffee-primary compact" disabled={busy}>Actualizar</button>
                  <button type="button" className="coffee-link" disabled={!reports} onClick={exportReportCsv}>Exportar CSV</button>
                  <button type="button" className="coffee-link" disabled={!reports} onClick={() => window.print()}>Imprimir / PDF</button>
                </form>
              </div>
              {!reports ? <div className="panel empty-banner">Selecciona un periodo y actualiza para cargar el reporte.</div> : <>
                <div className="report-kpis">
                  <div className="panel"><small>Ventas</small><strong>{reports!.sales.count}</strong><span>{reports!.sales.units} productos vendidos</span></div>
                  <div className="panel"><small>Ingresos</small><strong>{money(reports!.sales.revenue)}</strong><span>Ticket promedio {money(reports!.sales.averageTicket)}</span></div>
                  <div className="panel"><small>Costo</small><strong>{money(reports!.sales.cost)}</strong><span>Inventario actual {money(reports!.inventory.value)}</span></div>
                  <div className="panel"><small>Utilidad bruta</small><strong>{money(reports!.sales.profit)}</strong><span>Margen {Number(reports!.sales.margin).toFixed(2)}%</span></div>
                </div>
                <section className="panel report-table"><div className="panel-title"><h3>Comparación con el periodo anterior</h3><span>Periodo equivalente</span></div><div className="comparison-grid">{[['Ventas', reports!.comparison.revenue, money], ['Costo', reports!.comparison.cost, money], ['Utilidad', reports!.comparison.profit, money], ['Margen', reports!.comparison.margin, (value: string) => `${Number(value).toFixed(2)}%`], ['Unidades', reports!.comparison.units, (value: string) => Number(value).toFixed(0)]].map(([label, metric, formatter]) => { const data = metric as { current: string; previous: string; difference: string; trend: string }; const format = formatter as (value: string) => string; return <article key={String(label)}><div><strong>{String(label)}</strong><small>Actual {format(data.current)} · Anterior {format(data.previous)}</small></div><span className={data.trend === 'down' ? 'negative' : ''}><b>{data.trend === 'stable' ? 'Sin cambio' : data.trend === 'up' ? 'Subió' : 'Bajó'}</b><small>{format(data.difference)}</small></span></article>; })}</div></section>
                <section className="panel report-table"><div className="panel-title"><h3>Alertas de información</h3><span>Revisa antes de tomar decisiones</span></div><div className="alert-summary"><span className={reports!.alerts.lowMarginProducts ? 'warning' : ''}>Margen bajo: <b>{reports!.alerts.lowMarginProducts}</b></span><span className={reports!.alerts.lowStockIngredients ? 'warning' : ''}>Bajo mínimo: <b>{reports!.alerts.lowStockIngredients}</b></span><span className={reports!.alerts.salesWithoutCost ? 'warning' : ''}>Ventas sin costo: <b>{reports!.alerts.salesWithoutCost}</b></span><span className={reports!.alerts.productsWithoutRecipe ? 'warning' : ''}>Sin receta: <b>{reports!.alerts.productsWithoutRecipe}</b></span></div></section>
                <div className="report-columns">
                  <section className="panel report-table"><div className="panel-title"><h3>Productos más rentables</h3><span>{reports!.topProducts.length} productos</span></div>{reports!.topProducts.length === 0 ? <p>No hay ventas en este periodo.</p> : <div className="report-list">{reports!.topProducts.map((product) => <article key={product.productId}><div><strong>{product.name}</strong><small>{product.category} · {product.units} vendidos</small></div><span><b>{money(product.profit)}</b><small>{Number(product.margin).toFixed(2)}% margen</small></span></article>)}</div>}</section>
                  <section className="panel report-table"><div className="panel-title"><h3>Por categoría</h3><span>{reports!.categories.length} categorías</span></div>{reports!.categories.length === 0 ? <p>No hay categorías con ventas.</p> : <div className="report-list">{reports!.categories.map((category) => <article key={category.name}><div><strong>{category.name}</strong><small>{category.units} productos vendidos</small></div><span><b>{money(category.profit)}</b><small>{Number(category.margin).toFixed(2)}% margen</small></span></article>)}</div>}</section>
                </div>
                <div className="report-columns">
                  <section className="panel report-table"><div className="panel-title"><h3>Productos con margen bajo</h3><span>Menos de 30%</span></div>{reports!.lowMarginProducts.length === 0 ? <p>No se detectaron productos con margen bajo.</p> : <div className="report-list">{reports!.lowMarginProducts.map((product) => <article key={product.productId}><div><strong>{product.name}</strong><small>{product.category} · costo {money(product.cost)}</small></div><span className="negative"><b>{Number(product.margin).toFixed(2)}%</b><small>{money(product.profit)} utilidad</small></span></article>)}</div>}</section>
                  <section className="panel report-table"><div className="panel-title"><h3>Inventario y avisos</h3><span>{reports!.inventory.trackedIngredients} ingredientes</span></div>{reports!.inventory.lowStock.length === 0 ? <p>No hay ingredientes por debajo del mínimo.</p> : <div className="report-list">{reports!.inventory.lowStock.map((stock) => <article key={stock.ingredientId}><div><strong>{stock.name}</strong><small>Quedan {stock.quantity} {stock.unit} · mínimo {stock.minQuantity}</small></div><span><b>{money(stock.averageUnitCost)}</b><small>Costo unitario</small></span></article>)}</div>}</section>
                </div>
                <section className="panel report-table"><div className="panel-title"><h3>Ventas por día</h3><span>{reports!.daily.length} días con ventas</span></div>{reports!.daily.length === 0 ? <p>No hay ventas en este periodo.</p> : <div className="report-list">{reports!.daily.map((day) => <article key={day.date}><div><strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX')}</strong><small>{day.units} productos vendidos</small></div><span><b>{money(day.revenue)}</b><small>Utilidad {money(day.profit)}</small></span></article>)}</div>}</section>
              </>}
            </div>
          )}

          {view === 'cash' && terminalId && cashHistory.length > 0 && (
            <div className="panel close-summary">
              <h3>Historial de cortes</h3>
              {cashHistory.map((closed) => (
                <article className="recent-sale" key={closed.id}>
                  <div>
                    <strong>{closed.terminal.name}</strong>
                    <small>{new Date(closed.closedAt).toLocaleString('es-MX')} · {closed.saleCount ?? 0} venta(s)</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <b>{money(closed.salesTotal ?? 0)}</b>
                    <span>Diferencia {money(closed.difference ?? 0)}</span>
                    <button
                      type="button"
                      className="coffee-link compact"
                      onClick={() => setPrintCorteZ(closed)}
                    >
                      🖨️ Imprimir Corte Z
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {view === 'pos' && branchId && terminalId && (
            <div className="pos-layout">
              <section className="product-area">
                <div className="pos-top-actions">
                  <div className="pos-search-box">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="pos-search-input"
                      placeholder="Buscar producto por nombre o descripción..."
                      value={posSearch}
                      onChange={(e) => setPosSearch(e.target.value)}
                    />
                    {posSearch && (
                      <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => setPosSearch('')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="pos-quick-buttons">
                    <button
                      type="button"
                      className="pos-action-btn highlight"
                      onClick={() => setShowDailySales(true)}
                    >
                      📋 Ventas de hoy <b>({recentSales.length})</b> · <span>{money(salesSummary?.total ?? 0)}</span>
                    </button>
                    <button
                      type="button"
                      className="pos-action-btn"
                      disabled={recentSales.length === 0}
                      onClick={() => {
                        if (recentSales[0]) setReceipt(recentSales[0]);
                      }}
                    >
                      🖨️ Último ticket {recentSales[0] ? `(#${recentSales[0].folio})` : ''}
                    </button>
                  </div>
                </div>

                <div className="category-tabs">
                  <button
                    className={!categoryFilter ? 'active' : ''}
                    onClick={() => setCategoryFilter('')}
                  >
                    Todos ({catalog.reduce((s, c) => s + c.products.length, 0)})
                  </button>
                  {catalog.map((category) => (
                    <button
                      key={category.id}
                      className={categoryFilter === category.id ? 'active' : ''}
                      onClick={() => setCategoryFilter(category.id)}
                    >
                      <i style={{ background: category.color }} />
                      {category.name} ({category.products.length})
                    </button>
                  ))}
                </div>

                {!cashSession && (
                  <div className="pos-warning">
                    <strong>La caja está cerrada.</strong>
                    <span>Abre la caja antes de cobrar para registrar el turno correctamente.</span>
                    <button onClick={() => setView('cash')}>Abrir caja</button>
                  </div>
                )}

                <div className="product-grid">
                  {visibleProducts.map((product) => {
                    const category = catalog.find((c) =>
                      c.products.some((p) => p.id === product.id),
                    );
                    return (
                      <button
                        className="product-card touch-card"
                        key={product.id}
                        onClick={() => beginAddProduct(product)}
                      >
                        <div
                          className="product-card-top-strip"
                          style={{ background: category?.color || '#c87b45' }}
                        />
                        <div className="product-card-body">
                          <strong>{product.name}</strong>
                          <small>{product.description || 'Producto disponible'}</small>
                          <div className="product-card-footer">
                            <b className="product-price-tag">{money(product.price)}</b>
                            {product.modifierGroups.length > 0 && (
                              <span className="customizable-badge">✨ Personalizable</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {visibleProducts.length === 0 && (
                    <div className="blank-state large">
                      <h3>{posSearch ? `No hay productos que coincidan con “${posSearch}”` : 'Tu menú todavía está vacío'}</h3>
                      <p>{posSearch ? 'Intenta con otro término o limpia el buscador.' : 'Agrega inventario, categorías y productos para comenzar.'}</p>
                      {posSearch ? (
                        <button className="coffee-link compact" onClick={() => setPosSearch('')}>Borrar búsqueda</button>
                      ) : (
                        <button className="coffee-primary compact" onClick={() => setView('catalog')}>Configurar menú</button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <aside className="cart-panel modern-cart">
                <div className="cart-title">
                  <div>
                    <small>ORDEN ACTUAL</small>
                    <h2>Carrito ({cart.reduce((s, i) => s + i.quantity, 0)})</h2>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      className="cart-clear-btn"
                      onClick={() => setCart([])}
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                <div className="cart-lines">
                  {cart.map((line) => {
                    const unitPrice =
                      Number(line.product.price) +
                      line.options.reduce((sum, opt) => sum + Number(opt.priceDelta), 0);
                    const lineSubtotal = unitPrice * line.quantity;
                    return (
                      <article key={line.key} className="cart-item-row">
                        <div className="cart-item-info">
                          <div className="cart-item-header">
                            <strong>{line.product.name}</strong>
                            <button
                              type="button"
                              className="cart-item-remove-btn"
                              title="Quitar producto"
                              onClick={() => setCart((lines) => lines.filter((i) => i.key !== line.key))}
                            >
                              ×
                            </button>
                          </div>
                          {line.options.length > 0 && (
                            <small className="cart-item-modifiers">
                              {line.options.map((option) => option.name).join(', ')}
                            </small>
                          )}
                          <div className="cart-item-pricing">
                            <span>{money(unitPrice)} c/u</span>
                            <b>{money(lineSubtotal)}</b>
                          </div>
                        </div>
                        <div className="quantity-control">
                          <button
                            type="button"
                            onClick={() =>
                              setCart((lines) =>
                                lines.flatMap((item) =>
                                  item.key === line.key
                                    ? item.quantity === 1
                                      ? []
                                      : [{ ...item, quantity: item.quantity - 1 }]
                                    : [item],
                                ),
                              )
                            }
                          >
                            −
                          </button>
                          <b>{line.quantity}</b>
                          <button
                            type="button"
                            onClick={() =>
                              setCart((lines) =>
                                lines.map((item) =>
                                  item.key === line.key
                                    ? { ...item, quantity: item.quantity + 1 }
                                    : item,
                                ),
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {cart.length === 0 && (
                    <div className="blank-state">
                      <p>El carrito está vacío.</p>
                      <small>Toca cualquier producto del menú para comenzar la venta.</small>
                    </div>
                  )}
                </div>

                <div className="cart-summary-box">
                  <div className="cart-subtotal-row">
                    <span>Subtotal</span>
                    <b>{money(cartTotal)}</b>
                  </div>
                  <div className="cart-total-banner">
                    <span>TOTAL A PAGAR</span>
                    <strong>{money(cartTotal)}</strong>
                  </div>
                </div>

                <button
                  className="coffee-primary charge-button touch-charge"
                  disabled={busy || cart.length === 0 || !cashSession}
                  onClick={beginPayment}
                >
                  💳 COBRAR {money(cartTotal)}
                </button>
              </aside>
            </div>
          )}
        </div>
      </section>

      {deletingProduct && <div className="modal-backdrop"><div className="confirmation-modal"><small>CONFIRMAR ELIMINACIÓN</small><h2>¿Quieres eliminar “{deletingProduct.name}”?</h2><p>El producto desaparecerá del menú y del punto de venta. Las ventas y tickets anteriores se conservarán.</p><div><button type="button" className="coffee-link" disabled={busy} onClick={() => setDeletingProduct(null)}>Cancelar</button><button type="button" className="danger-button" disabled={busy} onClick={confirmDeleteProduct}>{busy ? 'Eliminando…' : 'Aceptar y eliminar'}</button></div></div></div>}

      {editingStock && <div className="modal-backdrop"><form className="modifier-modal coffee-form" onSubmit={submitIngredientEdit}><button type="button" className="modal-close" onClick={() => setEditingStock(null)}>×</button><small>EDITAR INVENTARIO</small><h2>{editingStock.ingredient.name}</h2><p>Puedes corregir el nombre, la unidad, la existencia actual y el nivel de aviso.</p><label>Nombre<input name="name" defaultValue={editingStock.ingredient.name} required /></label><label>Unidad<select name="unit" defaultValue={editingStock.ingredient.unit}><option value="pieza">pieza</option><option value="g">gramos (g)</option><option value="kg">kilogramos (kg)</option><option value="ml">mililitros (ml)</option><option value="l">litros (l)</option></select></label><div className="form-row"><label>Existencia actual<input name="quantity" type="number" step="0.001" min="0" defaultValue={Number(editingStock.quantity)} required /></label><label>Avisar al llegar a<input name="minQuantity" type="number" step="0.001" min="0" defaultValue={Number(editingStock.minQuantity)} required /></label></div><button className="coffee-primary" disabled={busy}>Guardar cambios del ingrediente</button></form></div>}

      {selectedProduct && <div className="modal-backdrop"><div className="modifier-modal"><button className="modal-close" onClick={() => setSelectedProduct(null)}>×</button><small>PERSONALIZA EL PRODUCTO</small><h2>{selectedProduct.name}</h2><p>Precio base: {money(selectedProduct.price)}</p>{selectedProduct.modifierGroups.map((group) => <fieldset key={group.id}><legend>{group.name} {group.required && <b>Obligatorio</b>}<small>Elige hasta {group.maxSelections}</small></legend>{group.options.map((option) => <label className={`option-card ${selectedOptions.includes(option.id) ? 'selected' : ''}`} key={option.id}><input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={() => toggleOption(group, option.id)} /><span><strong>{option.name}</strong><small>{Number(option.priceDelta) ? `+ ${money(option.priceDelta)}` : 'Incluido'}</small></span></label>)}</fieldset>)}<div className="modal-footer"><div className="quantity-control"><button onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))}>−</button><b>{selectedQuantity}</b><button onClick={() => setSelectedQuantity((value) => value + 1)}>+</button></div><button className="coffee-primary" onClick={() => {
        const invalid = selectedProduct.modifierGroups.some((group) => {
          const count = group.options.filter((option) => selectedOptions.includes(option.id)).length;
          return count < group.minSelections || count > group.maxSelections;
        });
        if (invalid) {
          setNotice({ type: 'error', text: 'Completa las opciones obligatorias antes de agregar el producto.' });
          return;
        }
        addToCart(selectedProduct, selectedOptions, selectedQuantity);
      }}>Agregar a la venta</button></div></div></div>}

      {paymentOpen && <div className="modal-backdrop"><div className="modifier-modal payment-modal"><button className="modal-close" disabled={busy} onClick={() => setPaymentOpen(false)}>×</button><small>FINALIZAR VENTA</small><h2>Pagar {money(cartTotal)}</h2><p>Selecciona cómo pagará el cliente.</p><fieldset className="payment-methods"><legend>Método de pago</legend><div><label><input type="radio" name="paymentMethod" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} /> Efectivo</label><label><input type="radio" name="paymentMethod" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} /> Tarjeta</label><label><input type="radio" name="paymentMethod" checked={paymentMethod === 'transfer'} onChange={() => setPaymentMethod('transfer')} /> Transferencia</label></div></fieldset>{paymentMethod === 'cash' && <><label className="cash-input">Efectivo recibido<input autoFocus type="number" min="0" step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="$0.00" /></label><div className="change-preview"><span>Cambio</span><b>{money(Math.max(0, Number(cashReceived || 0) - cartTotal))}</b></div></>}<div className="payment-actions"><button type="button" className="coffee-link" disabled={busy} onClick={() => setPaymentOpen(false)}>Cancelar</button><button type="button" className="coffee-primary" disabled={busy || (paymentMethod === 'cash' && Number(cashReceived) < cartTotal)} onClick={charge}>{busy ? 'Procesando…' : 'Confirmar pago'}</button></div></div></div>}

      {/* ── TICKET DUAL FORMATO ─────────────────────────────── */}
      {receipt && (
        <div className="modal-backdrop">
          <div className="receipt-modal">
            <div className="receipt-format-tabs">
              <button className={ticketFormat === 'thermal' ? 'active' : ''} onClick={() => setTicketFormat('thermal')}>📠 Rollo Térmico (80mm)</button>
              <button className={ticketFormat === 'sheet' ? 'active' : ''} onClick={() => setTicketFormat('sheet')}>📄 Hoja Normal (Carta)</button>
            </div>
            <div id="print-ticket" className={ticketFormat === 'sheet' ? 'ticket-sheet-wrap' : ''}>
              {ticketFormat === 'sheet' && <div className="sheet-cut-guide">✂ — — — — — — — — — — — — — — ✂</div>}
              <div className={`ticket-inner ${ticketFormat}`}>
                <div className="ticket-header-logo"><CoffeeLogo size={ticketFormat === 'thermal' ? 28 : 40} monochrome={true} /></div>
                <div className="ticket-brand">{ticketSettings.businessName || 'CoffeeOS'}</div>
                {ticketSettings.address && <p className="ticket-meta">{ticketSettings.address}</p>}
                {(ticketSettings.phone || ticketSettings.rfc) && (
                  <p className="ticket-meta">
                    {ticketSettings.phone && `Tel: ${ticketSettings.phone}`}
                    {ticketSettings.phone && ticketSettings.rfc && ' · '}
                    {ticketSettings.rfc && `RFC: ${ticketSettings.rfc}`}
                  </p>
                )}
                <hr />
                <div className="ticket-line"><span>Folio #{receipt.folio}</span><span>{new Date(receipt.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="ticket-line ticket-meta-small"><span>{receipt.branch.name}</span><span>{receipt.terminal.name}</span></div>
                <div className="ticket-meta" style={{ textAlign: 'center', fontSize: '9px' }}>{new Date(receipt.createdAt).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <hr />
                {receipt.items.map((item) => (
                  <div className="ticket-item-block" key={item.id}>
                    <div className="ticket-line">
                      <span><strong>{item.quantity} × {item.productName}</strong></span>
                      <b>{money(item.subtotal)}</b>
                    </div>
                    {item.modifiers.length > 0 && (
                      <div className="ticket-modifiers">{item.modifiers.map((m) => m.name).join(', ')}</div>
                    )}
                    {item.quantity > 1 && (
                      <div className="ticket-unit-price">c/u {money(Number(item.subtotal) / item.quantity)}</div>
                    )}
                  </div>
                ))}
                <hr />
                <div className="ticket-line"><span>Subtotal</span><b>{money(receipt.subtotal)}</b></div>
                <div className="ticket-total"><span>TOTAL</span><b>{money(receipt.total)}</b></div>
                <div className="ticket-line"><span>Método de pago</span><b>{paymentLabel(receipt.paymentMethod)}</b></div>
                {receipt.paymentMethod === 'cash' && (
                  <>
                    <div className="ticket-line"><span>Efectivo recibido</span><b>{money(receipt.cashReceived)}</b></div>
                    <div className="ticket-line ticket-change"><span>CAMBIO</span><b>{money(receipt.changeAmount)}</b></div>
                  </>
                )}
                <BarcodeSVG value={receipt.folio} />
                <p className="ticket-thanks">{ticketSettings.footerMessage || '¡Gracias por tu preferencia!'}</p>
              </div>
              {ticketFormat === 'sheet' && <div className="sheet-cut-guide">✂ — — — — — — — — — — — — — — ✂</div>}
            </div>
            <div className="receipt-actions">
              <button className="coffee-primary" onClick={() => window.print()}>🖨️ Imprimir ticket</button>
              <button className="coffee-link" onClick={() => setReceipt(null)}>Nueva venta</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VENTAS DEL DÍA ─────────────────────────────────── */}
      {showDailySales && (
        <div className="modal-backdrop">
          <div className="modifier-modal daily-sales-modal">
            <button className="modal-close" onClick={() => setShowDailySales(false)}>×</button>
            <small>VENTAS DEL TURNO</small>
            <h2>Ventas de hoy</h2>
            <div className="report-kpis" style={{ marginBottom: '16px' }}>
              <div className="panel">
                <small>TOTAL COBRADO</small>
                <strong>{money(salesSummary?.total ?? 0)}</strong>
              </div>
              <div className="panel">
                <small>No. DE TICKETS</small>
                <strong>{recentSales.length}</strong>
              </div>
              <div className="panel">
                <small>TICKET PROMEDIO</small>
                <strong>{recentSales.length > 0 ? money(Number(salesSummary?.total ?? 0) / recentSales.length) : money(0)}</strong>
              </div>
            </div>
            <div className="recent-sales-list">
              {recentSales.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No hay ventas registradas en este turno.</p>
              ) : (
                recentSales.map((sale) => (
                  <article className="recent-sale" key={sale.id}>
                    <div>
                      <strong>Ticket #{sale.folio}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
                        {new Date(sale.createdAt).toLocaleString('es-MX')} · {sale.items.reduce((s, i) => s + i.quantity, 0)} producto(s)
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`payment-badge ${sale.paymentMethod}`}>{paymentLabel(sale.paymentMethod)}</span>
                      <b>{money(sale.total)}</b>
                      <button
                        type="button"
                        className="coffee-primary compact"
                        onClick={() => { setReceipt(sale); setShowDailySales(false); }}
                      >
                        🖨️ Ver ticket
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CORTE Z ────────────────────────────────────────── */}
      {printCorteZ && (
        <div className="modal-backdrop">
          <div className="receipt-modal corte-z-modal">
            <div id="print-corte-z">
              <div className="ticket-header-logo"><CoffeeLogo size={32} monochrome={true} /></div>
              <div className="ticket-brand">{ticketSettings.businessName || 'CoffeeOS'}</div>
              {ticketSettings.address && <p className="ticket-meta">{ticketSettings.address} · Tel: {ticketSettings.phone}</p>}
              <h2 style={{ textAlign: 'center', margin: '12px 0 4px', fontSize: '14px', letterSpacing: '.5px' }}>CORTE DE CAJA (CIERRE Z)</h2>
              <p className="ticket-meta">{printCorteZ.terminal.name} · {printCorteZ.branch.name}</p>
              <p className="ticket-meta">{new Date(printCorteZ.closedAt).toLocaleString('es-MX')}</p>
              <hr />
              <div className="ticket-line"><span>Ventas realizadas</span><b>{printCorteZ.saleCount ?? 0}</b></div>
              <div className="ticket-line"><span>Total de ventas</span><b>{money(printCorteZ.salesTotal ?? 0)}</b></div>
              <div className="ticket-line"><span>Efectivo esperado</span><b>{money(printCorteZ.expectedCash ?? 0)}</b></div>
              <div className="ticket-line"><span>Efectivo contado</span><b>{money(printCorteZ.countedCash ?? 0)}</b></div>
              <div className="ticket-total" style={{ background: Number(printCorteZ.difference ?? 0) < 0 ? '#fee2e2' : '#dcfce7' }}>
                <span>DIFERENCIA</span>
                <b className={Number(printCorteZ.difference ?? 0) < 0 ? 'text-danger' : ''}>{money(printCorteZ.difference ?? 0)}</b>
              </div>
              <hr />
              <div className="report-signature-block" style={{ marginTop: '20px' }}>
                <div className="signature-box">
                  <div className="sig-line"></div>
                  <strong>Cajero/a</strong>
                </div>
                <div className="signature-box">
                  <div className="sig-line"></div>
                  <strong>Supervisor/a</strong>
                </div>
              </div>
            </div>
            <div className="receipt-actions">
              <button className="coffee-primary" onClick={() => window.print()}>🖨️ Imprimir Corte Z</button>
              <button className="coffee-link" onClick={() => setPrintCorteZ(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
