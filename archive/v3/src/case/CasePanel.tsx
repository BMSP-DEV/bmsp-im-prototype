import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileLock2,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldOff,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  downloadCsv,
  fileSize,
  flattenIncident,
  fmtAge,
  fmtClock,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  fmtTime,
  hasOpenLayer,
  isTyping,
  navigate,
  pausedTotal,
  slaOf,
  smoothPath,
  STATUS_LABEL,
  STATUS_ORDER,
  useMemory,
  useNow,
  useWidth,
  withStatus,
} from '../lib';
import { CUSTOMER_VIEW_ID, ENCRYPTION_RULES, REPORT_TEMPLATES, SOPS, trendFor } from '../mock';
import { useStore } from '../store';
import { ActorMark, EmptyState, Field, ICON, ICON_SM, IconTile, Modal, Person, Pill, Popover, SevTag, Sheet, StatusTag, Tabs, TenantStrip, Tile, type Tone } from '../ui';
import type { Attachment, Customer, FieldItem, Incident, IocType, Status } from '../types';

type Tab = 'overview' | 'timeline' | 'chat' | 'log';
type SheetState = null | { kind: 'send' } | { kind: 'close' } | { kind: 'isolate'; preset: string[] };

export function CasePanel({ id, mode }: { id: string; mode: 'pane' | 'page' }) {
  const { incidents, role, customerOf } = useStore();
  /* A customer can only ever open their own cases, even with a direct link to someone else's. */
  const inc = incidents.find((i) => i.id === id && (role === 'soc' || i.customerId === CUSTOMER_VIEW_ID));
  if (!inc) {
    return (
      <EmptyState title="ไม่พบเคสนี้">
        <a className="link" href="#/work">
          กลับไปหน้างาน
        </a>
      </EmptyState>
    );
  }
  return <CaseBody inc={inc} customer={customerOf(inc.customerId)} mode={mode} />;
}

