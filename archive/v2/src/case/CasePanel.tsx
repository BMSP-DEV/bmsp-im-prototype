import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileLock2,
  FileText,
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
  X,
} from 'lucide-react';
import {
  downloadCsv,
  fileSize,
  flattenIncident,
  fmtClock,
  fmtDateTime,
  fmtMinutes,
  fmtTime,
  hasOpenLayer,
  isTyping,
  pausedTotal,
  STATUS_LABEL,
  STATUS_ORDER,
  useMemory,
  useNow,
  withStatus,
} from '../lib';
import { CUSTOMER_VIEW_ID, ENCRYPTION_RULES, REPORT_TEMPLATES, SOPS } from '../mock';
import { useStore } from '../store';
import { EmptyState, Field, ICON, ICON_SM, Person, Popover, SevTag, Sheet, Tabs, TenantStrip, Tile } from '../ui';
import type { Attachment, Customer, Incident, IocType, Status } from '../types';

type Tab = 'detail' | 'chat' | 'log' | 'history';
type SheetState = null | { kind: 'send' } | { kind: 'close' } | { kind: 'isolate'; preset: string[] };

export function CasePanel({ id }: { id: string }) {
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
  return <CaseBody inc={inc} customer={customerOf(inc.customerId)} />;
}

function CaseBody({ inc, customer }: { inc: Incident; customer: Customer }) {
  const { role, me, updateIncident, addIocs, iocs, toast } = useStore();
  const now = useNow(1000);
  const [storedTab, setTab] = useMemory<Tab>('case:tab', 'detail');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [syncing, setSyncing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const isSoc = role === 'soc';
  const closed = inc.status === 'closed';
  const preSend = inc.status === 'new' || inc.status === 'investigating';
  const tab = !isSoc && storedTab === 'history' ? 'detail' : storedTab;
  const department = customer.departments.find((d) => d.id === inc.departmentId);
  const iocValues = iocs.filter((i) => i.customerId === inc.customerId).map((i) => i.value);
  const chatCount = isSoc ? inc.comments.length : inc.comments.filter((c) => !c.internal).length;

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
        : { label: 'ปิดเคส', icon: CheckCircle2, run: () => setSheet({ kind: 'close' }) };

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
    <article className="case">
      <header className="case-head">
        <div className="case-identity">
          <Tile code={customer.code} size="lg" />
          <div className="case-tenant">
            <span className="case-tenant-name">{customer.name}</span>
            <span className="sub">
              {department?.name} · Partner {customer.partner}
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
        </div>
        <h2 className="case-title">{inc.title}</h2>
        <div className="case-meta">
          <SevTag severity={inc.severity} />
          <span className="mono secondary">{inc.id}</span>
          <span className="secondary">{inc.logSource}</span>
          {inc.assignee ? <Person name={inc.assignee} /> : <span className="muted">ยังไม่มีผู้รับ</span>}
          {inc.reopened > 0 && <span className="secondary">Re-Open {inc.reopened} ครั้ง</span>}
        </div>
      </header>

      <div className="case-body">
        <CaseTrack inc={inc} customer={customer} now={now} onPick={goTo} readOnly={!isSoc} />

        {isSoc && preSend && <Readiness inc={inc} customer={customer} syncing={syncing} pdfBusy={pdfBusy} onSync={sync} onSop={applySop} onPdf={generatePdf} />}
        {isSoc && !preSend && <DeliveryCard inc={inc} onResend={() => setSheet({ kind: 'send' })} onWait={() => goTo('waiting')} onResume={() => goTo('sent')} />}

        <Tabs
          tabs={[
            { id: 'detail', label: 'รายละเอียด' },
            { id: 'chat', label: 'สนทนา', count: chatCount },
            { id: 'log', label: 'Log ดิบ' },
            ...(isSoc ? [{ id: 'history' as const, label: 'ประวัติ', count: inc.activity.length }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'detail' && (
          <div className="stack">
            <Analysis inc={inc} onApplySop={applySop} />
            <Fields inc={inc} iocValues={iocValues} canAct={isSoc} syncing={syncing} onSync={sync} onIsolate={(value) => setSheet({ kind: 'isolate', preset: [value] })} />
          </div>
        )}
        {tab === 'chat' && <Conversation inc={inc} />}
        {tab === 'log' && (
          <div className="stack">
            <p className="sub">Parse โดย {inc.parsedBy === 'SOAR' ? 'SOAR' : 'ตัวระบบ IM2'}</p>
            <pre className="raw" tabIndex={0}>
              {inc.rawLog}
            </pre>
          </div>
        )}
        {tab === 'history' && (
          <ol className="history">
            {[...inc.activity].reverse().map((a) => (
              <li key={a.id}>
                <span className="mono muted">{fmtDateTime(a.at)}</span>
                <span className="secondary">{a.actor}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {sheet?.kind === 'send' && <SendSheet inc={inc} customer={customer} onClose={closeSheet} />}
      {sheet?.kind === 'close' && <CloseSheet inc={inc} onClose={closeSheet} />}
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

/* ---------- Track: where the case is, and how much time it has used ---------- */

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
        <span className="seg-fig">{seg.state === 'idle' ? '--:--' : fmtClock(seg.elapsed)}</span>
        <div className="seg-text">
          <span>
            <b>{name}</b> <span className="muted">{span}</span>
          </span>
          <span className="seg-note">
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
          </span>
        </div>
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
    </div>
  );
}

function CaseTrack({ inc, customer, now, onPick, readOnly }: { inc: Incident; customer: Customer; now: number; onPick: (s: Status) => void; readOnly: boolean }) {
  const t = customer.sla[inc.severity];
  const mttd = segmentOf(inc.detectedAt, inc.sentAt, t.mttd * 60000, now, inc.mttdPausedMs);
  const mttr = segmentOf(inc.sentAt, inc.closedAt, t.mttr * 60000, now, inc.pausedMs, inc.pausedAt);
  const stamp = (ts: number | null, empty: string) => (ts ? fmtTime(ts, true) : empty);
  return (
    <section className="track" aria-label="ขั้นตอนและเวลา SLA">
      <StatusFlow status={inc.status} onPick={onPick} readOnly={readOnly} />
      <div className="track-segs">
        <Segment name="MTTD" span="Detect ถึงส่งเมล" seg={mttd} targetMin={t.mttd} excluded={inc.mttdPausedMs} />
        <Segment name="MTTR" span="ส่งเมลถึงปิดเคส" seg={mttr} targetMin={t.mttr} idleText="เริ่มนับเมื่อส่งเมล" excluded={pausedTotal(inc, now)} />
      </div>
      <div className="track-marks">
        <span style={{ left: 0 }}>
          Detect <span className="mono">{stamp(inc.detectedAt, '')}</span>
        </span>
        <span style={{ left: '40%' }}>
          ส่งเมล <span className="mono">{stamp(inc.sentAt, 'ยังไม่ส่ง')}</span>
        </span>
        <span style={{ right: 0 }}>
          ปิดเคส <span className="mono">{stamp(inc.closedAt, 'ยังไม่ปิด')}</span>
        </span>
      </div>
    </section>
  );
}

/* ---------- Before sending: what is ready, what is not, and the fix next to each ---------- */

function CheckRow({ ok, children, action }: { ok: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <li className="check">
      {ok ? <CheckCircle2 {...ICON} className="text-ok" aria-label="พร้อม" /> : <AlertTriangle {...ICON} className="text-warn" aria-label="ต้องดู" />}
      <span className="check-text">{children}</span>
      {action}
    </li>
  );
}

function Readiness({
  inc,
  customer,
  syncing,
  pdfBusy,
  onSync,
  onSop,
  onPdf,
}: {
  inc: Incident;
  customer: Customer;
  syncing: boolean;
  pdfBusy: boolean;
  onSync: () => void;
  onSop: () => void;
  onPdf: () => void;
}) {
  const fields = inc.groups.flatMap((g) => g.items);
  const missing = fields.filter((f) => f.value === null).length;
  const analysisReady = inc.aiState === 'ok' || inc.sopApplied;
  const pdfReady = inc.pdf === 'ready';
  const targets = customer.departments.filter((d) => d.autoSend || d.id === inc.departmentId);
  const rule = ENCRYPTION_RULES.find((r) => r.id === customer.encryption.rule);
  const pending = [missing === 0, analysisReady, pdfReady, targets.length > 0].filter((ok) => !ok).length;

  return (
    <section className="panel" aria-label="ความพร้อมก่อนส่งให้ลูกค้า">
      <div className="panel-head">
        <h3>ก่อนส่งให้ลูกค้า</h3>
        {pending > 0 ? <span className="text-warn">ต้องดู {pending} รายการ</span> : <span className="text-ok">พร้อมส่ง</span>}
      </div>
      <ul className="checks">
        <CheckRow
          ok={missing === 0}
          action={
            missing > 0 && (
              <button className="btn btn-sm" onClick={onSync} disabled={syncing} aria-busy={syncing}>
                {syncing && <Loader2 {...ICON_SM} className="spin" />}
                Sync ข้อมูล
              </button>
            )
          }
        >
          {missing > 0 ? `ข้อมูลขาด ${missing} จาก ${fields.length} field` : `ข้อมูลครบ ${fields.length} field`}
        </CheckRow>
        <CheckRow
          ok={analysisReady}
          action={
            !analysisReady && (
              <button className="btn btn-sm" onClick={onSop}>
                เติมจาก SOP
              </button>
            )
          }
        >
          {analysisReady ? `มีผลวิเคราะห์จาก ${inc.sopApplied ? SOPS[inc.kind].id : 'AI'}` : 'AI ไม่ตอบสนอง ยังไม่มีผลวิเคราะห์'}
        </CheckRow>
        <CheckRow
          ok={pdfReady}
          action={
            !pdfReady && (
              <button className="btn btn-sm" onClick={onPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
                {pdfBusy && <Loader2 {...ICON_SM} className="spin" />}
                สร้าง PDF และเข้ารหัส
              </button>
            )
          }
        >
          {pdfReady ? (
            <>
              <span className="mono">{inc.id}.pdf</span> {customer.encryption.enabled ? `เข้ารหัสตามกติกา ${rule?.label}` : 'ลูกค้านี้ไม่ได้กำหนดการเข้ารหัส'}
            </>
          ) : (
            `Flow สร้าง PDF ไม่สำเร็จ ยังไม่ได้ผูก Template ของ ${inc.logSource}`
          )}
        </CheckRow>
        <CheckRow ok={targets.length > 0}>ผู้รับ {targets.map((d) => d.name).join(', ')}</CheckRow>
      </ul>
    </section>
  );
}

function DeliveryCard({ inc, onResend, onWait, onResume }: { inc: Incident; onResend: () => void; onWait: () => void; onResume: () => void }) {
  return (
    <section className="panel" aria-label="การส่งให้ลูกค้า">
      <div className="panel-head">
        <h3>ส่งให้ลูกค้าแล้ว</h3>
        <div className="row-gap">
          {inc.status === 'sent' && (
            <button className="btn btn-sm" onClick={onWait}>
              <Pause {...ICON_SM} className="muted" />
              รอลูกค้าตอบ
            </button>
          )}
          {inc.status === 'waiting' && (
            <button className="btn btn-sm" onClick={onResume}>
              <Play {...ICON_SM} className="muted" />
              นับ SLA ต่อ
            </button>
          )}
          <button className="btn btn-sm" onClick={onResend}>
            ส่งซ้ำ
          </button>
        </div>
      </div>
      {inc.deliveries.length === 0 && <p className="sub">ยังไม่มีบันทึกการส่ง</p>}
      <ul className="deliveries">
        {inc.deliveries.map((d) => (
          <li key={d.at}>
            <FileLock2 {...ICON} className="muted" />
            <div>
              <p>
                <span className="mono">{d.file}</span>
                <span className="muted">
                  {' '}
                  {d.encrypted ? 'เข้ารหัสแล้ว' : 'ไม่เข้ารหัส'}
                  {d.manual ? ' · สร้างด้วยมือ' : ''}
                </span>
              </p>
              <p className="secondary">ถึง {d.recipients.join(', ')}</p>
              <p className="sub">
                {d.by} <span className="mono">{fmtDateTime(d.at)}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Analysis: from AI, or from the SOP when AI is not answering ---------- */

function Analysis({ inc, onApplySop }: { inc: Incident; onApplySop: () => void }) {
  const { role } = useStore();
  const sop = SOPS[inc.kind];
  const aiDown = inc.aiState === 'down' && !inc.sopApplied;

  if (aiDown && role === 'customer') {
    return (
      <section className="panel">
        <h3>ผลวิเคราะห์</h3>
        <p className="secondary">SOC กำลังวิเคราะห์เคสนี้</p>
      </section>
    );
  }

  if (aiDown) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h3 className="note-icon">
            <AlertTriangle {...ICON} className="text-warn" />
            AI ไม่ตอบสนองสำหรับเคสนี้
          </h3>
          <button className="btn btn-sm" onClick={onApplySop}>
            <FileText {...ICON_SM} className="muted" />
            เติมจาก SOP
          </button>
        </div>
        <p className="secondary">
          SOP ที่ตรงกับเคสนี้ <span className="mono">{sop.id}</span> {sop.name}
        </p>
        <ol className="sop-steps">
          {sop.steps.map((s, i) => (
            <li key={s}>
              <span className="num muted">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>ผลวิเคราะห์</h3>
        <span className="sub">{inc.sopApplied ? <>จาก <span className="mono">{sop.id}</span></> : 'จาก AI'}</span>
      </div>
      <p>{sop.analysis}</p>
      <div className="reco">
        <span className="sub">คำแนะนำ</span>
        <p>{sop.recommendation}</p>
      </div>
    </section>
  );
}

/* ---------- Case data: indicators first, because they are what an analyst acts on ---------- */

function Fields({
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

  return (
    <>
      <section className="panel panel-flush" aria-label="ตัวบ่งชี้">
        <div className="panel-head panel-pad">
          <h3>ตัวบ่งชี้</h3>
          <span className="sub">{indicators.length} รายการ</span>
        </div>
        <ul className="indicators">
          {indicators.map((f) => {
            const value = f.value;
            const inIoc = value !== null && iocValues.includes(value);
            return (
              <li key={f.key}>
                <span className="type-tag">{f.ioc}</span>
                <span className="indicator-label">{f.label}</span>
                {value === null ? (
                  <span className="text-warn indicator-value">ไม่มีข้อมูล</span>
                ) : (
                  <span className="mono indicator-value ellipsis" title={value}>
                    {value}
                  </span>
                )}
                {value !== null && (
                  <span className="indicator-actions">
                    <button className="icon-btn" aria-label={`คัดลอก ${f.label}`} onClick={() => copy(value)}>
                      <Copy {...ICON_SM} />
                    </button>
                    {inIoc && <span className="in-ioc">ใน IoC</span>}
                    {canAct && !inIoc && (
                      <button className="btn btn-sm" onClick={() => onIsolate(value)}>
                        Isolate
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel" aria-label="ข้อมูลเคส">
        <div className="panel-head">
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
    </>
  );
}

/* ---------- Conversation between SOC and customer ---------- */

function Conversation({ inc }: { inc: Incident }) {
  const { role, me, updateIncident, toast } = useStore();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'internal'>('reply');
  const [files, setFiles] = useState<Attachment[]>([]);
  const isSoc = role === 'soc';
  const list = isSoc ? inc.comments : inc.comments.filter((c) => !c.internal);
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
    <section className="thread" aria-label="สนทนา">
      {list.length === 0 && <EmptyState title="ยังไม่มีข้อความในเคสนี้" />}
      {list.map((c) => (
        <article key={c.id} className={`msg ${c.side === 'customer' ? 'msg-customer' : ''} ${c.internal ? 'msg-internal' : ''}`}>
          <header>
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
        <label className="visually-hidden" htmlFor={`composer-${inc.id}`}>
          ข้อความ
        </label>
        <textarea
          id={`composer-${inc.id}`}
          rows={3}
          placeholder={internal ? 'ลูกค้าจะไม่เห็นข้อความนี้' : 'พิมพ์ข้อความ'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
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
        <div className="composer-foot">
          <label className="btn btn-sm btn-ghost">
            <Paperclip {...ICON_SM} />
            แนบไฟล์
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
          <span className="form-hint composer-hint">CSV, Excel, ภาพ</span>
          <button className="btn btn-sm" disabled={!text.trim() && !files.length} onClick={submit}>
            ส่ง
          </button>
        </div>
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
          <ul className="recipients">
            {customer.departments.map((d) => (
              <li key={d.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(d.id)} onChange={() => setPicked((list) => (list.includes(d.id) ? list.filter((v) => v !== d.id) : [...list, d.id]))} />
                  <span className="recipient-text">
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
            <div className="alert">
              <AlertTriangle {...ICON} className="text-warn" />
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

function CloseSheet({ inc, onClose }: { inc: Incident; onClose: () => void }) {
  const { me, updateIncident, toast } = useStore();
  const [outcome, setOutcome] = useState('True Positive');
  const [note, setNote] = useState('');
  const [closeOnSiem, setCloseOnSiem] = useState(inc.logSource === 'Securonix');

  const confirm = () => {
    const before = inc;
    updateIncident(inc.id, (x) => ({ ...withStatus(x, 'closed'), closedAt: Date.now() }), `ปิดเคส ผล ${outcome}${closeOnSiem ? ` และปิดบน Securonix ด้วย Token ของ ${me.name}` : ''}`);
    toast('ปิดเคสแล้ว', () => updateIncident(inc.id, () => before));
    onClose();
  };

  return (
    <Sheet
      title="ปิดเคส"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn btn-primary btn-lg" onClick={confirm}>
            <CheckCircle2 {...ICON} />
            ปิดเคส
          </button>
          <button className="btn btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="ผลสรุป">
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option>True Positive</option>
            <option>False Positive</option>
            <option>Benign</option>
          </select>
        </Field>
        <Field label="บันทึกการปิดเคส">
          <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={closeOnSiem} onChange={(e) => setCloseOnSiem(e.target.checked)} />
          <span>
            ปิดเคสบน Securonix ด้วย
            <span className="form-hint block">ใช้ Token ของ {me.name} และบันทึกชื่อผู้ใช้บน IM2</span>
          </span>
        </label>
      </div>
    </Sheet>
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
      <ul className="recipients">
        {candidates.map((f) => {
          const value = f.value as string;
          const done = existing.includes(value);
          return (
            <li key={f.key}>
              <label>
                <input type="checkbox" disabled={done} checked={done || picked.includes(value)} onChange={() => setPicked((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]))} />
                <span className="recipient-text">
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
