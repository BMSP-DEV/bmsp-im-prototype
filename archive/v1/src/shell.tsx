import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Gauge,
  Inbox,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  Terminal,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { hasOpenLayer, isTyping, navigate, slaOf, useNow } from './lib';
import { APP_VERSION } from './mock';
import { useStore } from './store';
import { ICON, Keycap, Popover } from './ui';

function Mark() {
  /* The product mark is the SLA bar itself: time used and time left. */
  return (
    <svg className="brand-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="5" width="16" height="4" rx="1" fill="var(--text-3)" />
      <rect x="2" y="11" width="10" height="4" rx="1" fill="var(--accent)" />
    </svg>
  );
}

const LATER = [
  { label: 'Auto Incident Policy', icon: Zap },
  { label: 'รายงาน', icon: FileText },
  { label: 'Flow Status', icon: Workflow },
  { label: 'บัญชีและสิทธิ์', icon: Users },
  { label: 'Admin Console', icon: Terminal },
];

export function Sidebar({ page }: { page: string }) {
  const { collapsed, setCollapsed, role, setRole, me, theme, setTheme, visible, toast } = useStore();
  const openCount = visible.filter((i) => i.status !== 'closed').length;

  const groups = [
    {
      title: 'งาน',
      items: [
        { to: 'queue', label: 'คิว Incident', icon: Inbox, count: openCount, soc: false },
        { to: 'ioc', label: 'IoC', icon: ShieldAlert, soc: true },
      ],
    },
    { title: 'ภาพรวม', items: [{ to: 'dashboard', label: 'SLA และ KPI', icon: Gauge, soc: false }] },
    { title: 'จัดการ', items: [{ to: 'customers', label: 'ลูกค้า', icon: Building2, soc: true }] },
  ];

  return (
    <nav className="sidebar" aria-label="เมนูหลัก">
      <div className="brand">
        <Mark />
        <span className="brand-name">IM2</span>
        <button className="icon-btn brand-toggle" aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronsRight {...ICON} /> : <ChevronsLeft {...ICON} />}
        </button>
      </div>

      <div className="nav-scroll">
        {groups.map((group) => {
          const items = group.items.filter((item) => role === 'soc' || !item.soc);
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group.title}>
              <div className="nav-title">{group.title}</div>
              {items.map((item) => (
                <a key={item.to} href={`#/${item.to}`} className={`nav-row ${page === item.to ? 'is-active' : ''}`} title={item.label}>
                  <item.icon {...ICON} />
                  <span className="nav-label">{item.label}</span>
                  {'count' in item && <span className="num nav-count">{item.count}</span>}
                </a>
              ))}
            </div>
          );
        })}

        {role === 'soc' && (
          <div className="nav-group nav-later">
            <div className="nav-title">รอบถัดไป</div>
            {LATER.map((item) => (
              <button key={item.label} className="nav-row" title={`${item.label} อยู่ในรอบถัดไป`} onClick={() => toast(`${item.label} อยู่ในรอบถัดไป`)}>
                <item.icon {...ICON} />
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="side-foot">
        <Popover
          place="top"
          width={240}
          trigger={(open, flip) => (
            <button className="user" aria-expanded={open} onClick={flip} title={me.name}>
              <span className="avatar">{me.name.charAt(0)}</span>
              <span className="user-text">
                <span>{me.name}</span>
                <span className="muted">{me.title}</span>
              </span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu-head">ดูในมุมของ</div>
              <button
                className={`menu-row ${role === 'soc' ? 'is-active' : ''}`}
                onClick={() => {
                  setRole('soc');
                  close();
                  navigate('/queue');
                }}
              >
                SOC analyst
              </button>
              <button
                className={`menu-row ${role === 'customer' ? 'is-active' : ''}`}
                onClick={() => {
                  setRole('customer');
                  close();
                  navigate('/queue');
                }}
              >
                ลูกค้า ศรีนคร โลจิสติกส์
              </button>
              <div className="menu-sep" />
              <button className="menu-row" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
                {theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
              </button>
              <div className="menu-foot muted mono">{APP_VERSION}</div>
            </div>
          )}
        </Popover>
      </div>
    </nav>
  );
}

function ScopeSelect() {
  const { customers, incidents, scope, setScope } = useStore();
  const now = useNow(5000);
  const [filter, setFilter] = useState('');

  const rows = useMemo(
    () =>
      customers.map((customer) => {
        const open = incidents.filter((i) => i.customerId === customer.id && i.status !== 'closed');
        const risk = open.filter((i) => {
          const level = slaOf(i, customer, now).level;
          return level === 'warn' || level === 'bad';
        }).length;
        return { customer, open: open.length, risk };
      }),
    [customers, incidents, now],
  );

  const shown = rows.filter(({ customer }) => `${customer.code} ${customer.name}`.toLowerCase().includes(filter.toLowerCase()));
  const all = scope === null;
  const selected = scope ?? customers.map((c) => c.id);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setScope(next.length === customers.length || next.length === 0 ? null : next);
  };

  const label = all
    ? `ทุกลูกค้า (${customers.length})`
    : selected.length <= 2
      ? customers.filter((c) => selected.includes(c.id)).map((c) => c.code).join(', ')
      : `${selected.length} จาก ${customers.length} ราย`;

  return (
    <Popover
      align="right"
      width={340}
      trigger={(open, flip) => (
        <button className={`btn scope ${all ? '' : 'is-scoped'}`} aria-expanded={open} onClick={flip}>
          <Building2 {...ICON} className="muted" />
          {label}
          <ChevronDown {...ICON} className="muted" />
        </button>
      )}
    >
      <div className="scope-search">
        <input className="input" placeholder="ค้นหาลูกค้า" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      </div>
      <ul className="menu">
        {shown.map(({ customer, open, risk }) => (
          <li key={customer.id}>
            <label className="menu-row">
              <input type="checkbox" checked={selected.includes(customer.id)} onChange={() => toggle(customer.id)} />
              <span className="code">{customer.code}</span>
              <span className="menu-label">{customer.name}</span>
              <span className={`num ${risk ? 'text-warn' : 'muted'}`} title={`เปิดอยู่ ${open} เคส ใกล้หมดหรือเกิน SLA ${risk} เคส`}>
                {risk}/{open}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="menu-foot spread">
        <span className="muted">ใกล้หมด SLA / เปิดอยู่</span>
        <button className="link" onClick={() => setScope(null)}>
          เลือกทั้งหมด
        </button>
      </div>
    </Popover>
  );
}

function GlobalSearch() {
  const { query, setQuery } = useStore();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Slash' && !isTyping(e) && !hasOpenLayer()) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="search">
      <Search {...ICON} className="muted" />
      <input
        ref={ref}
        placeholder="ค้นหา"
        aria-label="ค้นหาเคส IP Hash ลูกค้า"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !window.location.hash.includes('/queue')) navigate('/queue');
          if (e.key === 'Escape') {
            setQuery('');
            e.currentTarget.blur();
          }
        }}
      />
      {!query && <Keycap>/</Keycap>}
    </div>
  );
}

export function Topbar({ title, children, scope = true }: { title: ReactNode; children?: ReactNode; scope?: boolean }) {
  const { role } = useStore();
  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">
        {children}
        <GlobalSearch />
        {scope && role === 'soc' && <ScopeSelect />}
      </div>
    </header>
  );
}
