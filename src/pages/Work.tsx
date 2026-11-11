import { Fragment, useEffect } from 'react';
import { ArrowLeft, UserCheck } from 'lucide-react';
import { CasePanel } from '../case/CasePanel';
import { fmtClock, hasOpenLayer, isTyping, lettersOff, replaceRoute, SEVERITY_LABEL, SEVERITY_ORDER, SLA_BANDS, slaBand, slaOf, STATUS_LABEL, useMemory, useNow } from '../lib';
import { useStore } from '../store';
import { EmptyState, ICON, ICON_SM, Keycap, MultiMenu, SevTag, Tile } from '../ui';
import type { Customer, Incident } from '../types';

type View = 'open' | 'mine' | 'unassigned' | 'risk' | 'waiting' | 'closed';

export function WorkPage({ caseId }: { caseId?: string }) {
  const { visible, customers, incidents, customerOf, role, me, scope, setScope, updateIncident, toast } = useStore();
  const now = useNow(1000);
  const [view, setView] = useMemory<View>('work:view', 'open');
  const [severities, setSeverities] = useMemory<string[]>('work:severity', []);
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

  const views: { id: View; label: string; short: string }[] = isSoc
    ? [
        { id: 'open', label: 'เปิดอยู่ทั้งหมด', short: 'เปิดอยู่' },
        { id: 'mine', label: 'งานของฉัน', short: 'ของฉัน' },
        { id: 'unassigned', label: 'ยังไม่มีผู้รับ', short: 'ไม่มีผู้รับ' },
        { id: 'risk', label: 'เกินหรือใกล้หมด SLA', short: 'เสี่ยง SLA' },
        { id: 'waiting', label: 'รอลูกค้าตอบ', short: 'รอลูกค้า' },
        { id: 'closed', label: 'ปิดแล้ว', short: 'ปิดแล้ว' },
      ]
    : [
        { id: 'open', label: 'เปิดอยู่ทั้งหมด', short: 'เปิดอยู่' },
        { id: 'waiting', label: 'รอคุณตอบ', short: 'รอคุณตอบ' },
        { id: 'closed', label: 'ปิดแล้ว', short: 'ปิดแล้ว' },
      ];

  const matchesSeverity = (i: Incident) => !severities.length || severities.includes(i.severity);
  const bandedRows = visible
    .filter(tests[view])
    .filter(matchesSeverity)
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
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey || lettersOff()) return;
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

  const onlyCustomer = (id: string) => setScope(scope?.length === 1 && scope[0] === id ? null : [id]);
  const anyBreached = visible.some((i) => i.status !== 'closed' && levelOf(i) === 'bad');

  return (
    <div className={`work ${caseId ? 'has-case' : ''}`}>
      <section className="queue" aria-label="คิวงาน">
        <h1 className="visually-hidden">{views.find((v) => v.id === view)?.label}</h1>
        <div className="q-views" role="group" aria-label="มุมมอง">
          {views.map((v) => {
            const count = visible.filter(tests[v.id]).filter(matchesSeverity).length;
            const tone = v.id === 'risk' && count > 0 ? (anyBreached ? 'text-bad' : 'text-warn') : undefined;
            return (
              <button key={v.id} className={`q-view ${view === v.id ? 'is-active' : ''}`} aria-pressed={view === v.id} title={v.label} onClick={() => setView(v.id)}>
                <b className={tone}>{count}</b>
                <span>{v.short}</span>
              </button>
            );
          })}
        </div>

        <div className="q-controls">
          {isSoc && (
            <div className="q-chips" role="group" aria-label="ดูเฉพาะลูกค้า">
              {customers.map((customer) => (
                <CustomerChip
                  key={customer.id}
                  customer={customer}
                  incidents={incidents.filter((i) => i.customerId === customer.id && i.status !== 'closed')}
                  now={now}
                  active={scope?.includes(customer.id) ?? false}
                  onClick={() => onlyCustomer(customer.id)}
                />
              ))}
            </div>
          )}
          <MultiMenu label="ระดับ" align="right" selected={severities} onChange={setSeverities} options={SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
        </div>

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

/* Click shows only this customer, click again shows everyone. Several at once: the switcher in the top bar. */
function CustomerChip({ customer, incidents, now, active, onClick }: { customer: Customer; incidents: Incident[]; now: number; active: boolean; onClick: () => void }) {
  const levels = incidents.map((i) => slaOf(i, customer, now).level);
  const breached = levels.filter((l) => l === 'bad').length;
  const near = levels.filter((l) => l === 'warn').length;
  const risk = breached + near;
  const summary = `${customer.name} เกิน ${breached} ใกล้หมด ${near} เปิดอยู่ ${incidents.length}`;
  return (
    <button className={`q-chip ${active ? 'is-active' : ''}`} aria-pressed={active} aria-label={summary} title={summary} onClick={onClick}>
      {customer.code}
      {risk > 0 && <span className={breached > 0 ? 'text-bad' : 'text-warn'}>{risk}</span>}
    </button>
  );
}

function QueueItem({ inc, customer, now, selected, canClaim, onClaim }: { inc: Incident; customer: Customer; now: number; selected: boolean; canClaim: boolean; onClaim: () => void }) {
  const s = slaOf(inc, customer, now);
  const done = s.phase === 'done';
  const breached = !done && s.remaining <= 0;
  const phase = s.phase === 'mttd' ? 'MTTD' : 'MTTR';
  const level = done ? 'done' : s.paused && !breached ? 'paused' : s.level;
  return (
    <div id={`qi-${inc.id}`} className={`qi level-${level} ${selected ? 'is-selected' : ''}`}>
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
      {/* The title link stretches over the card, so the claim button sits beside it rather than inside it. */}
      <a className="qi-title qi-link" href={`#/work/${inc.id}`} aria-current={selected ? 'true' : undefined}>
        {inc.title}
      </a>
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
    </div>
  );
}
