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
interface RecentSale {
  id: string;
  folio: number;
  total: string;
  costTotal: string;
  grossProfit: string;
  grossMargin: string;
  paymentMethod: 'cash' | 'card' | 'transfer';
  createdAt: string;
  items: { quantity: number }[];
}
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
    setStocks(await apiRequest<Stock[]>(`/inventory?branchId=${branchId}`));
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
          <div className="coffee-logo"><span>C</span> CoffeeOS</div>
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

  const visibleProducts = catalog
    .filter((category) => !categoryFilter || category.id === categoryFilter)
    .flatMap((category) => category.products);
  const lowStock = stocks.filter((stock) => Number(stock.quantity) <= Number(stock.minQuantity));

  return (
    <main className="coffee-app">
      <aside className="coffee-sidebar">
        <div className="coffee-logo"><span>C</span> CoffeeOS</div>
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
              <div className="intro"><div><small>PASO A PASO</small><h2>Prepara el lugar donde vas a vender</h2><p>Una empresa contiene sucursales; cada sucursal tiene una o más terminales de venta.</p></div></div>
              <div className="three-cards">
                <form className="panel coffee-form" onSubmit={submitCompany}>
                  <span className="step">1</span><h3>Empresa</h3>
                  <label>Nombre<input name="name" placeholder="Crepas Marco" required /></label>
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
            </div>
          )}

          {view === 'inventory' && branchId && (
            <div className="page-stack">
              <div className="intro"><div><small>CONTROL DE EXISTENCIAS</small><h2>Ingredientes y avisos</h2><p>Usa piezas, gramos, mililitros o la unidad que mejor describa cada ingrediente.</p></div><span className={`alert-pill ${lowStock.length ? 'danger' : ''}`}>{lowStock.length} avisos</span></div>
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
                      return <article key={stock.id} className={isLow ? 'low' : ''}><div><strong>{stock.ingredient.name}</strong><small>{stock.ingredient.unit}</small></div><b>{Number(stock.quantity).toLocaleString('es-MX')}</b><p>Mínimo: {Number(stock.minQuantity).toLocaleString('es-MX')} · Costo promedio: {money(stock.averageUnitCost)}</p>{isLow && <span>Reponer pronto</span>}<div className="stock-actions"><button onClick={() => restock(stock)}>+ Agregar existencia</button><button onClick={() => setEditingStock(stock)}>Editar</button></div></article>;
                    })}
                    {stocks.length === 0 && <div className="blank-state">Todavía no hay ingredientes. Agrega el primero.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'inventory' && branchId && (
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
                    <label>Nombre<input name="name" placeholder="Crepas" required /></label>
                    <label>Color<input name="color" type="color" defaultValue="#C87B45" /></label>
                    <button className="coffee-primary compact">Crear categoría</button>
                  </form>
                  <div className="panel category-list"><h3>Categorías</h3>{catalog.map((category) => <span key={category.id}><i style={{ background: category.color }} />{category.name}<b>{category.products.length}</b></span>)}</div>
                  <div className="panel catalog-product-list"><h3>Productos guardados</h3>{catalog.flatMap((category) => category.products.map((product) => <button type="button" key={product.id} onClick={() => beginEditProduct(category.id, product)}><span><strong>{product.name}</strong><small>{category.name} · {product.ingredients.length} ingredientes · {product.modifierGroups.reduce((sum, group) => sum + group.options.length, 0)} opciones</small></span><b>Editar</b></button>))}{catalog.every((category) => category.products.length === 0) && <p>Todavía no hay productos.</p>}</div>
                </div>
                <form className="panel coffee-form product-builder" onSubmit={submitProduct}>
                  <div className="panel-title"><div><small>{editingProduct ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}</small><h3>{editingProduct ? `Corrige ${editingProduct.name}` : 'Configura lo que vendes'}</h3></div>{editingProduct && <button type="button" className="coffee-link" onClick={() => resetProductEditor()}>Cancelar edición</button>}</div>
                  <div className="form-row"><label>Categoría<select name="categoryId" value={productDraft.categoryId} onChange={(event) => setProductDraft((current) => ({ ...current, categoryId: event.target.value }))} required><option value="">Selecciona</option>{catalog.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Precio base<input name="price" type="number" step="0.01" min="0" value={productDraft.price} onChange={(event) => setProductDraft((current) => ({ ...current, price: event.target.value }))} required /></label></div>
                  <label>Nombre<input name="name" placeholder="Crepa especial" value={productDraft.name} onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))} required /></label>
                  <label>Descripción<input name="description" placeholder="Incluye una fruta, una mermelada y topping" value={productDraft.description} onChange={(event) => setProductDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  <fieldset><legend>Receta base que se descuenta por unidad</legend>{recipeRows.map((row, index) => <div className="builder-row" key={index}><select value={row.ingredientId} onChange={(event) => updateRecipe(index, 'ingredientId', event.target.value)}><option value="">Ingrediente</option>{stocks.map((stock) => <option key={stock.ingredient.id} value={stock.ingredient.id}>{stock.ingredient.name} ({stock.ingredient.unit})</option>)}</select><input type="number" step="0.001" min="0" value={row.quantity} onChange={(event) => updateRecipe(index, 'quantity', Number(event.target.value))} /><button type="button" onClick={() => setRecipeRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}<button type="button" className="coffee-link" onClick={() => setRecipeRows((rows) => [...rows, { ingredientId: '', quantity: 1 }])}>+ Añadir ingrediente a la receta</button></fieldset>
                  <fieldset><legend>Opciones y extras</legend><p className="field-help">Cada opción puede sumar precio y consumir un ingrediente. El máximo indica cuántas opciones puede elegir el cliente.</p>{modifierGroups.map((group, groupIndex) => <div className="modifier-builder" key={groupIndex}><div className="builder-row group-head"><input placeholder="Grupo: Fruta, mermelada, topping…" value={group.name} onChange={(event) => updateGroup(groupIndex, 'name', event.target.value)} /><label className="check-label"><input type="checkbox" checked={group.required} onChange={(event) => updateGroup(groupIndex, 'required', event.target.checked)} />Obligatorio</label><input aria-label="Máximo" title="Cantidad máxima que puede elegir el cliente" type="number" min="1" value={group.maxSelections} onChange={(event) => updateGroup(groupIndex, 'maxSelections', Number(event.target.value))} /><button type="button" title="Eliminar grupo" onClick={() => setModifierGroups((groups) => groups.filter((_, index) => index !== groupIndex))}>×</button></div>{group.options.map((option, optionIndex) => <div className="option-row" key={option.id ?? optionIndex}><input placeholder="Opción: Nutella o plátano extra" value={option.name} onChange={(event) => updateOption(groupIndex, optionIndex, 'name', event.target.value)} /><input aria-label="Precio extra" type="number" step="0.01" min="0" placeholder="+ precio" value={option.priceDelta} onChange={(event) => updateOption(groupIndex, optionIndex, 'priceDelta', Number(event.target.value))} /><select value={option.ingredientId} onChange={(event) => updateOption(groupIndex, optionIndex, 'ingredientId', event.target.value)}><option value="">Sin consumo extra</option>{stocks.map((stock) => <option key={stock.ingredient.id} value={stock.ingredient.id}>{stock.ingredient.name} ({stock.ingredient.unit})</option>)}</select><input aria-label="Consumo" title="Cantidad que se descontará del inventario" type="number" step="0.001" min="0" value={option.quantity} onChange={(event) => updateOption(groupIndex, optionIndex, 'quantity', Number(event.target.value))} /><button type="button" className="remove-option" title={`Eliminar opción ${option.name || ''}`} onClick={() => removeOption(groupIndex, optionIndex)}>×</button></div>)}<button type="button" className="coffee-link" onClick={() => setModifierGroups((groups) => groups.map((item, index) => index === groupIndex ? { ...item, options: [...item.options, { name: '', priceDelta: 0, ingredientId: '', quantity: 0 }] } : item))}>+ Añadir opción</button></div>)}<button type="button" className="coffee-link" onClick={() => setModifierGroups((groups) => [...groups, blankModifierGroup()])}>+ Añadir grupo de opciones</button></fieldset>
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
              {closeSummary && <div className="panel close-summary"><h3>Resumen del cierre</h3><div><span><small>Ventas</small><b>{closeSummary.saleCount}</b></span><span><small>Total vendido</small><b>{money(closeSummary.salesTotal)}</b></span><span><small>Efectivo</small><b>{money(closeSummary.cashSalesTotal)}</b></span><span><small>Tarjeta</small><b>{money(closeSummary.cardSalesTotal)}</b></span><span><small>Transferencia</small><b>{money(closeSummary.transferSalesTotal)}</b></span><span><small>Efectivo esperado</small><b>{money(closeSummary.expectedCash)}</b></span><span><small>Diferencia</small><b className={Number(closeSummary.difference) < 0 ? 'negative' : ''}>{money(closeSummary.difference)}</b></span></div><h4>Necesitas reponer</h4>{closeSummary.lowStock.length ? closeSummary.lowStock.map((stock) => <p key={stock.id}>{stock.ingredient.name}: quedan {Number(stock.quantity)} {stock.ingredient.unit}</p>) : <p>Todo el inventario está por encima de sus mínimos.</p>}</div>}
              {salesSummary && <div className="panel close-summary"><h3>Resumen de ventas</h3><div><span><small>Ventas</small><b>{salesSummary.saleCount}</b></span><span><small>Total general</small><b>{money(salesSummary.total)}</b></span><span><small>Costo</small><b>{money(salesSummary.costTotal)}</b></span><span><small>Utilidad bruta</small><b>{money(salesSummary.grossProfit)}</b></span><span><small>Margen</small><b>{Number(salesSummary.grossMargin).toFixed(2)}%</b></span><span><small>Efectivo</small><b>{money(salesSummary.cash)}</b></span><span><small>Tarjeta</small><b>{money(salesSummary.card)}</b></span><span><small>Transferencia</small><b>{money(salesSummary.transfer)}</b></span></div><h3>Ventas recientes</h3>{recentSales.length === 0 ? <p>Todavía no hay ventas en esta caja.</p> : recentSales.map((sale) => <article className="recent-sale" key={sale.id}><div><strong>Venta #{sale.folio}</strong><small>{new Date(sale.createdAt).toLocaleString('es-MX')} · {sale.items.reduce((sum, item) => sum + item.quantity, 0)} producto(s) · utilidad {money(sale.grossProfit)} ({Number(sale.grossMargin).toFixed(2)}%)</small></div><b>{money(sale.total)}</b><span>{paymentLabel(sale.paymentMethod)}</span></article>)}</div>}
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
                </form>
              </div>
              {!reports ? <div className="panel empty-banner">Selecciona un periodo y actualiza para cargar el reporte.</div> : <>
                <div className="report-kpis">
                  <div className="panel"><small>Ventas</small><strong>{reports!.sales.count}</strong><span>{reports!.sales.units} productos vendidos</span></div>
                  <div className="panel"><small>Ingresos</small><strong>{money(reports!.sales.revenue)}</strong><span>Ticket promedio {money(reports!.sales.averageTicket)}</span></div>
                  <div className="panel"><small>Costo</small><strong>{money(reports!.sales.cost)}</strong><span>Inventario actual {money(reports!.inventory.value)}</span></div>
                  <div className="panel"><small>Utilidad bruta</small><strong>{money(reports!.sales.profit)}</strong><span>Margen {Number(reports!.sales.margin).toFixed(2)}%</span></div>
                </div>
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
              {cashHistory.map((closed) => <article className="recent-sale" key={closed.id}><div><strong>{closed.terminal.name}</strong><small>{new Date(closed.closedAt).toLocaleString('es-MX')} · {closed.saleCount ?? 0} venta(s)</small></div><b>{money(closed.salesTotal ?? 0)}</b><span>Diferencia {money(closed.difference ?? 0)}</span></article>)}
            </div>
          )}

          {view === 'pos' && branchId && terminalId && (
            <div className="pos-layout">
              <section className="product-area">
                <div className="category-tabs"><button className={!categoryFilter ? 'active' : ''} onClick={() => setCategoryFilter('')}>Todos</button>{catalog.map((category) => <button key={category.id} className={categoryFilter === category.id ? 'active' : ''} onClick={() => setCategoryFilter(category.id)}><i style={{ background: category.color }} />{category.name}</button>)}</div>
                {!cashSession && <div className="pos-warning"><strong>La caja está cerrada.</strong><span>Abre la caja antes de cobrar.</span><button onClick={() => setView('cash')}>Abrir caja</button></div>}
                <div className="product-grid">{visibleProducts.map((product) => <button className="product-card" key={product.id} onClick={() => beginAddProduct(product)}><span>{product.name.slice(0, 2).toUpperCase()}</span><strong>{product.name}</strong><small>{product.description || 'Producto del menú'}</small><b>{money(product.price)}</b>{product.modifierGroups.length > 0 && <em>Personalizable</em>}</button>)}{visibleProducts.length === 0 && <div className="blank-state large"><h3>Tu menú todavía está vacío</h3><p>Agrega inventario, categorías y productos para comenzar.</p><button className="coffee-primary compact" onClick={() => setView('catalog')}>Configurar menú</button></div>}</div>
              </section>
              <aside className="cart-panel">
                <div className="cart-title"><div><small>VENTA ACTUAL</small><h2>Nueva venta</h2></div><button onClick={() => setCart([])}>Limpiar</button></div>
                <div className="cart-lines">{cart.map((line) => <article key={line.key}><div><strong>{line.product.name}</strong><small>{line.options.map((option) => option.name).join(', ') || 'Sin extras'}</small><span>{money(Number(line.product.price) + line.options.reduce((sum, option) => sum + Number(option.priceDelta), 0))} c/u</span></div><div className="quantity-control"><button onClick={() => setCart((lines) => lines.flatMap((item) => item.key === line.key ? item.quantity === 1 ? [] : [{ ...item, quantity: item.quantity - 1 }] : [item]))}>−</button><b>{line.quantity}</b><button onClick={() => setCart((lines) => lines.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))}>+</button></div></article>)}{cart.length === 0 && <div className="blank-state">Selecciona un producto para iniciar.</div>}</div>
                <div className="cart-total"><span>Total</span><strong>{money(cartTotal)}</strong></div>
                <button className="coffee-primary charge-button" disabled={busy || cart.length === 0 || !cashSession} onClick={beginPayment}>Pagar {money(cartTotal)}</button>
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

      {receipt && <div className="modal-backdrop"><div className="receipt-modal"><div id="print-ticket"><div className="ticket-brand">CoffeeOS</div><h2>Ticket #{receipt.folio}</h2><p>{receipt.branch.name} · {receipt.terminal.name}</p><p>{new Date(receipt.createdAt).toLocaleString('es-MX')}</p><hr />{receipt.items.map((item) => <div className="ticket-line" key={item.id}><span>{item.quantity} × {item.productName}<small>{item.modifiers.map((modifier) => modifier.name).join(', ')}</small></span><b>{money(item.subtotal)}</b></div>)}<hr /><div className="ticket-line"><span>Subtotal</span><b>{money(receipt.subtotal)}</b></div><div className="ticket-total"><span>Total</span><b>{money(receipt.total)}</b></div><div className="ticket-line"><span>Método de pago</span><b>{paymentLabel(receipt.paymentMethod)}</b></div>{receipt.paymentMethod === 'cash' && <><div className="ticket-line"><span>Efectivo recibido</span><b>{money(receipt.cashReceived)}</b></div><div className="ticket-line"><span>Cambio</span><b>{money(receipt.changeAmount)}</b></div></>}<p className="ticket-thanks">Gracias por tu compra</p></div><div className="receipt-actions"><button className="coffee-primary" onClick={() => window.print()}>Imprimir ticket</button><button className="coffee-link" onClick={() => setReceipt(null)}>Nueva venta</button></div></div></div>}
    </main>
  );
}
