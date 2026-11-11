import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileLock2,
  FileText,
  MoreHorizontal,
  Paperclip,
  Pause,
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
  getQueueOrder,
  hasOpenLayer,
  isTyping,
  navigate,
  pausedTotal,
  STATUS_LABEL,
  STATUS_ORDER,
  useNow,
  withStatus,
} from '../lib';
import { CUSTOMER_VIEW_ID, ENCRYPTION_RULES, REPORT_TEMPLATES, SOPS } from '../mock';
import { Topbar } from '../shell';
import { useStore } from '../store';
import { Field, ICON, Popover, SevTag, Sheet, Tabs, TenantStrip } from '../ui';
import type { Attachment, Customer, Incident, Status } from '../types';

type SheetState = null | { kind: 'send' } | { kind: 'close' } | { kind: 'isolate'; preset: string[] };

export function IncidentPage({ id }: { id: string }) {
  const { incidents, customerOf, role, me, updateIncident, addIocs, iocs, toast } = useStore();
  /* A customer can only ever open their own cases, even with a direct link to someone else's. */
  const inc = incidents.find((i) => i.id === id && (role === 'soc' || i.customerId === CUSTOMER_VIEW_ID));
  const now = useNow(1000);
  const [tab, setTab] = useState<'detail' | 'log' | 'history'>('detail');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [syncing, setSyncing] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const order = getQueueOrder();
  const position = order.indexOf(id);
  const prev = position > 0 ? order[position - 1] : null;
  const next = position >= 0 && position < order.length - 1 ? order[position + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyJ' && next) navigate(`/incident/${next}`);
      if (e.code === 'KeyK' && prev) navigate(`/incident/${prev}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (!inc) {
    return (
      <>
        <Topbar title="ไม่พบเคส" scope={false} />
        <div className="empty">
          <p>ไม่พบเคสนี้</p>
          <a className="link" href="#/queue">
            กลับไปคิว Incident
          </a>
        </div>
      </>
    );
  }

  const customer = customerOf(inc.customerId);
  const department = customer.departments.find((d) => d.id === inc.departmentId);
  const isSoc = role === 'soc';
  const closed = inc.status === 'closed';
  const iocValues = iocs.filter((i) => i.customerId === inc.customerId).map((i) => i.value);
  const fields = inc.groups.flatMap((g) => g.items);
  const missing = fields.filter((f) => f.value === null);

  const assignMe = () => {
    updateIncident(inc.id, (x) => ({ ...x, assignee: me.name, status: x.status === 'new' ? 'investigating' : x.status }), 'รับงาน');
    toast('รับงานแล้ว');
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
    updateIncident(inc.id, (x) => ({ ...x, pdf: 'ready' }), 'สร้าง PDF และเข้ารหัสด้วยมือ');
    toast('สร้าง PDF และเข้ารหัสแล้ว');
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
    toast(closed ? `Re-Open แล้ว สถานะ ${label}` : pausing ? 'หยุดนับ SLA ระหว่างรอลูกค้าตอบ' : resuming ? `สถานะ ${label} นับ SLA ต่อ` : `สถานะ ${label}`);
  };

  const reopen = () => goTo('investigating');

  const primary = closed
    ? { label: 'Re-Open', icon: RotateCcw, run: reopen }
    : !inc.assignee
      ? { label: 'รับงาน', icon: UserCheck, run: assignMe }
      : inc.status === 'new' || inc.status === 'investigating'
        ? { label: 'ส่งให้ลูกค้า', icon: Send, run: () => setSheet({ kind: 'send' }) }
        : { label: 'ปิดเคส', icon: CheckCircle2, run: () => setSheet({ kind: 'close' }) };

  const exportCase = () => {
    const count = downloadCsv(`${inc.id}.csv`, [flattenIncident(inc, customer)]);
    toast(`ส่งออก ${inc.id} ครบ ${count} field`);
  };

  const historyTab = { id: 'history' as const, label: 'ประวัติ', count: inc.activity.length };

  return (
    <>
      <Topbar
        scope={false}
        title={
          <span className="crumb">
            <a href="#/queue">คิว Incident</a>
            <span className="muted">/</span>
            <span className="mono">{inc.id}</span>
          </span>
        }
      >
        <div className="pager">
          <button className="icon-btn" aria-label="เคสก่อนหน้า" disabled={!prev} onClick={() => prev && navigate(`/incident/${prev}`)}>
            <ArrowLeft {...ICON} />
          </button>
          <button className="icon-btn" aria-label="เคสถัดไป" disabled={!next} onClick={() => next && navigate(`/incident/${next}`)}>
            <ArrowRight {...ICON} />
          </button>
        </div>
      </Topbar>

      <div className="content">
        <div className="inc">
          <section className="inc-head">
            <TenantStrip customer={customer} department={department?.name} />
            <div className="inc-title-row">
              <h1>{inc.title}</h1>
              <div className="inc-actions">
                {isSoc && (
                  <>
                    <button className="btn" onClick={sync} disabled={syncing}>
                      <RefreshCw {...ICON} className={syncing ? 'spin' : 'muted'} />
                      Sync ข้อมูล
                    </button>
                    <button className="btn" onClick={() => setSheet({ kind: 'isolate', preset: [] })}>
                      <ShieldOff {...ICON} className="muted" />
                      Isolate
                    </button>
                  </>
                )}
                <Popover
                  align="right"
                  width={220}
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
            <div className="inc-meta">
              <SevTag severity={inc.severity} />
              <span className="secondary">{inc.logSource}</span>
              <span className="secondary">ผู้รับผิดชอบ {inc.assignee ?? 'ยังไม่มี'}</span>
              {inc.reopened > 0 && <span className="secondary">Re-Open {inc.reopened} ครั้ง</span>}
              <span className="meta-flow">
                <StatusFlow status={inc.status} onPick={goTo} readOnly={!isSoc} />
              </span>
            </div>
          </section>

          <SlaTimeline inc={inc} customer={customer} now={now} />

          <div className="inc-cols">
            <div className="inc-main">
              <Tabs
                tabs={[
                  { id: 'detail', label: 'รายละเอียด' },
                  { id: 'log', label: 'Log ดิบ' },
                  ...(isSoc ? [historyTab] : []),
                ]}
                value={tab}
                onChange={setTab}
              />

              {tab === 'detail' && (
                <div className="stack">
                  <Analysis inc={inc} />
                  {isSoc && (
                    <DeliveryCard
                      inc={inc}
                      customer={customer}
                      onSend={() => setSheet({ kind: 'send' })}
                      onGenerate={generatePdf}
                    />
                  )}
                  <Fields
                    inc={inc}
                    missing={missing.length}
                    total={fields.length}
                    iocValues={iocValues}
                    canIsolate={isSoc}
                    syncing={syncing}
                    onSync={sync}
                    onIsolate={(value) => setSheet({ kind: 'isolate', preset: [value] })}
                  />
                </div>
              )}

              {tab === 'log' && (
                <div className="stack">
                  <p className="muted">
                    Parse โดย {inc.parsedBy === 'SOAR' ? 'SOAR' : 'ตัวระบบ IM2'}
                  </p>
                  <pre className="raw">{inc.rawLog}</pre>
                </div>
              )}

              {tab === 'history' && (
                <ol className="history">
                  {[...inc.activity].reverse().map((a) => (
                    <li key={a.id}>
                      <span className="mono muted">{fmtDateTime(a.at)}</span>
                      <span className="history-actor">{a.actor}</span>
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Comments inc={inc} />
          </div>
        </div>
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
    </>
  );
}

function StatusFlow({ status, onPick, readOnly }: { status: Status; onPick: (s: Status) => void; readOnly: boolean }) {
  const current = STATUS_ORDER.indexOf(status);
  return (
    <ol className="flow" aria-label="สถานะของเคส">
      {STATUS_ORDER.map((step, i) => (
        <li key={step} className={i < current ? 'is-past' : i === current ? 'is-current' : ''}>
          <button
            disabled={readOnly}
            aria-current={i === current ? 'step' : undefined}
            title={i < current && !readOnly ? `ถอยกลับไป ${STATUS_LABEL[step]}` : undefined}
            onClick={() => onPick(step)}
          >
            {i < current && <Check size={12} strokeWidth={1.5} />}
            {STATUS_LABEL[step]}
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------- SLA timeline: Detect to email is MTTD, email to close is MTTR ---------- */

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

function Segment({
  name,
  span,
  seg,
  targetMin,
  idleText,
  excluded = 0,
}: {
  name: string;
  span: string;
  seg: SegmentState;
  targetMin: number;
  idleText?: string;
  excluded?: number;
}) {
  const over = seg.remaining <= 0;
  return (
    <div className={`seg seg-${seg.state} seg-${seg.level} ${seg.paused ? 'seg-paused' : ''}`}>
      <div className="seg-head">
        <span className="seg-fig">{seg.state === 'idle' ? '--:--' : fmtClock(seg.elapsed)}</span>
        <span className="seg-text">
          <span>
            {name} <span className="muted">{span}</span>
          </span>
          <span className="seg-note">
            {seg.state === 'idle' && <span className="muted">{idleText}</span>}
            {seg.paused && (
              <span className="note-icon">
                <Pause size={12} strokeWidth={1.5} />
                หยุดนับ รอลูกค้าตอบ
              </span>
            )}
            {seg.state === 'running' && !over && <span className="seg-remaining">เหลือ {fmtClock(seg.remaining)}</span>}
            {seg.state !== 'idle' && over && (
              <span className="text-bad note-icon">
                <AlertTriangle size={12} strokeWidth={1.5} />
                เกินเป้า {fmtClock(seg.remaining)}
              </span>
            )}
            {seg.state === 'done' && !over && (
              <span className="text-ok note-icon">
                <Check size={12} strokeWidth={1.5} />
                ทันเวลา
              </span>
            )}
            <span className="muted">เป้า {fmtMinutes(targetMin)}</span>
            {excluded > 0 && <span className="muted">ไม่นับไปแล้ว {fmtClock(excluded)}</span>}
          </span>
        </span>
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

function SlaTimeline({ inc, customer, now }: { inc: Incident; customer: Customer; now: number }) {
  const t = customer.sla[inc.severity];
  const mttd = segmentOf(inc.detectedAt, inc.sentAt, t.mttd * 60000, now, inc.mttdPausedMs);
  const mttr = segmentOf(inc.sentAt, inc.closedAt, t.mttr * 60000, now, inc.pausedMs, inc.pausedAt);
  const stamp = (ts: number | null, empty: string) => (ts ? fmtTime(ts, true) : empty);
  return (
    <section className="sla-card" aria-label="เวลา SLA">
      <div className="sla-segs">
        <Segment name="MTTD" span="Detect ถึงส่งเมล" seg={mttd} targetMin={t.mttd} excluded={inc.mttdPausedMs} />
        <Segment name="MTTR" span="ส่งเมลถึงปิดเคส" seg={mttr} targetMin={t.mttr} idleText="เริ่มนับเมื่อส่งเมล" excluded={pausedTotal(inc, now)} />
      </div>
      <div className="sla-marks">
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

/* ---------- Analysis: from AI, or from the SOP when AI is not answering ---------- */

function Analysis({ inc }: { inc: Incident }) {
  const { role, updateIncident, toast } = useStore();
  const sop = SOPS[inc.kind];
  const aiDown = inc.aiState === 'down' && !inc.sopApplied;

  if (aiDown && role === 'customer') {
    return (
      <section className="card">
        <h3>ผลวิเคราะห์</h3>
        <p className="secondary">SOC กำลังวิเคราะห์เคสนี้</p>
      </section>
    );
  }

  if (aiDown) {
    return (
      <section className="card card-notice">
        <div className="card-title-row">
          <h3>
            <AlertTriangle {...ICON} className="text-warn" />
            AI ไม่ตอบสนองสำหรับเคสนี้
          </h3>
          <button
            className="btn"
            onClick={() => {
              updateIncident(inc.id, (x) => ({ ...x, sopApplied: true }), `เติมผลวิเคราะห์จาก ${sop.id}`);
              toast(`เติมผลวิเคราะห์จาก ${sop.id} แล้ว`);
            }}
          >
            <FileText {...ICON} className="muted" />
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
    <section className="card">
      <div className="card-title-row">
        <h3>ผลวิเคราะห์</h3>
        <span className="muted">{inc.sopApplied ? <>จาก <span className="mono">{sop.id}</span></> : 'จาก AI'}</span>
      </div>
      <p>{sop.analysis}</p>
      <div className="reco">
        <span className="muted">คำแนะนำ</span>
        <p>{sop.recommendation}</p>
      </div>
    </section>
  );
}

function DeliveryCard({ inc, customer, onSend, onGenerate }: { inc: Incident; customer: Customer; onSend: () => void; onGenerate: () => void }) {
  const targets = customer.departments.filter((d) => d.autoSend || d.id === inc.departmentId);
  const rule = ENCRYPTION_RULES.find((r) => r.id === customer.encryption.rule);
  const failed = inc.pdf === 'failed';
  return (
    <section className="card">
      <div className="card-title-row">
        <h3>การส่งให้ลูกค้า</h3>
        {inc.sentAt ? (
          <button className="link" onClick={onSend}>
            ส่งซ้ำ
          </button>
        ) : (
          <span className="muted">ยังไม่ได้ส่ง</span>
        )}
      </div>

      {failed && (
        <div className="alert">
          <AlertTriangle {...ICON} className="text-warn" />
          <span>Flow สร้าง PDF ไม่สำเร็จ ยังไม่ได้ผูก Template ของ {inc.logSource}</span>
          <button className="btn" onClick={onGenerate}>
            <FileLock2 {...ICON} className="muted" />
            สร้าง PDF และเข้ารหัส
          </button>
        </div>
      )}

      {inc.deliveries.length > 0 ? (
        <ul className="deliveries">
          {inc.deliveries.map((d) => (
            <li key={d.at}>
              <FileLock2 {...ICON} className="muted" />
              <div>
                <p>
                  <span className="mono">{d.file}</span>
                  <span className="muted"> {d.encrypted ? 'เข้ารหัสแล้ว' : 'ไม่เข้ารหัส'}{d.manual ? ' · สร้างด้วยมือ' : ''}</span>
                </p>
                <p className="secondary">
                  ถึง {d.recipients.join(', ')}
                </p>
                <p className="muted">
                  {d.by} <span className="mono">{fmtDateTime(d.at)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="kv">
          <dt>จะส่งถึง</dt>
          <dd>{targets.map((d) => d.name).join(', ')}</dd>
          <dt>ไฟล์</dt>
          <dd>
            <span className="mono">{inc.id}.pdf</span>
            <span className="muted"> {customer.encryption.enabled ? `เข้ารหัสตามกติกา ${rule?.label}` : 'ลูกค้านี้ไม่ได้กำหนดการเข้ารหัส'}</span>
          </dd>
        </dl>
      )}
    </section>
  );
}

function Fields({
  inc,
  missing,
  total,
  iocValues,
  canIsolate,
  syncing,
  onSync,
  onIsolate,
}: {
  inc: Incident;
  missing: number;
  total: number;
  iocValues: string[];
  canIsolate: boolean;
  syncing: boolean;
  onSync: () => void;
  onIsolate: (value: string) => void;
}) {
  const { toast } = useStore();
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value);
    toast('คัดลอกแล้ว');
  };

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>ข้อมูลเคส</h3>
        {missing > 0 ? (
          <span className="note-icon">
            <span className="text-warn">ขาด {missing} จาก {total} field</span>
            {canIsolate && (
              <button className="link" onClick={onSync} disabled={syncing}>
                Sync ข้อมูล
              </button>
            )}
          </span>
        ) : (
          <span className="muted">ครบ {total} field</span>
        )}
      </div>
      {inc.groups.map((group) => (
        <div className="field-group" key={group.title}>
          <h4>{group.title}</h4>
          <dl className="fields">
            {group.items.map((f) => {
              const inIoc = f.value !== null && iocValues.includes(f.value);
              const technical = f.ioc || ['violation_id', 'dst_port', 'username', 'risk_score', 'event_count'].includes(f.key);
              /* The values an analyst hunts for stand out, and fields that do not apply step back. */
              const emphasis = f.value === 'ไม่เกี่ยวข้อง' ? 'muted' : f.ioc || f.key === 'username' ? 'is-key' : '';
              return (
                <div className="field" key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.value === null ? (
                      <span className="text-warn">ไม่มีข้อมูล</span>
                    ) : (
                      <>
                        <span className={`field-value ${technical ? 'mono' : ''} ${emphasis}`} title={f.value}>
                          {f.value}
                        </span>
                        <span className="field-tools">
                          <button className="icon-btn icon-sm" aria-label={`คัดลอก ${f.label}`} onClick={() => copy(f.value as string)}>
                            <Copy size={14} strokeWidth={1.5} />
                          </button>
                          {f.ioc && canIsolate && !inIoc && (
                            <button className="link" onClick={() => onIsolate(f.value as string)}>
                              Isolate
                            </button>
                          )}
                        </span>
                        {inIoc && <span className="ioc-mark">ใน IoC</span>}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </section>
  );
}

/* ---------- Comment thread between SOC and customer ---------- */

function Comments({ inc }: { inc: Incident }) {
  const { role, me, updateIncident, toast } = useStore();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'internal'>('reply');
  const [files, setFiles] = useState<Attachment[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const isSoc = role === 'soc';
  const list = isSoc ? inc.comments : inc.comments.filter((c) => !c.internal);
  const count = list.length;

  useEffect(() => {
    const scroller = endRef.current?.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [count]);

  const submit = () => {
    if (!text.trim() && !files.length) return;
    const internal = isSoc && mode === 'internal';
    const fileNote = files.length ? ` แนบ ${files.map((f) => f.name).join(', ')}` : '';
    /* The customer answering ends the wait, otherwise the clock could stay paused forever. */
    const resumes = !isSoc && inc.status === 'waiting';
    updateIncident(
      inc.id,
      (x) => ({
        ...(resumes ? withStatus(x, 'sent') : x),
        comments: [
          ...x.comments,
          { id: `${x.id}-c${x.comments.length}-${Date.now()}`, author: me.name, side: isSoc ? 'soc' : 'customer', internal, at: Date.now(), text: text.trim(), attachments: files },
        ],
      }),
      (internal ? 'บันทึกภายใน SOC' : isSoc ? 'ตอบลูกค้า' : 'ลูกค้าตอบ') + fileNote + (resumes ? ' และนับ SLA ต่อ' : ''),
    );
    setText('');
    setFiles([]);
  };

  return (
    <aside className="thread">
      <header className="thread-head">
        <h3>Comment</h3>
        <span className="muted">{isSoc ? 'คุยกับลูกค้าในเคสนี้' : 'คุยกับทีม SOC'}</span>
      </header>
      <div className="thread-list">
        {list.length === 0 && <p className="muted thread-empty">ยังไม่มี Comment</p>}
        {list.map((c) => (
          <article key={c.id} className={`msg ${c.side === 'customer' ? 'msg-customer' : ''} ${c.internal ? 'msg-internal' : ''}`}>
            <header>
              <span className="msg-author">{c.author}</span>
              <span className="muted">{c.internal ? 'ภายใน SOC' : c.side === 'customer' ? 'ลูกค้า' : 'SOC'}</span>
              <span className="mono muted msg-time">{fmtTime(c.at)}</span>
            </header>
            {c.text && <p>{c.text}</p>}
            {c.attachments.map((a) => (
              <button key={a.name} className="file-chip" onClick={() => toast(`ดาวน์โหลด ${a.name} และบันทึกลงประวัติ`)}>
                <Paperclip size={14} strokeWidth={1.5} />
                {a.name}
                <span className="muted">{a.size}</span>
              </button>
            ))}
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <div className={`composer ${mode === 'internal' && isSoc ? 'is-internal' : ''}`}>
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
        <textarea
          rows={3}
          aria-label="ข้อความ"
          placeholder={mode === 'internal' && isSoc ? 'ลูกค้าจะไม่เห็นข้อความนี้' : 'พิมพ์ข้อความ'}
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
                <Paperclip size={14} strokeWidth={1.5} />
                {f.name}
                <button aria-label={`เอา ${f.name} ออก`} onClick={() => setFiles(files.filter((x) => x.name !== f.name))}>
                  <X size={12} strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-foot">
          <label className="btn btn-ghost">
            <Paperclip {...ICON} />
            แนบไฟล์
            <input
              type="file"
              hidden
              multiple
              accept=".csv,.xls,.xlsx,image/*"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: fileSize(f.size) }));
                setFiles((list) => [...list, ...picked]);
                e.target.value = '';
              }}
            />
          </label>
          <span className="muted composer-hint">CSV, Excel, ภาพ</span>
          <button className="btn" disabled={!text.trim() && !files.length} onClick={submit}>
            ส่ง
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Send: PDF, encrypted per customer, to several departments ---------- */

function SendSheet({ inc, customer, onClose }: { inc: Incident; customer: Customer; onClose: () => void }) {
  const { me, updateIncident, toast } = useStore();
  const [picked, setPicked] = useState(() => customer.departments.filter((d) => d.autoSend || d.id === inc.departmentId).map((d) => d.id));
  const [report, setReport] = useState(() => customer.reportTemplates.find((t) => t.logSource === inc.logSource)?.template ?? 'default');
  const [mail, setMail] = useState<'default' | 'custom'>(customer.emailTemplate);
  const [pdfReady, setPdfReady] = useState(inc.pdf === 'ready');
  const manual = useRef(false);
  const rule = ENCRYPTION_RULES.find((r) => r.id === customer.encryption.rule);
  const fieldOf = (key: string) => inc.groups.flatMap((g) => g.items).find((f) => f.key === key)?.value ?? 'ไม่มีข้อมูล';
  const reportOptions = Array.from(new Set([report, ...REPORT_TEMPLATES]));

  const send = () => {
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
  };

  return (
    <Sheet
      title="ส่งเคสให้ลูกค้า"
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-primary btn-lg" disabled={!picked.length || !pdfReady} onClick={send}>
            <Send {...ICON} />
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
                  <input
                    type="checkbox"
                    checked={picked.includes(d.id)}
                    onChange={() => setPicked((list) => (list.includes(d.id) ? list.filter((v) => v !== d.id) : [...list, d.id]))}
                  />
                  <span className="recipient-text">
                    <span>
                      {d.name} <span className="muted">{d.type}</span>
                    </span>
                    <span className="muted ellipsis">{d.contacts.map((c) => c.email).join(', ')}</span>
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
              <span className="muted">{customer.encryption.enabled ? `เข้ารหัส AES-256 ตามกติกา ${rule?.label}` : 'ลูกค้านี้ไม่ได้กำหนดการเข้ารหัส'}</span>
            </div>
          ) : (
            <div className="alert">
              <AlertTriangle {...ICON} className="text-warn" />
              <span>Flow สร้าง PDF ไม่สำเร็จ ยังไม่ได้ผูก Template</span>
              <button
                className="btn"
                onClick={() => {
                  manual.current = true;
                  setPdfReady(true);
                  updateIncident(inc.id, (x) => ({ ...x, pdf: 'ready' }), `สร้าง PDF และเข้ารหัสด้วยมือ ใช้ ${report}`);
                }}
              >
                <FileLock2 {...ICON} className="muted" />
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
    updateIncident(
      inc.id,
      (x) => ({ ...withStatus(x, 'closed'), closedAt: Date.now() }),
      `ปิดเคส ผล ${outcome}${closeOnSiem ? ` และปิดบน Securonix ด้วย Token ของ ${me.name}` : ''}`,
    );
    toast('ปิดเคสแล้ว');
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
  onConfirm: (items: { type: 'IP' | 'Hash' | 'Host'; value: string }[]) => void;
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
            onClick={() => onConfirm(available.filter((f) => picked.includes(f.value as string)).map((f) => ({ type: f.ioc as 'IP' | 'Hash' | 'Host', value: f.value as string })))}
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
      <p className="secondary sheet-note">ค่าที่เลือกจะถูกส่งไปเก็บใน IoC ของลูกค้ารายนี้ และบันทึกลงประวัติเคส</p>
      <ul className="recipients">
        {candidates.map((f) => {
          const value = f.value as string;
          const done = existing.includes(value);
          return (
            <li key={f.key}>
              <label>
                <input
                  type="checkbox"
                  disabled={done}
                  checked={done || picked.includes(value)}
                  onChange={() => setPicked((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]))}
                />
                <span className="recipient-text">
                  <span>
                    {f.label} <span className="muted">{f.ioc}{done ? ' · อยู่ใน IoC แล้ว' : ''}</span>
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
