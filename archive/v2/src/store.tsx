import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CUSTOMER_VIEW_ID, CUSTOMERS, INCIDENTS, IOCS, ME_CUSTOMER, ME_SOC } from './mock';
import { useStored } from './lib';
import type { Customer, Incident, Ioc, Role } from './types';

interface ToastState {
  message: string;
  undo?: () => void;
}

interface Store {
  incidents: Incident[];
  customers: Customer[];
  iocs: Ioc[];
  role: Role;
  setRole: (role: Role) => void;
  me: { name: string; title: string };
  scope: string[] | null;
  setScope: (scope: string[] | null) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  toastState: ToastState | null;
  toast: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  customerOf: (id: string) => Customer;
  visible: Incident[];
  updateIncident: (id: string, patch: (inc: Incident) => Incident, log?: string) => void;
  addIncidents: (items: Incident[]) => void;
  updateCustomer: (id: string, patch: (customer: Customer) => Customer) => void;
  addIocs: (items: Omit<Ioc, 'id'>[]) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const value = useContext(Ctx);
  if (!value) throw new Error('StoreProvider is missing');
  return value;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [incidents, setIncidents] = useState(INCIDENTS);
  const [customers, setCustomers] = useState(CUSTOMERS);
  const [iocs, setIocs] = useState(IOCS);
  const [role, setRole] = useStored<Role>('role', 'soc');
  const [scope, setScope] = useStored<string[] | null>('scope', null);
  const [theme, setTheme] = useStored<'dark' | 'light'>('theme', 'dark');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const timer = useRef<number>();

  document.documentElement.dataset.theme = theme;

  const me = role === 'soc' ? ME_SOC : ME_CUSTOMER;

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToastState(null);
  }, []);

  const toast = useCallback((message: string, undo?: () => void) => {
    setToastState({ message, undo });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastState(null), undo ? 6000 : 3600);
  }, []);

  const customerOf = useCallback((id: string) => customers.find((c) => c.id === id) as Customer, [customers]);

  const visible = useMemo(() => {
    if (role === 'customer') return incidents.filter((i) => i.customerId === CUSTOMER_VIEW_ID);
    return scope ? incidents.filter((i) => scope.includes(i.customerId)) : incidents;
  }, [incidents, role, scope]);

  const updateIncident = useCallback(
    (id: string, patch: (inc: Incident) => Incident, log?: string) => {
      setIncidents((list) =>
        list.map((inc) => {
          if (inc.id !== id) return inc;
          const next = patch(inc);
          if (!log) return next;
          return {
            ...next,
            activity: [...next.activity, { id: `${id}-${next.activity.length}-${Date.now()}`, at: Date.now(), actor: me.name, text: log }],
          };
        }),
      );
    },
    [me.name],
  );

  const addIncidents = useCallback((items: Incident[]) => setIncidents((list) => [...items, ...list]), []);

  const updateCustomer = useCallback(
    (id: string, patch: (customer: Customer) => Customer) => setCustomers((list) => list.map((c) => (c.id === id ? patch(c) : c))),
    [],
  );

  const addIocs = useCallback(
    (items: Omit<Ioc, 'id'>[]) => setIocs((list) => [...items.map((item, i) => ({ ...item, id: `ioc-${Date.now()}-${i}` })), ...list]),
    [],
  );

  const value: Store = {
    incidents,
    customers,
    iocs,
    role,
    setRole,
    me,
    scope,
    setScope,
    theme,
    setTheme,
    paletteOpen,
    setPaletteOpen,
    toastState,
    toast,
    dismissToast,
    customerOf,
    visible,
    updateIncident,
    addIncidents,
    updateCustomer,
    addIocs,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
