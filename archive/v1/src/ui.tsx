import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, ChevronDown, CircleDot, Hourglass, Search, Send, X, type LucideIcon } from 'lucide-react';
import { fmtClock, SEVERITY_LABEL, slaOf, STATUS_LABEL } from './lib';
import { useStore } from './store';
import type { Customer, Incident, Severity, Status } from './types';

export const ICON = { size: 16, strokeWidth: 1.5 } as const;

/* ---------- Tags ---------- */

/* Visual weight falls with severity, so critical is what the eye lands on first. */
export function SevTag({ severity }: { severity: Severity }) {
  return <span className={`sev-tag sev-tag-${severity}`}>{SEVERITY_LABEL[severity]}</span>;
}

const STATUS_ICON: Record<Status, LucideIcon> = {
  new: CircleDot,
  investigating: Search,
  sent: Send,
  waiting: Hourglass,
  closed: CheckCircle2,
};

/* Each status has its own shape, so the column reads without reading the words. */
export function StatusTag({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`status status-${status}`}>
      <Icon {...ICON} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* The same tile everywhere a list names a customer. */
export function TenantCell({ customer, sub }: { customer: Customer; sub?: ReactNode }) {
  return (
    <span className="tenant-cell">
      <span className="tile">{customer.code}</span>
      <span className="tenant-cell-text">
        <span className="ellipsis">{customer.name}</span>
        {sub && <span className="cell-sub ellipsis">{sub}</span>}
      </span>
    </span>
  );
}

export function Person({ name }: { name: string }) {
  return (
    <span className="person">
      <span className="avatar">{name.charAt(0)}</span>
      <span className="person-name">{name}</span>
    </span>
  );
}

export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}

/* ---------- The signature: an SLA bar that shrinks as the time left runs out ---------- */

export function SlaBar({ inc, customer, now }: { inc: Incident; customer: Customer; now: number }) {
  const s = slaOf(inc, customer, now);
  if (s.phase === 'done') {
    return (
      <div className="sla sla-done">
        <span className="sla-time">ปิดแล้ว</span>
      </div>
    );
  }
  const breached = s.remaining <= 0;
  const phase = s.phase === 'mttd' ? 'MTTD' : 'MTTR';
  return (
    <div className={`sla sla-${s.level} ${s.paused ? 'is-paused' : ''}`} title={s.paused ? 'หยุดนับระหว่างรอลูกค้าตอบ' : `${phase} เป้า ${fmtClock(s.target)}`}>
      <div className="sla-line">
        <span className="sla-time">
          {breached ? '+' : ''}
          {fmtClock(s.remaining)}
        </span>
        <span className="sla-phase">{s.paused ? 'หยุดนับ' : breached ? `เกิน ${phase}` : phase}</span>
      </div>
      <span className="sla-track">
        <span className="sla-fill" style={{ transform: `scaleX(${breached ? 1 : s.pct})` }} />
      </span>
    </div>
  );
}

/* ---------- Popover ---------- */

export function Popover({
  trigger,
  children,
  align = 'left',
  place = 'bottom',
  width,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  place?: 'bottom' | 'top';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="pop-wrap" ref={ref}>
      {trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div className={`pop pop-${align} pop-${place}`} style={width ? { width } : undefined}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

/* ---------- Multi-select menu used by the filters ---------- */

export function MultiMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: ReactNode; meta?: ReactNode }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <Popover
      width={240}
      trigger={(open, flip) => (
        <button className={`btn btn-filter ${selected.length ? 'is-active' : ''}`} aria-expanded={open} onClick={flip}>
          {label}
          {selected.length > 0 && <span className="num">{selected.length}</span>}
          <ChevronDown {...ICON} className="muted" />
        </button>
      )}
    >
      <ul className="menu">
        {options.map((o) => (
          <li key={o.value}>
            <label className="menu-row">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="menu-label">{o.label}</span>
              {o.meta !== undefined && <span className="num muted">{o.meta}</span>}
            </label>
          </li>
        ))}
      </ul>
      {selected.length > 0 && (
        <div className="menu-foot">
          <button className="link" onClick={() => onChange([])}>
            ล้างตัวเลือก
          </button>
        </div>
      )}
    </Popover>
  );
}

/* ---------- Sheet: a panel from the right, so the case stays visible behind it ---------- */

export function Sheet({
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ width }}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="ปิด" onClick={onClose}>
            <X {...ICON} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

/* ---------- Small controls ---------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} className={`tab ${t.id === value ? 'is-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="num">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

export function Toast() {
  const { toastMessage } = useStore();
  if (!toastMessage) return null;
  return (
    <div className="toast" role="status">
      <Check {...ICON} />
      {toastMessage}
    </div>
  );
}

/* The tenant strip repeats on every action that leaves the SOC, so a case never goes to the wrong customer. */
export function TenantStrip({ customer, department }: { customer: Customer; department?: string }) {
  return (
    <div className="tenant">
      <span className="code code-lg">{customer.code}</span>
      <span className="tenant-name">{customer.name}</span>
      {department && <span className="tenant-meta">{department}</span>}
      <span className="tenant-meta">Partner {customer.partner}</span>
    </div>
  );
}
