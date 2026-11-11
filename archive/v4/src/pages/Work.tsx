import { Fragment, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Hourglass, Inbox, ListFilter, UserCheck, UserRoundX, type LucideIcon } from 'lucide-react';
import { CasePanel } from '../case/CasePanel';
import { fmtClock, hasOpenLayer, isTyping, replaceRoute, SEVERITY_LABEL, SEVERITY_ORDER, SLA_BANDS, slaBand, slaOf, STATUS_LABEL, useMemory, useNow } from '../lib';
import { useStore } from '../store';
import { EmptyState, ICON, ICON_SM, Keycap, MultiMenu, SevTag, Tile } from '../ui';
import type { Customer, Incident } from '../types';

type View = 'open' | 'mine' | 'unassigned' | 'risk' | 'waiting' | 'closed';

const VIEW_ICON: Record<View, LucideIcon> = {
  open: Inbox,
  mine: UserCheck,
  unassigned: UserRoundX,
  risk: Clock3,
  waiting: Hourglass,
  closed: CheckCircle2,
};

export function WorkPage({ caseId }: { caseId?: string }) {
  const { visible, customers, incidents, customerOf, role, me, scope, setScope, updateIncident, toast } = useStore();
  const now = useNow(1000);
  const [view, setView] = useMemory<View>('work:view', 'open');
  const [severities, setSeverities] = useMemory<string[]>('work:severity', []);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const isSoc = role === 'soc';

  const levelOf = (inc: Incident) => slaOf(inc, customerOf(inc.customerId), now).level;
  const tests: Record<View, (i: Incident) => boolean> = {
    open: (i) => i.status !== 'closed',
    mine: (i) => i.status !== 'closed' && i.assignee === me.name,
    unassigned: (i) => i.status !== 'closed' && !i.assignee,
    risk: (i) => i.status !== 'closed' && (levelOf(i) === 'bad' || levelOf(i) === 'warn'),
    waiting: (i) => i.status === 'waiting',
    closed: (i) => i.status === 'closed',
  };

  const views: { id: View; label: string }[] = isSoc
    ? [
        { id: 'open', label: 'เปิดอยู่ทั้งหมด' },
        { id: 'mine', label: 'งานของฉัน' },
        { id: 'unassigned', label: 'ยังไม่มีผู้รับ' },
        { id: 'risk', label: 'เกินหรือใกล้หมด SLA' },
        { id: 'waiting', label: 'รอลูกค้าตอบ' },
        { id: 'closed', label: 'ปิดแล้ว' },
      ]
    : [
        { id: 'open', label: 'เปิดอยู่ทั้งหมด' },
        { id: 'waiting', label: 'รอคุณตอบ' },
        { id: 'closed', label: 'ปิดแล้ว' },
      ];

  const bandedRows = visible
    .filter(tests[view])
    .filter((i) => !severities.length || severities.includes(i.severity))
    .map((inc) => {
      const s = slaOf(inc, customerOf(inc.customerId), now);
      return { inc, band: slaBand(s), remaining: s.remaining };
    });
  const sorted =
    view === 'closed'
      ? [...bandedRows].sort((a, b) => (b.inc.closedAt ?? 0) - (a.inc.closedAt ?? 0))
      : [...bandedRows].sort((a, b) => a.band - b.band || a.remaining - b.remaining);
  const rows = sorted.map((r) => r.inc);
  const showBands = view !== 'closed' && new Set(sorted.map((r) => r.band)).size > 1;

  const position = caseId ? rows.findIndex((r) => r.id === caseId) : -1;
  const firstId = rows[0]?.id;

  /* On a wide screen the first case is already open, so the panel is never empty. */
  useEffect(() => {
    if (!caseId && firstId && window.matchMedia('(min-width: 768px)').matches) replaceRoute(`/work/${firstId}`);
  }, [caseId, firstId]);

  useEffect(() => {
    if (caseId) document.getElementById(`qi-${caseId}`)?.scrollIntoView({ block: 'nearest' });
  }, [caseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.code === 'KeyJ' ? 1 : e.code === 'KeyK' ? -1 : 0;
      if (!step || !rows.length) return;
      const next = rows[position < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, position + step))];
      if (next) replaceRoute(`/work/${next.id}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, position]);

  const claim = (inc: Incident) => {
    const before = inc;
    updateIncident(inc.id, (x) => ({ ...x, assignee: me.name, status: x.status === 'new' ? 'investigating' : x.status }), 'รับงาน');
    toast('รับงานแล้ว', () => updateIncident(inc.id, () => before));
  };

  const selected = scope ?? customers.map((c) => c.id);
  const toggleCustomer = (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setScope(next.length === customers.length || next.length === 0 ? null : next);
  };
  const onlyCustomer = (id: string) => setScope(scope?.length === 1 && scope[0] === id ? null : [id]);

  const scopeLabel = !isSoc || scope === null ? (isSoc ? 'ทุกลูกค้า' : '') : customers.filter((c) => selected.includes(c.id)).map((c) => c.code).join(', ');

  return (
    <div className={`work ${caseId ? 'has-case' : ''}`}>
      {facetsOpen && <button className="facets-scrim" aria-label="ปิดตัวกรอง" onClick={() => setFacetsOpen(false)} />}
      <aside className={`facets ${facetsOpen ? 'is-open' : ''}`} aria-label="มุมมองและลูกค้า">
        <div className="facet-title">มุมมอง</div>
        {views.map((v) => {
          const Icon = VIEW_ICON[v.id];
          return (
            <button
              key={v.id}
              className={`facet ${view === v.id ? 'is-active' : ''}`}
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id);
                setFacetsOpen(false);
              }}
            >
              <Icon {...ICON} />
              <span className="facet-label">{v.label}</span>
              <span className="num">{visible.filter(tests[v.id]).length}</span>
            </button>
          );
        })}

        {isSoc && (
          <>
            <div className="facet-title facet-title-gap">
              ลูกค้า
              {scope !== null && (
                <button className="link" onClick={() => setScope(null)}>
                  ดูทั้งหมด
                </button>
              )}
            </div>
            {customers.map((customer) => (
              <CustomerFacet
                key={customer.id}
                customer={customer}
                incidents={incidents.filter((i) => i.customerId === customer.id && i.status !== 'closed')}
                now={now}
                checked={selected.includes(customer.id)}
                only={scope?.length === 1 && scope[0] === customer.id}
                onToggle={() => toggleCustomer(customer.id)}
                onOnly={() => onlyCustomer(customer.id)}
              />
            ))}
          </>
        )}
      </aside>

      <section className="queue" aria-label="คิวงาน">
        <header className="queue-head">
          <button className="icon-btn facets-toggle" aria-label="มุมมองและลูกค้า" aria-expanded={facetsOpen} onClick={() => setFacetsOpen((v) => !v)}>
            <ListFilter {...ICON} />
          </button>
          <h1>{views.find((v) => v.id === view)?.label}</h1>
          <span className="num muted">{rows.length}</span>
          <span className="queue-scope ellipsis">{scopeLabel}</span>
          <MultiMenu label="ระดับ" selected={severities} onChange={setSeverities} options={SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
        </header>

        {view !== 'closed' && rows.length > 0 && (
          <div className="queue-bands" aria-hidden="true">
            {SLA_BANDS.map((b, i) => {
              const count = sorted.filter((r) => r.band === i).length;
              return count > 0 && <i key={b.tone} className={`qb-${b.tone}`} style={{ flexGrow: count }} title={`${b.label} ${count} เคส`} />;
            })}
          </div>
        )}

        <ul className="queue-list">
          {sorted.map(({ inc, band }, index) => (
            <Fragment key={inc.id}>
              {showBands && band !== sorted[index - 1]?.band && (
                <li className={`band band-${SLA_BANDS[band].tone}`}>
                  {SLA_BANDS[band].label}
                  <span className="num">{sorted.filter((r) => r.band === band).length}</span>
                </li>
              )}
              <li>
                <QueueItem inc={inc} customer={customerOf(inc.customerId)} now={now} selected={inc.id === caseId} canClaim={isSoc} onClaim={() => claim(inc)} />
              </li>
            </Fragment>
          ))}
        </ul>
        {rows.length === 0 && (
          <EmptyState title="ไม่มีเคสในมุมมองนี้">
            {(severities.length > 0 || scope !== null) && (
              <button
                className="link"
                onClick={() => {
                  setSeverities([]);
                  setScope(null);
                }}
              >
                ล้างตัวกรอง
              </button>
            )}
          </EmptyState>
        )}

        <footer className="queue-foot">
          <span>
            <Keycap>J</Keycap>
            <Keycap>K</Keycap> เลื่อนเคส
          </span>
          {isSoc && (
            <>
              <span>
                <Keycap>A</Keycap> รับงาน
              </span>
              <span>
                <Keycap>S</Keycap> ส่ง
              </span>
            </>
          )}
          <span>
            <Keycap>/</Keycap> ค้นหา
          </span>
        </footer>
      </section>

      <section className="case-pane" aria-label="รายละเอียดเคส">
        {caseId ? (
          <>
            <a className="back-link case-back" href="#/work">
              <ArrowLeft {...ICON} />
              กลับไปคิว
            </a>
            <CasePanel key={caseId} id={caseId} mode="pane" />
          </>
        ) : (
          <EmptyState title="เลือกเคสจากคิวเพื่อเริ่มทำงาน" />
        )}
      </section>
    </div>
  );
}

function CustomerFacet({
  customer,
  incidents,
  now,
  checked,
  only,
  onToggle,
  onOnly,
}: {
  customer: Customer;
  incidents: Incident[];
  now: number;
  checked: boolean;
  only: boolean;
  onToggle: () => void;
  onOnly: () => void;
}) {
  const levels = incidents.map((i) => slaOf(i, customer, now).level);
  const breached = levels.filter((l) => l === 'bad').length;
  const near = levels.filter((l) => l === 'warn').length;
  return (
    <div className={`facet-tenant ${only ? 'is-active' : ''}`}>
      <input type="checkbox" aria-label={`รวม ${customer.name} ในคิว`} checked={checked} onChange={onToggle} />
      <button onClick={onOnly} title={`ดูเฉพาะ ${customer.name}`} aria-pressed={only}>
        <Tile code={customer.code} size="sm" />
        <span className="facet-label">{customer.name}</span>
        <span className="facet-risk" title={`เกิน ${breached} ใกล้หมด ${near} เปิดอยู่ ${incidents.length}`}>
          {breached > 0 && <span className="num text-bad">{breached}</span>}
          {near > 0 && <span className="num text-warn">{near}</span>}
          <span className="num muted">{incidents.length}</span>
        </span>
      </button>
    </div>
  );
}

function QueueItem({ inc, customer, now, selected, canClaim, onClaim }: { inc: Incident; customer: Customer; now: number; selected: boolean; canClaim: boolean; onClaim: () => void }) {
  const s = slaOf(inc, customer, now);
  const done = s.phase === 'done';
  const breached = !done && s.remaining <= 0;
  const phase = s.phase === 'mttd' ? 'MTTD' : 'MTTR';
  const level = done ? 'done' : s.paused && !breached ? 'paused' : s.level;
  return (
    <a id={`qi-${inc.id}`} href={`#/work/${inc.id}`} className={`qi sev-edge-${inc.severity} level-${level} ${selected ? 'is-selected' : ''}`} aria-current={selected ? 'true' : undefined}>
      <div className="qi-top">
        <span className="sla-time">
          {done ? 'ปิดแล้ว' : `${breached ? '+' : ''}${fmtClock(s.remaining)}`}
        </span>
        {!done && <span className="sla-phase">{s.paused ? 'หยุดนับ' : breached ? `เกิน ${phase}` : phase}</span>}
        <span className="qi-right">
          <SevTag severity={inc.severity} />
          <Tile code={customer.code} size="sm" />
        </span>
      </div>
      <div className="qi-title">{inc.title}</div>
      <div className="qi-meta">
        <span className="qi-status">
          {STATUS_LABEL[inc.status]}
          {inc.assignee ? ` · ${inc.assignee}` : ''}
        </span>
        <span className="qi-source ellipsis">{inc.logSource}</span>
        {canClaim && !inc.assignee && !done && (
          <button
            className="btn-claim"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClaim();
            }}
          >
            <UserCheck {...ICON_SM} />
            รับงาน
          </button>
        )}
      </div>
      {!done && (
        <span className="qi-fuse" aria-hidden="true">
          <i style={{ transform: `scaleX(${breached ? 1 : s.pct})` }} />
        </span>
      )}
    </a>
  );
}