function CaseBody({ inc, customer, mode }: { inc: Incident; customer: Customer; mode: 'pane' | 'page' }) {
  const { role, me, updateIncident, addIocs, iocs, toast, flash } = useStore();
  const now = useNow(1000);
  const [storedTab, setTab] = useMemory<Tab>('case:tab-v3', 'overview');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [syncing, setSyncing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const isSoc = role === 'soc';
  const closed = inc.status === 'closed';
  const preSend = inc.status === 'new' || inc.status === 'investigating';
  const tab = !isSoc && storedTab === 'timeline' ? 'overview' : storedTab;
  const department = customer.departments.find((d) => d.id === inc.departmentId);
  const iocValues = iocs.filter((i) => i.customerId === inc.customerId).map((i) => i.value);
  const chatCount = isSoc ? inc.comments.length : inc.comments.filter((c) => !c.internal).length;
  const timelineCount = timelineOf(inc).length;

  /* Status changes are easy to mis-click, so each one can be taken back from the toast. */
  const notify = (message: string) => {
    const before = inc;
    toast(message, () => updateIncident(inc.id, () => before));
  };

  const assignMe = () => {
    updateIncident(inc.id, (x) => ({ ...x, assignee: me.name, status: x.status === 'new' ? 'investigating' : x.status }), 'รับงาน');
    notify('รับงานแล้ว');
  };

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      const count = Object.keys(inc.syncable).length;
      updateIncident(
        inc.id,
        (x) => ({
          ...x,
          groups: x.groups.map((g) => ({ ...g, items: g.items.map((f) => (f.value === null && x.syncable[f.key] ? { ...f, value: x.syncable[f.key] } : f)) })),
          syncable: {},
        }),
        count ? `Sync ข้อมูล ได้เพิ่ม ${count} field` : 'Sync ข้อมูล ไม่มีข้อมูลเพิ่ม',
      );
      setSyncing(false);
      toast(count ? `Sync แล้ว ได้ข้อมูลเพิ่ม ${count} field` : 'Sync แล้ว ข้อมูลครบอยู่แล้ว');
    }, 900);
  };

  const generatePdf = () => {
    setPdfBusy(true);
    window.setTimeout(() => {
      updateIncident(inc.id, (x) => ({ ...x, pdf: 'ready' }), 'สร้าง PDF และเข้ารหัสด้วยมือ');
      setPdfBusy(false);
      toast('สร้าง PDF และเข้ารหัสแล้ว');
    }, 700);
  };

  const applySop = () => {
    const sop = SOPS[inc.kind];
    updateIncident(inc.id, (x) => ({ ...x, sopApplied: true }), `เติมผลวิเคราะห์จาก ${sop.id}`);
    notify(`เติมผลวิเคราะห์จาก ${sop.id} แล้ว`);
  };

  const goTo = (target: Status) => {
    if (target === inc.status) return;
    if (target === 'closed') {
      setSheet({ kind: 'close' });
      return;
    }
    if (target === 'sent' && !inc.sentAt) {
      if (closed) toast('ต้อง Re-Open ก่อนส่งเคส');
      else setSheet({ kind: 'send' });
      return;
    }
    if (target === 'waiting' && !inc.sentAt) {
      toast('ต้องส่งเคสให้ลูกค้าก่อน');
      return;
    }
    const back = STATUS_ORDER.indexOf(target) < STATUS_ORDER.indexOf(inc.status);
    const label = STATUS_LABEL[target];
    const pausing = target === 'waiting';
    const resuming = inc.status === 'waiting';
    const slaNote = pausing ? ' และหยุดนับ SLA' : resuming ? ' และนับ SLA ต่อ' : '';
    const at = Date.now();
    updateIncident(
      inc.id,
      (x) => {
        const next = { ...withStatus(x, target, at), closedAt: closed ? null : x.closedAt, reopened: closed ? x.reopened + 1 : x.reopened };
        if (!closed || !x.closedAt) return next;
        /* Re-Open carries on from the moment the case was closed, so the closed period never counts. */
        const gap = at - x.closedAt;
        return x.sentAt ? { ...next, pausedMs: next.pausedMs + gap } : { ...next, mttdPausedMs: next.mttdPausedMs + gap };
      },
      (closed ? `Re-Open กลับไปที่ ${label} นับ SLA ต่อจากตอนปิด` : back ? `ถอยสถานะจาก ${STATUS_LABEL[inc.status]} เป็น ${label}` : `เปลี่ยนสถานะเป็น ${label}`) + slaNote,
    );
    notify(closed ? `Re-Open แล้ว สถานะ ${label}` : pausing ? 'หยุดนับ SLA ระหว่างรอลูกค้าตอบ' : resuming ? `สถานะ ${label} นับ SLA ต่อ` : `สถานะ ${label}`);
  };

  const primary = closed
    ? { label: 'Re-Open', icon: RotateCcw, run: () => goTo('investigating') }
    : !inc.assignee
      ? { label: 'รับงาน', icon: UserCheck, run: assignMe }
      : preSend
        ? { label: 'ส่งให้ลูกค้า', icon: Send, run: () => setSheet({ kind: 'send' }) }
        : { label: 'ปิดเคส', icon: Check, run: () => setSheet({ kind: 'close' }) };

  const exportCase = () => {
    const count = downloadCsv(`${inc.id}.csv`, [flattenIncident(inc, customer)]);
    toast(`ส่งออก ${inc.id} ครบ ${count} field`);
  };

  const shortcuts = useRef({ assign: assignMe, send: () => setSheet({ kind: 'send' }), canAssign: false, canSend: false });
  shortcuts.current = { assign: assignMe, send: () => setSheet({ kind: 'send' }), canAssign: isSoc && !inc.assignee && !closed, canSend: isSoc && !!inc.assignee && preSend };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyA' && shortcuts.current.canAssign) shortcuts.current.assign();
      if (e.code === 'KeyS' && shortcuts.current.canSend) shortcuts.current.send();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <article className={`case case-${mode}`}>
      {mode === 'page' && (
        <nav className="crumbs" aria-label="ตำแหน่งหน้า">
          <a href="#/cases">เคส</a>
          <span>/</span>
          <span className="mono">{inc.id}</span>
        </nav>
      )}

      <header className="case-titlebar">
        <div className="case-title-wrap">
          {mode === 'page' ? <h1 className="case-title">{inc.title}</h1> : <h2 className="case-title">{inc.title}</h2>}
          <span className="case-pills">
            <SevTag severity={inc.severity} />
            <StatusTag status={inc.status} extra={closed ? undefined : fmtAge(now - inc.detectedAt)} />
          </span>
        </div>
        <div className="case-tools">
          {isSoc && (
            <>
              <button className="btn" onClick={sync} disabled={syncing} aria-busy={syncing}>
                {syncing ? <Loader2 {...ICON} className="spin" /> : <RefreshCw {...ICON} className="muted" />}
                Sync
              </button>
              <button className="btn" onClick={() => setSheet({ kind: 'isolate', preset: [] })}>
                <ShieldOff {...ICON} className="muted" />
                Isolate
              </button>
            </>
          )}
          <Popover
            align="right"
            width={224}
            trigger={(open, flip) => (
              <button className="btn btn-icon" aria-label="คำสั่งเพิ่มเติม" aria-expanded={open} onClick={flip}>
                <MoreHorizontal {...ICON} />
              </button>
            )}
          >
            {(close) => (
              <div className="menu">
                {isSoc && (
                  <button
                    className="menu-row"
                    onClick={() => {
                      generatePdf();
                      close();
                    }}
                  >
                    <FileLock2 {...ICON} className="muted" />
                    สร้าง PDF และเข้ารหัส
                  </button>
                )}
                <button
                  className="menu-row"
                  onClick={() => {
                    exportCase();
                    close();
                  }}
                >
                  <Download {...ICON} className="muted" />
                  Export เคสนี้
                </button>
              </div>
            )}
          </Popover>
          {isSoc && (
            <button className="btn btn-primary" onClick={primary.run}>
              <primary.icon {...ICON} />
              {primary.label}
            </button>
          )}
        </div>
      </header>

      <div className="case-identity">
        <Tile code={customer.code} />
        <span className="case-tenant">
          <span className="case-tenant-name">{customer.name}</span>
          <span className="sub">
            {department?.name} · Partner {customer.partner}
          </span>
        </span>
        <span className="case-meta">
          <span className="mono secondary">{inc.id}</span>
          <span className="secondary">{inc.logSource}</span>
          {inc.assignee ? <Person name={inc.assignee} /> : <span className="muted">ยังไม่มีผู้รับ</span>}
          {inc.reopened > 0 && <span className="secondary">Re-Open {inc.reopened} ครั้ง</span>}
        </span>
      </div>

      <StatusFlow status={inc.status} onPick={goTo} readOnly={!isSoc} />

      <div className="case-grid">
        <SummaryCard inc={inc} customer={customer} now={now} onApplySop={applySop} />

        <aside className="case-side">
          <SlaCard inc={inc} customer={customer} now={now} canAct={isSoc} onWait={() => goTo('waiting')} onResume={() => goTo('sent')} />
          {isSoc && (
            <LinkedWork
              inc={inc}
              customer={customer}
              iocCount={inc.groups.flatMap((g) => g.items).filter((f) => f.value !== null && iocValues.includes(f.value)).length}
              syncing={syncing}
              pdfBusy={pdfBusy}
              onSync={sync}
              onSop={applySop}
              onPdf={generatePdf}
              onResend={() => setSheet({ kind: 'send' })}
            />
          )}
          <Responders inc={inc} customer={customer} />
          <CustomerTrend customer={customer} />
        </aside>

        <section className="case-tabs">
          <Tabs
            tabs={[
              { id: 'overview', label: 'ภาพรวม' },
              ...(isSoc ? [{ id: 'timeline' as const, label: 'Timeline', count: timelineCount }] : []),
              { id: 'chat', label: 'สนทนา', count: chatCount },
              { id: 'log', label: 'Log ดิบ' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="case-tab-body">
            {tab === 'overview' && <Overview inc={inc} iocValues={iocValues} canAct={isSoc} syncing={syncing} onSync={sync} onIsolate={(value) => setSheet({ kind: 'isolate', preset: [value] })} />}
            {tab === 'timeline' && <Timeline inc={inc} />}
            {tab === 'chat' && <Conversation inc={inc} />}
            {tab === 'log' && (
              <div className="stack">
                <p className="sub">Parse โดย {inc.parsedBy === 'SOAR' ? 'SOAR' : 'ตัวระบบ IM2'}</p>
                <pre className="raw" tabIndex={0}>
                  {inc.rawLog}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>

      {sheet?.kind === 'send' && <SendSheet inc={inc} customer={customer} onClose={closeSheet} />}
      {sheet?.kind === 'close' && (
        <ResolveModal
          inc={inc}
          iocValues={iocValues}
          onClose={closeSheet}
          onResolved={() => {
            flash(inc.id);
            closeSheet();
            if (mode === 'page') navigate('/cases');
          }}
        />
      )}
      {sheet?.kind === 'isolate' && (
        <IsolateSheet
          inc={inc}
          customer={customer}
          preset={sheet.preset}
          existing={iocValues}
          onClose={closeSheet}
          onConfirm={(items) => {
            addIocs(items.map((item) => ({ ...item, customerId: inc.customerId, incidentId: inc.id, by: me.name, at: Date.now() })));
            updateIncident(inc.id, (x) => x, `Isolate ส่ง ${items.map((i) => i.value.slice(0, 18)).join(', ')} เข้า IoC`);
            toast(`ส่งเข้า IoC แล้ว ${items.length} รายการ`);
            closeSheet();
          }}
        />
      )}
    </article>
  );
}

function StatusFlow({ status, onPick, readOnly }: { status: Status; onPick: (s: Status) => void; readOnly: boolean }) {
  const current = STATUS_ORDER.indexOf(status);
  return (
    <ol className="flow" aria-label="สถานะของเคส">
      {STATUS_ORDER.map((step, i) => (
        <li key={step} className={i < current ? 'is-past' : i === current ? 'is-current' : ''}>
          <button disabled={readOnly} aria-current={i === current ? 'step' : undefined} title={i < current && !readOnly ? `ถอยกลับไป ${STATUS_LABEL[step]}` : undefined} onClick={() => onPick(step)}>
            {i < current && <Check {...ICON_SM} />}
            {STATUS_LABEL[step]}
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Summary: what happened, in one paragraph, before anything else ---------- */

function SummaryCard({ inc, customer, now, onApplySop }: { inc: Incident; customer: Customer; now: number; onApplySop: () => void }) {
  const { role } = useStore();
  const sop = SOPS[inc.kind];
  const aiDown = inc.aiState === 'down' && !inc.sopApplied;
  const all = inc.groups.flatMap((g) => g.items);
  const value = (key: string) => all.find((f) => f.key === key)?.value ?? '-';
  const s = slaOf(inc, customer, now);
  const done = s.phase === 'done';
  const breached = !done && s.remaining <= 0;
  const source = inc.sopApplied ? sop.id : 'AI';
  const text = aiDown ? (role === 'soc' ? `ยังไม่มีผลวิเคราะห์สำหรับเคสนี้ ใช้ ${sop.id} ${sop.name} แทนได้` : 'SOC กำลังวิเคราะห์เคสนี้') : `${sop.analysis} ${sop.recommendation}`;

  return (
    <section className="summary" aria-label="สรุปเคส">
      <span className="summary-chip">{aiDown ? 'AI ไม่ตอบสนอง' : `${source} · สรุปเมื่อ ${fmtTime(inc.detectedAt + 60000)}`}</span>
      <p className="summary-text">{text}</p>
      {aiDown && role === 'soc' && (
        <button className="summary-btn" onClick={onApplySop}>
          <FileText {...ICON_SM} />
          เติมจาก SOP
        </button>
      )}
      <dl className="summary-stats">
        <div>
          <dd>{value('event_count')}</dd>
          <dt>event</dt>
        </div>
        <div>
          <dd>{value('risk_score')}</dd>
          <dt>Risk score</dt>
        </div>
        <div>
          <dd>{all.filter((f) => f.ioc && f.value).length}</dd>
          <dt>ตัวบ่งชี้</dt>
        </div>
        <div>
          <dd className="summary-accent">{done ? 'ปิดแล้ว' : `${breached ? '+' : ''}${fmtClock(s.remaining)}`}</dd>
          <dt>{done ? 'SLA' : s.paused ? 'SLA หยุดนับ' : breached ? `เกิน ${s.phase === 'mttd' ? 'MTTD' : 'MTTR'}` : `${s.phase === 'mttd' ? 'MTTD' : 'MTTR'} เหลือ`}</dt>
        </div>
      </dl>
    </section>
  );
}

/* ---------- SLA clocks ---------- */

interface SegmentState {
  state: 'idle' | 'running' | 'done';
  elapsed: number;
  remaining: number;
  pct: number;
  level: 'ok' | 'warn' | 'bad';
  paused: boolean;
}

function segmentOf(start: number | null, end: number | null, target: number, now: number, pausedMs = 0, pausedAt: number | null = null): SegmentState {
  if (!start) return { state: 'idle', elapsed: 0, remaining: target, pct: 1, level: 'ok', paused: false };
  const paused = pausedAt !== null && !end;
  const elapsed = (end ?? pausedAt ?? now) - start - pausedMs;
  const remaining = target - elapsed;
  const pct = end ? 0 : Math.max(0, Math.min(1, remaining / target));
  const level = remaining <= 0 ? 'bad' : pct < 0.25 && !end && !paused ? 'warn' : 'ok';
  return { state: end ? 'done' : 'running', elapsed, remaining, pct, level, paused };
}

function Segment({ name, span, seg, targetMin, idleText, excluded = 0 }: { name: string; span: string; seg: SegmentState; targetMin: number; idleText?: string; excluded?: number }) {
  const over = seg.remaining <= 0;
  return (
    <div className={`seg seg-${seg.state} seg-${seg.level} ${seg.paused ? 'seg-paused' : ''}`}>
      <div className="seg-head">
        <span className="seg-name">
          <b>{name}</b> <span className="muted">{span}</span>
        </span>
        <span className="seg-fig">{seg.state === 'idle' ? '--:--' : fmtClock(seg.elapsed)}</span>
      </div>
      <div className="seg-rail">
        {seg.state === 'running' && !over && (
          <>
            <span className="seg-left" style={{ transform: `scaleX(${seg.pct})` }} />
            <i className="seg-now" style={{ left: `${(1 - seg.pct) * 100}%` }} />
          </>
        )}
        {seg.state === 'running' && over && <span className="seg-left seg-full" />}
        {seg.state === 'done' && <span className="seg-left seg-full" />}
      </div>
      <div className="seg-note">
        {seg.state === 'idle' && <span className="muted">{idleText}</span>}
        {seg.paused && (
          <span className="note-icon">
            <Pause size={12} strokeWidth={1.75} />
            หยุดนับ รอลูกค้าตอบ
          </span>
        )}
        {seg.state === 'running' && !over && <span className="seg-remaining">เหลือ {fmtClock(seg.remaining)}</span>}
        {seg.state !== 'idle' && over && (
          <span className="text-bad note-icon">
            <AlertTriangle size={12} strokeWidth={1.75} />
            เกินเป้า {fmtClock(seg.remaining)}
          </span>
        )}
        {seg.state === 'done' && !over && (
          <span className="text-ok note-icon">
            <Check size={12} strokeWidth={1.75} />
            ทันเวลา
          </span>
        )}
        <span className="muted">เป้า {fmtMinutes(targetMin)}</span>
        {excluded > 0 && <span className="muted">ไม่นับไปแล้ว {fmtClock(excluded)}</span>}
      </div>
    </div>
  );
}

function SlaCard({ inc, customer, now, canAct, onWait, onResume }: { inc: Incident; customer: Customer; now: number; canAct: boolean; onWait: () => void; onResume: () => void }) {
  const t = customer.sla[inc.severity];
  const mttd = segmentOf(inc.detectedAt, inc.sentAt, t.mttd * 60000, now, inc.mttdPausedMs);
  const mttr = segmentOf(inc.sentAt, inc.closedAt, t.mttr * 60000, now, inc.pausedMs, inc.pausedAt);
  const stamp = (ts: number | null, empty: string) => (ts ? fmtTime(ts, true) : empty);
  return (
    <section className="card side-card" aria-label="เวลา SLA">
      <div className="card-head">
        <h3>เวลา SLA</h3>
        {canAct && inc.status === 'sent' && (
          <button className="btn btn-sm" onClick={onWait}>
            <Pause {...ICON_SM} className="muted" />
            รอลูกค้าตอบ
          </button>
        )}
        {canAct && inc.status === 'waiting' && (
          <button className="btn btn-sm" onClick={onResume}>
            <Play {...ICON_SM} className="muted" />
            นับ SLA ต่อ
          </button>
        )}
      </div>
      <div className="segs">
        <Segment name="MTTD" span="Detect ถึงส่งเมล" seg={mttd} targetMin={t.mttd} excluded={inc.mttdPausedMs} />
        <Segment name="MTTR" span="ส่งเมลถึงปิดเคส" seg={mttr} targetMin={t.mttr} idleText="เริ่มนับเมื่อส่งเมล" excluded={pausedTotal(inc, now)} />
      </div>
      <dl className="stamps">
        <div>
          <dt>Detect</dt>
          <dd className="mono">{stamp(inc.detectedAt, '')}</dd>
        </div>
        <div>
          <dt>ส่งเมล</dt>
          <dd className="mono">{stamp(inc.sentAt, 'ยังไม่ส่ง')}</dd>
        </div>
        <div>
          <dt>ปิดเคส</dt>
          <dd className="mono">{stamp(inc.closedAt, 'ยังไม่ปิด')}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ---------- Linked work: everything this case depends on, and the fix beside each ---------- */

function LinkRow({ icon, title, sub, pill, action }: { icon: ReactNode; title: ReactNode; sub: ReactNode; pill: { tone: Tone; label: string }; action?: ReactNode }) {
  return (
    <li className="link-row">
      <span className="link-icon">{icon}</span>
      <span className="link-text">
        <span className="link-title ellipsis">{title}</span>
        <span className="sub ellipsis">{sub}</span>
      </span>
      <span className="link-end">
        <Pill tone={pill.tone}>{pill.label}</Pill>
        {action}
      </span>
    </li>
  );
}

function LinkedWork({
  inc,
  customer,
  iocCount,
  syncing,
  pdfBusy,
  onSync,
  onSop,
  onPdf,
  onResend,
}: {
  inc: Incident;
  customer: Customer;
  iocCount: number;
  syncing: boolean;
  pdfBusy: boolean;
  onSync: () => void;
  onSop: () => void;
  onPdf: () => void;
  onResend: () => void;
}) {
  const fields = inc.groups.flatMap((g) => g.items);
  const missing = fields.filter((f) => f.value === null).length;
  const analysisReady = inc.aiState === 'ok' || inc.sopApplied;
  const targets = customer.departments.filter((d) => d.autoSend || d.id === inc.departmentId);
  const rule = ENCRYPTION_RULES.find((r) => r.id === customer.encryption.rule);
  const lastDelivery = inc.deliveries[inc.deliveries.length - 1];
  const violation = fields.find((f) => f.key === 'violation_id')?.value ?? '-';
  const sent = inc.sentAt !== null;

  return (
    <section className="card side-card" aria-label="งานที่เกี่ยวข้อง">
      <div className="card-head">
        <h3>งานที่เกี่ยวข้อง</h3>
      </div>
      <ul className="links">
        <LinkRow
          icon={<Database {...ICON_SM} />}
          title="ข้อมูลเคส"
          sub={missing ? `ขาด ${missing} จาก ${fields.length} field` : `ครบ ${fields.length} field`}
          pill={missing ? { tone: 'amber', label: `ขาด ${missing}` } : { tone: 'green', label: 'ครบ' }}
          action={
            missing > 0 && (
              <button className="btn btn-sm" onClick={onSync} disabled={syncing} aria-busy={syncing}>
                {syncing && <Loader2 {...ICON_SM} className="spin" />}
                Sync
              </button>
            )
          }
        />
        <LinkRow
          icon={<FileText {...ICON_SM} />}
          title="ผลวิเคราะห์"
          sub={analysisReady ? `จาก ${inc.sopApplied ? SOPS[inc.kind].id : 'AI'}` : 'AI ไม่ตอบสนอง'}
          pill={analysisReady ? { tone: 'green', label: 'พร้อม' } : { tone: 'amber', label: 'ต้องดู' }}
          action={
            !analysisReady && (
              <button className="btn btn-sm" onClick={onSop}>
                เติมจาก SOP
              </button>
            )
          }
        />
        <LinkRow
          icon={<FileLock2 {...ICON_SM} />}
          title={<span className="mono">{inc.id}.pdf</span>}
          sub={inc.pdf !== 'ready' ? `ยังไม่ได้ผูก Template ของ ${inc.logSource}` : sent && lastDelivery ? `ส่งถึง ${lastDelivery.recipients.join(', ')}` : customer.encryption.enabled ? `เข้ารหัสตามกติกา ${rule?.label}` : 'ลูกค้านี้ไม่ได้กำหนดการเข้ารหัส'}
          pill={inc.pdf !== 'ready' ? { tone: 'red', label: 'ล้มเหลว' } : sent ? { tone: 'teal', label: 'ส่งแล้ว' } : { tone: 'green', label: 'พร้อม' }}
          action={
            inc.pdf !== 'ready' ? (
              <button className="btn btn-sm" onClick={onPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
                {pdfBusy && <Loader2 {...ICON_SM} className="spin" />}
                สร้าง PDF
              </button>
            ) : (
              sent && (
                <button className="btn btn-sm" onClick={onResend}>
                  ส่งซ้ำ
                </button>
              )
            )
          }
        />
        <LinkRow icon={<Users {...ICON_SM} />} title="ผู้รับเมล" sub={targets.map((d) => d.name).join(', ')} pill={{ tone: 'gray', label: `${targets.length} หน่วยงาน` }} />
        <LinkRow icon={<ShieldOff {...ICON_SM} />} title="IoC" sub={iocCount ? `${iocCount} ค่าของเคสนี้อยู่ใน IoC แล้ว` : 'ยังไม่มีค่าของเคสนี้ใน IoC'} pill={{ tone: iocCount ? 'teal' : 'gray', label: String(iocCount) }} />
        {inc.logSource === 'Securonix' && <LinkRow icon={<Link2 {...ICON_SM} />} title={<span className="mono">{violation}</span>} sub="Violation บน Securonix" pill={inc.closedAt ? { tone: 'green', label: 'ปิดแล้ว' } : { tone: 'amber', label: 'เปิดอยู่' }} />}
      </ul>
    </section>
  );
}

function Responders({ inc, customer }: { inc: Incident; customer: Customer }) {
  const department = customer.departments.find((d) => d.id === inc.departmentId);
  return (
    <section className="card side-card side-wide-only" aria-label="ผู้เกี่ยวข้อง">
      <div className="card-head">
        <h3>ผู้เกี่ยวข้อง</h3>
      </div>
      <ul className="people">
        <li>
          <ActorMark actor={inc.assignee ?? 'ระบบ'} />
          <span className="link-text">
            <span>{inc.assignee ?? 'ยังไม่มีผู้รับ'}</span>
            <span className="sub">ผู้รับผิดชอบเคส</span>
          </span>
        </li>
        <li>
          <ActorMark actor="ระบบ" />
          <span className="link-text">
            <span>{inc.parsedBy === 'SOAR' ? 'SOAR' : 'IM2'}</span>
            <span className="sub">Parse log จาก {inc.logSource}</span>
          </span>
        </li>
        {department?.contacts.slice(0, 2).map((c) => (
          <li key={c.email}>
            <ActorMark actor={c.name} />
            <span className="link-text">
              <span>{c.name}</span>
              <span className="sub">{department.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CustomerTrend({ customer }: { customer: Customer }) {
  const [ref, width] = useWidth<HTMLDivElement>(280);
  const points = trendFor([customer.id], 14);
  const height = 120;
  const m = { top: 8, right: 8, bottom: 20, left: 0 };
  const max = Math.max(...points.map((p) => p.mttd)) * 1.15;
  const x = (i: number) => m.left + (i / (points.length - 1)) * (width - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / max) * (height - m.top - m.bottom);
  const xy = points.map<[number, number]>((p, i) => [x(i), y(p.mttd)]);
  const line = smoothPath(xy);
  const baseline = height - m.bottom;
  const area = `${line}L${x(points.length - 1)},${baseline}L${x(0)},${baseline}Z`;
  const last = points[points.length - 1];
  const lastX = x(points.length - 1);
  const lastY = y(last.mttd);

  return (
    <section className="card side-card side-wide-only" aria-label="MTTD ของลูกค้ารายนี้">
      <div className="card-head">
        <h3>MTTD ของ {customer.code}</h3>
        <span className="sub">14 วัน</span>
      </div>
      <div className="mini-chart" ref={ref}>
        <svg width={width} height={height} role="img" aria-label={`MTTD ล่าสุด ${fmtMinutes(Math.round(last.mttd * 10) / 10)}`}>
          <path d={area} className="mini-area" />
          <path d={line} className="line-main" pathLength={1} />
          <circle cx={lastX} cy={lastY} r={4} className="point" />
          <text x={0} y={height - 4} className="axis">
            {fmtDate(points[0].day).slice(0, -3)}
          </text>
          <text x={width - 8} y={height - 4} textAnchor="end" className="axis">
            {fmtDate(last.day).slice(0, -3)}
          </text>
        </svg>
        <div className="mini-tip" style={{ right: 8, top: Math.max(0, lastY - 56) }}>
          <span>วันนี้</span>
          <b>{fmtMinutes(Math.round(last.mttd * 10) / 10)}</b>
        </div>
      </div>
    </section>
  );
}

/* ---------- Overview: indicators first, because they are what an analyst acts on ---------- */

function Overview({
  inc,
  iocValues,
  canAct,
  syncing,
  onSync,
  onIsolate,
}: {
  inc: Incident;
  iocValues: string[];
  canAct: boolean;
  syncing: boolean;
  onSync: () => void;
  onIsolate: (value: string) => void;
}) {
  const { toast } = useStore();
  const all = inc.groups.flatMap((g) => g.items);
  const missing = all.filter((f) => f.value === null).length;
  const indicators = all.filter((f) => f.ioc);
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value);
    toast('คัดลอกแล้ว');
  };

  const stateOf = (f: FieldItem) => {
    if (f.value === null) return <Pill tone="amber">ไม่มีข้อมูล</Pill>;
    return iocValues.includes(f.value) ? <Pill tone="teal">อยู่ใน IoC</Pill> : <Pill tone="gray">เฝ้าดู</Pill>;
  };

  return (
    <div className="stack">
      <section className="card card-flush" aria-label="ตัวบ่งชี้">
        <div className="card-head card-pad">
          <h3>ตัวบ่งชี้</h3>
          <span className="sub">{indicators.length} รายการ</span>
        </div>
        <div className="table-scroll">
          <table className="tbl tbl-card">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>รายการ</th>
                <th className="cell-title">ค่า</th>
                <th>สถานะ</th>
                <th aria-label="คำสั่ง" />
              </tr>
            </thead>
            <tbody>
              {indicators.map((f) => {
                const value = f.value;
                const inIoc = value !== null && iocValues.includes(value);
                return (
                  <tr key={f.key}>
                    <td>
                      <span className="type-tag">{f.ioc}</span>
                    </td>
                    <td className="secondary">{f.label}</td>
                    <td className="cell-title">
                      {value === null ? (
                        <span className="muted">-</span>
                      ) : (
                        <span className="mono ellipsis title-text" title={value}>
                          {value}
                        </span>
                      )}
                    </td>
                    <td>{stateOf(f)}</td>
                    <td className="cell-right">
                      {value !== null && (
                        <span className="row-actions">
                          <button className="icon-btn" aria-label={`คัดลอก ${f.label}`} onClick={() => copy(value)}>
                            <Copy {...ICON_SM} />
                          </button>
                          {canAct && !inIoc && (
                            <button className="btn btn-sm" onClick={() => onIsolate(value)}>
                              Isolate
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-label="ข้อมูลเคส">
        <div className="card-head">
          <h3>ข้อมูลเคส</h3>
          {missing > 0 ? (
            <span className="note-icon">
              <span className="text-warn">
                ขาด {missing} จาก {all.length} field
              </span>
              {canAct && (
                <button className="link" onClick={onSync} disabled={syncing}>
                  Sync ข้อมูล
                </button>
              )}
            </span>
          ) : (
            <span className="sub">ครบ {all.length} field</span>
          )}
        </div>
        {inc.groups.map((group) => {
          const items = group.items.filter((f) => !f.ioc);
          if (!items.length) return null;
          return (
            <div className="field-group" key={group.title}>
              <h4>{group.title}</h4>
              <dl className="fields">
                {items.map((f) => (
                  <div className="field" key={f.key}>
                    <dt>{f.label}</dt>
                    <dd className={f.value === 'ไม่เกี่ยวข้อง' ? 'muted' : ''} title={f.value ?? undefined}>
                      {f.value === null ? <span className="text-warn">ไม่มีข้อมูล</span> : f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ---------- Timeline: one list of everything that happened, and who did it ---------- */

interface TimelineItem {
  id: string;
  at: number;
  actor: string;
  title: string;
  meta: string;
  pill: { tone: Tone; label: string } | null;
  attachments: Attachment[];
}

function activityPill(text: string): TimelineItem['pill'] {
  if (text.startsWith('ส่ง PDF')) return { tone: 'teal', label: 'ส่งแล้ว' };
  if (text.startsWith('ปิดเคส')) return { tone: 'green', label: 'ปิดเคส' };
  if (text.startsWith('Re-Open')) return { tone: 'blue', label: 'Re-Open' };
  if (text.startsWith('AI ไม่ตอบสนอง')) return { tone: 'amber', label: 'ต้องดู' };
  if (text.startsWith('Isolate')) return { tone: 'teal', label: 'IoC' };
  if (text.includes('หยุดนับ')) return { tone: 'amber', label: 'หยุดนับ' };
  return null;
}

function timelineOf(inc: Incident): TimelineItem[] {
  /* A posted comment appears once, as the comment, not again as its log entry. */
  const isCommentLog = (text: string) => /^(ตอบลูกค้า|บันทึกภายใน SOC|ลูกค้าตอบ)/.test(text);
  const activity = inc.activity.filter((a) => !isCommentLog(a.text)).map<TimelineItem>((a) => ({ id: a.id, at: a.at, actor: a.actor, title: a.text, meta: a.actor, pill: activityPill(a.text), attachments: [] }));
  const comments = inc.comments.map<TimelineItem>((c) => ({
    id: c.id,
    at: c.at,
    actor: c.author,
    title: c.text,
    meta: `${c.author} · ${c.internal ? 'บันทึกภายใน SOC' : c.side === 'customer' ? 'ลูกค้า' : 'ตอบลูกค้า'}`,
    pill: c.side === 'customer' ? { tone: 'blue', label: 'ลูกค้าตอบ' } : null,
    attachments: c.attachments,
  }));
  return [...activity, ...comments].sort((a, b) => a.at - b.at);
}

function Timeline({ inc }: { inc: Incident }) {
  const items = timelineOf(inc);
  return (
    <section className="card timeline-card" aria-label="Timeline">
      <ol className="timeline">
        {items.map((item) => (
          <li key={item.id}>
            <time className="mono muted">{fmtTime(item.at)}</time>
            <ActorMark actor={item.actor} />
            <div className="tl-body">
              <p className="tl-title">
                <span>{item.title}</span>
                {item.pill && <Pill tone={item.pill.tone}>{item.pill.label}</Pill>}
              </p>
              <p className="sub">
                {item.meta}
                {item.attachments.length > 0 && ` · แนบ ${item.attachments.map((a) => a.name).join(', ')}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Composer inc={inc} />
    </section>
  );
}

/* ---------- Conversation between SOC and customer ---------- */

function Composer({ inc }: { inc: Incident }) {
  const { role, me, updateIncident } = useStore();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'internal'>('reply');
  const [files, setFiles] = useState<Attachment[]>([]);
  const isSoc = role === 'soc';
  const internal = isSoc && mode === 'internal';

  const submit = () => {
    if (!text.trim() && !files.length) return;
    const fileNote = files.length ? ` แนบ ${files.map((f) => f.name).join(', ')}` : '';
    /* The customer answering ends the wait, otherwise the clock could stay paused forever. */
    const resumes = !isSoc && inc.status === 'waiting';
    updateIncident(
      inc.id,
      (x) => ({
        ...(resumes ? withStatus(x, 'sent') : x),
        comments: [...x.comments, { id: `${x.id}-c${x.comments.length}-${Date.now()}`, author: me.name, side: isSoc ? 'soc' : 'customer', internal, at: Date.now(), text: text.trim(), attachments: files }],
      }),
      (internal ? 'บันทึกภายใน SOC' : isSoc ? 'ตอบลูกค้า' : 'ลูกค้าตอบ') + fileNote + (resumes ? ' และนับ SLA ต่อ' : ''),
    );
    setText('');
    setFiles([]);
  };

  return (
    <div className={`composer ${internal ? 'is-internal' : ''}`}>
      {isSoc && (
        <div className="composer-mode" role="radiogroup" aria-label="ประเภทข้อความ">
          <button role="radio" aria-checked={mode === 'reply'} className={mode === 'reply' ? 'is-active' : ''} onClick={() => setMode('reply')}>
            ตอบลูกค้า
          </button>
          <button role="radio" aria-checked={mode === 'internal'} className={mode === 'internal' ? 'is-active' : ''} onClick={() => setMode('internal')}>
            บันทึกภายใน SOC
          </button>
        </div>
      )}
      <div className="composer-row">
        <ActorMark actor={me.name} />
        <label className="visually-hidden" htmlFor={`composer-${inc.id}`}>
          ข้อความ
        </label>
        <textarea
          id={`composer-${inc.id}`}
          rows={1}
          placeholder={internal ? 'ลูกค้าจะไม่เห็นข้อความนี้' : 'พิมพ์ข้อความถึงลูกค้า'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <label className="icon-btn" title="แนบไฟล์ CSV, Excel, ภาพ" aria-label="แนบไฟล์">
          <Paperclip {...ICON} />
          <input
            type="file"
            hidden
            multiple
            accept=".csv,.xls,.xlsx,image/*"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: fileSize(f.size) }));
              setFiles((prev) => [...prev, ...picked]);
              e.target.value = '';
            }}
          />
        </label>
        <button className="btn btn-primary" disabled={!text.trim() && !files.length} onClick={submit}>
          ส่ง
        </button>
      </div>
      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f) => (
            <span className="file-chip" key={f.name}>
              <Paperclip {...ICON_SM} />
              {f.name}
              <button aria-label={`เอา ${f.name} ออก`} onClick={() => setFiles(files.filter((x) => x.name !== f.name))}>
                <X size={12} strokeWidth={1.75} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Conversation({ inc }: { inc: Incident }) {
  const { role, toast } = useStore();
  const list = role === 'soc' ? inc.comments : inc.comments.filter((c) => !c.internal);
  return (
    <section className="thread" aria-label="สนทนา">
      {list.length === 0 && <EmptyState title="ยังไม่มีข้อความในเคสนี้" />}
      {list.map((c) => (
        <article key={c.id} className={`msg ${c.side === 'customer' ? 'msg-customer' : ''} ${c.internal ? 'msg-internal' : ''}`}>
          <header>
            <ActorMark actor={c.author} />
            <span className="msg-author">{c.author}</span>
            <span className="sub">{c.internal ? 'ภายใน SOC' : c.side === 'customer' ? 'ลูกค้า' : 'SOC'}</span>
            <span className="mono muted msg-time">{fmtTime(c.at)}</span>
          </header>
          {c.text && <p>{c.text}</p>}
          {c.attachments.map((a) => (
            <button key={a.name} className="file-chip" onClick={() => toast(`ดาวน์โหลด ${a.name} และบันทึกลงประวัติ`)}>
              <Paperclip {...ICON_SM} />
              {a.name}
              <span className="muted">{a.size}</span>
            </button>
          ))}
        </article>
      ))}
      <div className="card composer-card">
        <Composer inc={inc} />
      </div>
    </section>
  );
}

/* ---------- Send: PDF, encrypted per customer, to several departments ---------- */

function SendSheet({ inc, customer, onClose }: { inc: Incident; customer: Customer; onClose: () => void }) {
  const { me, updateIncident, toast } = useStore();
  const [picked, setPicked] = useState(() => customer.departments.filter((d) => d.autoSend || d.id === inc.departmentId).map((d) => d.id));
  const [report, setReport] = useState(() => customer.reportTemplates.find((t) => t.logSource === inc.logSource)?.template ?? 'default');
  const [mail, setMail] = useState<'default' | 'custom'>(customer.emailTemplate);
  const [pdfReady, setPdfReady] = useState(inc.pdf === 'ready');
  const [sending, setSending] = useState(false);
  const manual = useRef(false);
  const rule = ENCRYPTION_RULES.find((r) => r.id === customer.encryption.rule);
  const fieldOf = (key: string) => inc.groups.flatMap((g) => g.items).find((f) => f.key === key)?.value ?? 'ไม่มีข้อมูล';
  const reportOptions = Array.from(new Set([report, ...REPORT_TEMPLATES]));

  const send = () => {
    setSending(true);
    window.setTimeout(() => {
      const recipients = customer.departments.filter((d) => picked.includes(d.id)).map((d) => d.name);
      const at = Date.now();
      updateIncident(
        inc.id,
        (x) => ({
          ...x,
          pdf: 'ready',
          status: x.status === 'new' || x.status === 'investigating' ? 'sent' : x.status,
          sentAt: x.sentAt ?? at,
          deliveries: [...x.deliveries, { at, by: me.name, recipients, file: `${x.id}.pdf`, encrypted: customer.encryption.enabled, manual: manual.current }],
        }),
        `ส่ง PDF ถึง ${recipients.join(', ')}`,
      );
      toast(`ส่งเคสถึง ${recipients.length} หน่วยงานแล้ว`);
      onClose();
    }, 600);
  };

  return (
    <Sheet
      title="ส่งเคสให้ลูกค้า"
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-primary btn-lg" disabled={!picked.length || !pdfReady || sending} aria-busy={sending} onClick={send}>
            {sending ? <Loader2 {...ICON} className="spin" /> : <Send {...ICON} />}
            ส่งถึง {picked.length} หน่วยงาน
          </button>
          <button className="btn btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <TenantStrip customer={customer} />
      <div className="form">
        <Field label="หน่วยงานที่รับ">
          <ul className="choices">
            {customer.departments.map((d) => (
              <li key={d.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(d.id)} onChange={() => setPicked((list) => (list.includes(d.id) ? list.filter((v) => v !== d.id) : [...list, d.id]))} />
                  <span className="choice-text">
                    <span>
                      {d.name} <span className="sub">{d.type}</span>
                    </span>
                    <span className="sub ellipsis">{d.contacts.map((c) => c.email).join(', ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Field>

        <div className="form-2">
          <Field label="Template รายงาน" hint={`ค่าตั้งของ ${inc.logSource} และ Partner ${customer.partner}`}>
            <select className="input" value={report} onChange={(e) => setReport(e.target.value)}>
              {reportOptions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Template เมล" hint={mail === 'default' ? 'ดึงตารางจาก Incident report ให้อัตโนมัติ' : 'ข้อความเปิดของลูกค้านี้ ต่อด้วยตาราง'}>
            <select className="input" value={mail} onChange={(e) => setMail(e.target.value as 'default' | 'custom')}>
              <option value="default">Default</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>

        <Field label="ไฟล์แนบ">
          {pdfReady ? (
            <div className="attach-row">
              <FileLock2 {...ICON} className="muted" />
              <span className="mono">{inc.id}.pdf</span>
              <span className="sub">{customer.encryption.enabled ? `เข้ารหัส AES-256 ตามกติกา ${rule?.label}` : 'ลูกค้านี้ไม่ได้กำหนดการเข้ารหัส'}</span>
            </div>
          ) : (
            <div className="banner">
              <AlertTriangle {...ICON} />
              <span>Flow สร้าง PDF ไม่สำเร็จ ยังไม่ได้ผูก Template</span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  manual.current = true;
                  setPdfReady(true);
                  updateIncident(inc.id, (x) => ({ ...x, pdf: 'ready' }), `สร้าง PDF และเข้ารหัสด้วยมือ ใช้ ${report}`);
                }}
              >
                สร้าง PDF และเข้ารหัส
              </button>
            </div>
          )}
        </Field>

        <Field label="ตัวอย่างเมล">
          <div className="mail">
            <p className="mail-subject">
              [{customer.code}] {inc.id} {inc.title}
            </p>
            {mail === 'custom' && <p className="secondary">เรียน ทีมงาน {customer.name} ข้อความเปิดตาม Template ของลูกค้านี้</p>}
            <table className="tbl tbl-plain">
              <tbody>
                {[
                  ['Incident', inc.id],
                  ['Rule', inc.title],
                  ['Source IP', fieldOf('src_ip')],
                  ['Hostname', fieldOf('hostname')],
                  ['Username', fieldOf('username')],
                  ['Detect', fmtDateTime(inc.detectedAt)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="muted">{k}</td>
                    <td className="mono">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

/* ---------- Close: the draft is ready, a person checks it and decides ---------- */

function ResolveModal({ inc, iocValues, onClose, onResolved }: { inc: Incident; iocValues: string[]; onClose: () => void; onResolved: () => void }) {
  const { me, updateIncident, addIocs, toast } = useStore();
  const sop = SOPS[inc.kind];
  const drafted = inc.aiState === 'ok' || inc.sopApplied;
  const [summary, setSummary] = useState(drafted ? `${sop.analysis} ${sop.recommendation}` : '');
  const [outcome, setOutcome] = useState('True Positive');
  const notInIoc = inc.groups.flatMap((g) => g.items).filter((f) => f.ioc && f.value !== null && !iocValues.includes(f.value));
  const [closeOnSiem, setCloseOnSiem] = useState(inc.logSource === 'Securonix');
  const [pushIoc, setPushIoc] = useState(false);
  const [tellCustomer, setTellCustomer] = useState(inc.sentAt !== null);
  const missing = inc.groups.flatMap((g) => g.items).filter((f) => f.value === null).length;

  const warning = !inc.sentAt
    ? 'เคสนี้ยังไม่เคยส่งให้ลูกค้า ปิดตอนนี้จะไม่มีค่า MTTD และลูกค้าจะไม่ได้รับรายงาน'
    : inc.status === 'waiting'
      ? 'ลูกค้ายังไม่ตอบ การปิดเคสจะหยุดรอทันที ลูกค้ายังตอบกลับในเคสได้'
      : missing > 0
        ? `ข้อมูลยังขาด ${missing} field รายงานจะแสดงว่าไม่มีข้อมูล`
        : null;

  const confirm = () => {
    const before = inc;
    const now = Date.now();
    const parts = [`ปิดเคส ผล ${outcome}`, closeOnSiem ? `ปิดบน Securonix ด้วย Token ของ ${me.name}` : '', pushIoc ? `ส่ง ${notInIoc.length} ค่าเข้า IoC` : ''].filter(Boolean);
    updateIncident(
      inc.id,
      (x) => ({
        ...withStatus(x, 'closed', now),
        closedAt: now,
        comments: tellCustomer && summary.trim() ? [...x.comments, { id: `${x.id}-c${x.comments.length}-${now}`, author: me.name, side: 'soc' as const, internal: false, at: now, text: `สรุปการปิดเคส: ${summary.trim()}`, attachments: [] }] : x.comments,
      }),
      parts.join(' และ'),
    );
    if (pushIoc) addIocs(notInIoc.map((f) => ({ type: f.ioc as IocType, value: f.value as string, customerId: inc.customerId, incidentId: inc.id, by: me.name, at: now })));
    /* Values already written to IoC cannot be pulled back by the toast, so no undo then. */
    toast('ปิดเคสแล้ว', pushIoc ? undefined : () => updateIncident(inc.id, () => before));
    onResolved();
  };

  return (
    <Modal
      title={`ปิดเคส ${inc.id}`}
      subtitle={drafted ? `ร่างสรุปจาก ${inc.sopApplied ? sop.id : 'AI'} แก้ไขได้ก่อนปิดเคส` : 'ยังไม่มีผลวิเคราะห์ กรอกสรุปการปิดเคส'}
      icon={
        <IconTile tone="teal">
          <CheckCircle2 {...ICON} />
        </IconTile>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-text btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary btn-lg" onClick={confirm}>
            ปิดเคสและบันทึกสรุป
          </button>
        </>
      }
    >
      <Field label="เกิดอะไรขึ้น">
        <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="ผลสรุป">
        <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option>True Positive</option>
          <option>False Positive</option>
          <option>Benign</option>
        </select>
      </Field>
      <Field label="สิ่งที่ทำต่อ">
        <ul className="choices">
          <li>
            <label>
              <input type="checkbox" checked={closeOnSiem} onChange={(e) => setCloseOnSiem(e.target.checked)} />
              <span className="choice-text">
                <span>ปิดเคสบน Securonix ด้วย</span>
                <span className="sub">ใช้ Token ของ {me.name} และบันทึกชื่อผู้ใช้บน IM2</span>
              </span>
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" checked={tellCustomer} onChange={(e) => setTellCustomer(e.target.checked)} />
              <span className="choice-text">
                <span>แจ้งสรุปให้ลูกค้าในสนทนา</span>
                <span className="sub">ใช้ข้อความจากช่อง เกิดอะไรขึ้น</span>
              </span>
            </label>
          </li>
          {notInIoc.length > 0 && (
            <li>
              <label>
                <input type="checkbox" checked={pushIoc} onChange={(e) => setPushIoc(e.target.checked)} />
                <span className="choice-text">
                  <span>ส่งตัวบ่งชี้เข้า IoC</span>
                  <span className="sub">{notInIoc.map((f) => f.label).join(', ')}</span>
                </span>
              </label>
            </li>
          )}
        </ul>
      </Field>
      {warning && (
        <div className="banner">
          <AlertTriangle {...ICON} />
          <span>{warning}</span>
        </div>
      )}
    </Modal>
  );
}

function IsolateSheet({
  inc,
  customer,
  preset,
  existing,
  onClose,
  onConfirm,
}: {
  inc: Incident;
  customer: Customer;
  preset: string[];
  existing: string[];
  onClose: () => void;
  onConfirm: (items: { type: IocType; value: string }[]) => void;
}) {
  const candidates = inc.groups.flatMap((g) => g.items).filter((f) => f.ioc && f.value !== null);
  const [picked, setPicked] = useState<string[]>(preset);
  const available = candidates.filter((f) => !existing.includes(f.value as string));

  return (
    <Sheet
      title="Isolate"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button
            className="btn btn-primary btn-lg"
            disabled={!picked.length}
            onClick={() => onConfirm(available.filter((f) => picked.includes(f.value as string)).map((f) => ({ type: f.ioc as IocType, value: f.value as string })))}
          >
            <ShieldOff {...ICON} />
            ส่งเข้า IoC {picked.length || ''}
          </button>
          <button className="btn btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <TenantStrip customer={customer} />
      <p className="secondary">ค่าที่เลือกจะถูกส่งไปเก็บใน IoC ของลูกค้ารายนี้ และบันทึกลงประวัติเคส</p>
      <ul className="choices">
        {candidates.map((f) => {
          const value = f.value as string;
          const done = existing.includes(value);
          return (
            <li key={f.key}>
              <label>
                <input type="checkbox" disabled={done} checked={done || picked.includes(value)} onChange={() => setPicked((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]))} />
                <span className="choice-text">
                  <span>
                    {f.label}{' '}
                    <span className="sub">
                      {f.ioc}
                      {done ? ' · อยู่ใน IoC แล้ว' : ''}
                    </span>
                  </span>
                  <span className="mono muted ellipsis">{value}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
