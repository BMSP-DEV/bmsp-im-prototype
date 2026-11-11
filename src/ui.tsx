import { cloneElement, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Cpu, X } from 'lucide-react';
import { fmtClock, SEVERITY_LABEL, slaOf, STATUS_LABEL } from './lib';
import { useStore } from './store';
import type { Customer, Incident, Severity, Status } from './types';

export const ICON = { size: 16, strokeWidth: 1.75 } as const;
export const ICON_SM = { size: 14, strokeWidth: 1.75 } as const;

/* ---------- Tags ---------- */

export type Tone = 'red' | 'orange' | 'amber' | 'accent' | 'blue' | 'green' | 'gray';

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      <i />
      {children}
    </span>
  );
}

/* Visual weight falls with severity, so critical is what the eye lands on first. */
export function SevTag({ severity }: { severity: Severity }) {
  return (
    <span className={`pill sev-pill-${severity}`}>
      <i />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const STATUS_TONE: Record<Status, Tone> = {
  new: 'red',
  investigating: 'blue',
  sent: 'accent',
  waiting: 'amber',
  closed: 'green',
};

export function StatusTag({ status, extra }: { status: Status; extra?: string }) {
  return (
    <Pill tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
      {extra ? ` · ${extra}` : ''}
    </Pill>
  );
}

export const SEV_TONE: Record<Severity, Tone> = { critical: 'red', high: 'orange', medium: 'amber', low: 'gray' };

export function IconTile({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`icon-tile tile-tone-${tone}`}>{children}</span>;
}

/* People are round, systems are square, so who did what reads at a glance. */
export function ActorMark({ actor }: { actor: string }) {
  if (actor === 'ระบบ') {
    return (
      <span className="actor-system" aria-hidden="true">
        <Cpu {...ICON_SM} />
      </span>
    );
  }
  return (
    <span className="avatar" aria-hidden="true">
      {actor.charAt(0)}
    </span>
  );
}

export function Tile({ code, size }: { code: string; size?: 'sm' | 'lg' }) {
  return <span className={`tile ${size ? `tile-${size}` : ''}`}>{code}</span>;
}

/* The same tile everywhere a list names a customer. */
export function TenantCell({ customer, sub }: { customer: Customer; sub?: ReactNode }) {
  return (
    <span className="tenant-cell">
      <Tile code={customer.code} />
      <span className="tenant-cell-text">
        <span className="ellipsis">{customer.name}</span>
        {sub && <span className="sub ellipsis">{sub}</span>}
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

/* Time left, two lines, for table rows. Queue cards draw the same data as a fuse. */
export function SlaCell({ inc, customer, now }: { inc: Incident; customer: Customer; now: number }) {
  const s = slaOf(inc, customer, now);
  if (s.phase === 'done') return <span className="muted">ปิดแล้ว</span>;
  const breached = s.remaining <= 0;
  const phase = s.phase === 'mttd' ? 'MTTD' : 'MTTR';
  return (
    <div className={`sla-cell level-${s.paused && !breached ? 'paused' : s.level}`} title={s.paused ? 'หยุดนับระหว่างรอลูกค้าตอบ' : `${phase} เป้า ${fmtClock(s.target)}`}>
      <div className="sla-cell-line">
        <span className="sla-time">
          {breached ? '+' : ''}
          {fmtClock(s.remaining)}
        </span>
        <span className="sla-phase">{s.paused ? 'หยุดนับ' : breached ? `เกิน ${phase}` : phase}</span>
      </div>
      <span className="meter">
        <i style={{ transform: `scaleX(${breached ? 1 : s.pct})` }} />
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
  place?: 'bottom' | 'top' | 'side';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  /* Fit the menu in the space it has: the list scrolls instead of running off the screen. */
  useLayoutEffect(() => {
    const pop = popRef.current;
    const anchor = ref.current;
    if (!open || !pop || !anchor) return;
    const box = anchor.getBoundingClientRect();
    const floor = pop.closest('.main')?.getBoundingClientRect().bottom ?? window.innerHeight;
    const room = place === 'top' ? box.top : floor - box.bottom;
    pop.style.maxHeight = `${Math.max(180, room - 16)}px`;
  }, [open, place]);

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
        <div ref={popRef} className={`pop pop-${align} pop-${place}`} style={width ? { width } : undefined}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MultiMenu({
  label,
  options,
  selected,
  onChange,
  align,
}: {
  label: string;
  options: { value: string; label: ReactNode; meta?: ReactNode }[];
  selected: string[];
  onChange: (values: string[]) => void;
  align?: 'left' | 'right';
}) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <Popover
      width={240}
      align={align}
      trigger={(open, flip) => (
        <button className={`btn btn-sm ${selected.length ? 'is-on' : ''}`} aria-expanded={open} onClick={flip}>
          {label}
          {selected.length > 0 && <span className="num">{selected.length}</span>}
          <ChevronDown {...ICON_SM} className="muted" />
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

/* Focus goes into a layer once, when it opens, and back to the control that opened it when it closes.
   - The opener is read during the first render, before any field inside can autofocus.
   - onClose is read through a ref: parents that re-render every second pass a new function each
     time, and re-running the effect on that used to pull focus out of the field being typed in.
   - Tab and Shift+Tab cycle inside the layer, and only the topmost layer answers keys.
   - Focus is restored only when the layer has really left the page, not on a dev-mode effect replay. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useLayerFocus(ref: RefObject<HTMLElement>, onClose: () => void) {
  const close = useRef(onClose);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!node) return;
      const layers = document.querySelectorAll('.sheet-layer');
      if (layers.length && !layers[layers.length - 1].contains(node)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!node?.isConnected) opener?.focus?.();
    };
  }, [ref, opener]);
}

/* A layer holding unsaved input asks before it closes, from the X, the backdrop or Esc. */
function useDiscardGuard(dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  const keep = () => setAsking(false);
  /* Back to the field that was being filled in, once the question is gone. */
  useEffect(() => {
    if (asking || !back.current) return;
    back.current.focus();
    back.current = null;
  }, [asking]);
  const request = () => {
    if (asking) keep();
    else if (dirty) {
      back.current = document.activeElement as HTMLElement | null;
      setAsking(true);
    } else onClose();
  };
  return { asking, request, keep };
}

function DiscardBar({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="discard-bar" role="alert">
      <span>ถ้าปิดตอนนี้ ข้อมูลที่กรอกไว้จะหาย</span>
      <button className="btn" onClick={onKeep} autoFocus>
        กรอกต่อ
      </button>
      <button className="btn btn-discard" onClick={onDiscard}>
        ทิ้งข้อมูล
      </button>
    </div>
  );
}

/* ---------- Sheet: a panel from the right, so the case stays visible behind it ---------- */

export function Sheet({
  title,
  onClose,
  children,
  footer,
  width = 560,
  dirty = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const guard = useDiscardGuard(dirty, onClose);
  useLayerFocus(ref, guard.request);

  return createPortal(
    <div className="sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && guard.request()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ width }}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="ปิด" onClick={guard.request}>
            <X {...ICON} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {guard.asking ? (
          <footer className="sheet-foot">
            <DiscardBar onKeep={guard.keep} onDiscard={onClose} />
          </footer>
        ) : (
          footer && <footer className="sheet-foot">{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/* A decision that closes something gets the centre of the screen. */
export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  dirty = false,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const guard = useDiscardGuard(dirty, onClose);
  useLayerFocus(ref, guard.request);

  return createPortal(
    <div className="sheet-layer modal-layer" onMouseDown={(e) => e.target === e.currentTarget && guard.request()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-head">
          {icon}
          <div className="modal-titles">
            <h2>{title}</h2>
            {subtitle && <p className="secondary">{subtitle}</p>}
          </div>
          <button className="icon-btn" aria-label="ปิด" onClick={guard.request}>
            <X {...ICON} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">{guard.asking ? <DiscardBar onKeep={guard.keep} onDiscard={onClose} /> : footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Small controls ---------- */

/* Arrow keys, Home and End move between tabs; only the selected tab sits in the Tab order. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  panelId,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  panelId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, tabs.findIndex((t) => t.id === value));
  const onKey = (e: React.KeyboardEvent) => {
    const targets: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in targets)) return;
    e.preventDefault();
    const next = (targets[e.key] + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" onKeyDown={onKey}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          id={panelId ? `${panelId}-tab-${t.id}` : undefined}
          aria-controls={panelId}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={`tab ${t.id === value ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
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

/* A lone native control gets a real label (click it to focus the control). Anything else is a named group. */
const FIELD_CONTROLS = new Set(['input', 'select', 'textarea']);

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const control = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children) && typeof children.type === 'string' && FIELD_CONTROLS.has(children.type) ? children : null;
  if (control) {
    const controlId = control.props.id ?? `${id}-control`;
    return (
      <div className="form-field">
        <label className="form-label" htmlFor={controlId}>
          {label}
        </label>
        {cloneElement(control, { id: controlId, 'aria-describedby': hintId })}
        {hint && (
          <span className="form-hint" id={hintId}>
            {hint}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="form-field" role="group" aria-labelledby={`${id}-label`} aria-describedby={hintId}>
      <span className="form-label" id={`${id}-label`}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="form-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Toast() {
  const { toastState, dismissToast } = useStore();
  if (!toastState) return null;
  const { message, undo } = toastState;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Check {...ICON} className="text-ok" />
      <span>{message}</span>
      {undo && (
        <button
          className="link"
          onClick={() => {
            undo();
            dismissToast();
          }}
        >
          เลิกทำ
        </button>
      )}
    </div>
  );
}

/* Thai writes no spaces inside words, so a long transliterated name can break mid-word.
   Names here break only at their own spaces. */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="nowrap">{word}</span>
        </Fragment>
      ))}
    </>
  );
}

/* Repeats on every action that leaves the SOC, so a case never goes to the wrong customer. */
export function TenantStrip({ customer, department }: { customer: Customer; department?: string }) {
  return (
    <div className="tenant-strip">
      <Tile code={customer.code} />
      <span className="tenant-strip-name">
        <Words text={customer.name} />
      </span>
      {department && <span className="secondary">{department}</span>}
      <span className="muted">Partner {customer.partner}</span>
    </div>
  );
}
