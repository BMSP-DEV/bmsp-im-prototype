import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Columns3, Download, FileUp, ListFilter, Plus, X } from 'lucide-react';
import {
  downloadCsv,
  flattenIncident,
  fmtDetected,
  hasOpenLayer,
  isTyping,
  navigate,
  setQueueOrder,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  slaOf,
  STATUS_LABEL,
  STATUS_ORDER,
  useMemory,
  useNow,
  useStored,
} from '../lib';
import { ANALYSTS, CUSTOMERS, INCIDENTS, LOG_SOURCES } from '../mock';
import { Topbar } from '../shell';
import { useStore } from '../store';
import { Field, ICON, Keycap, MultiMenu, Person, Popover, SevTag, Sheet, SlaBar, StatusTag, Tabs, TenantCell } from '../ui';
import type { Customer, Incident, Severity } from '../types';
import type { SlaState } from '../lib';

type View = 'open' | 'mine' | 'unassigned' | 'risk' | 'waiting' | 'closed';
type SortKey = 'sla' | 'severity' | 'detected';

interface Condition {
  field: string;
  op: 'contains' | 'equals' | 'not' | 'starts';
  value: string;
}

const OPS: { id: Condition['op']; label: string }[] = [
  { id: 'contains', label: 'มีคำว่า' },
  { id: 'equals', label: 'เท่ากับ' },
  { id: 'not', label: 'ไม่เท่ากับ' },
  { id: 'starts', label: 'ขึ้นต้นด้วย' },
];

interface Column {
  key: string;
  label: string;
  soc?: boolean;
  sort?: SortKey;
  optional?: boolean;
  /* Shown on the second line of another cell instead of as its own column. */
  sub?: boolean;
  className?: string;
  render: (inc: Incident, customer: Customer, now: number, claim: (id: string) => void, columns: string[]) => ReactNode;
}

const fieldValue = (inc: Incident, key: string) =>
  inc.groups.flatMap((g) => g.items).find((i) => i.key === key)?.value ?? '';

const COLUMNS: Column[] = [
  { key: 'sla', label: 'SLA เหลือ', sort: 'sla', render: (inc, c, now) => <SlaBar inc={inc} customer={c} now={now} /> },
  { key: 'severity', label: 'ระดับ', sort: 'severity', render: (inc) => <SevTag severity={inc.severity} /> },
  {
    key: 'customer',
    label: 'ลูกค้า',
    soc: true,
    className: 'col-customer',
    render: (inc, c, _n, _claim, columns) => (
      <TenantCell customer={c} sub={columns.includes('department') ? c.departments.find((d) => d.id === inc.departmentId)?.name : undefined} />
    ),
  },
  { key: 'department', label: 'หน่วยงาน', sub: true, render: () => null },
  {
    key: 'title',
    label: 'เรื่อง',
    className: 'cell-title',
    render: (inc, _c, _n, _claim, columns) => (
      <span className="two-line">
        <span className="ellipsis title-text">{inc.title}</span>
        <span className="cell-sub ellipsis">
          {columns.includes('id') && <span className="mono">{inc.id}</span>}
          {columns.includes('source') && <span>{inc.logSource}</span>}
        </span>
      </span>
    ),
  },
  { key: 'id', label: 'Incident', sub: true, render: () => null },
  { key: 'source', label: 'Log source', sub: true, render: () => null },
  { key: 'partner', label: 'Partner', optional: true, render: (_inc, c) => <span className="secondary">{c.partner}</span> },
  { key: 'src_ip', label: 'Source IP', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'src_ip')}</span> },
  { key: 'hostname', label: 'Hostname', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'hostname')}</span> },
  { key: 'username', label: 'Username', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'username')}</span> },
  { key: 'status', label: 'สถานะ', render: (inc) => <StatusTag status={inc.status} /> },
  {
    key: 'assignee',
    label: 'ผู้รับผิดชอบ',
    soc: true,
    className: 'col-assignee',
    render: (inc, _c, _n, claim) =>
      inc.assignee ? (
        <Person name={inc.assignee} />
      ) : (
        <button
          className="btn-claim"
          onClick={(e) => {
            e.stopPropagation();
            claim(inc.id);
          }}
        >
          รับงาน
        </button>
      ),
  },
  {
    key: 'detected',
    label: 'Detect',
    sort: 'detected',
    className: 'col-detected cell-right',
    render: (inc, _c, now) => <span className="mono muted">{fmtDetected(inc.detectedAt, now)}</span>,
  },
];

const DEFAULT_COLUMNS = COLUMNS.filter((c) => !c.optional).map((c) => c.key);

/* The queue reads top to bottom as these bands. A paused clock is not urgent, so it comes last. */
const SLA_GROUPS = [
  { label: 'เกิน SLA', tone: 'bad' },
  { label: 'ใกล้หมด', tone: 'warn' },
  { label: 'อยู่ในเวลา', tone: 'ok' },
  { label: 'หยุดนับ รอลูกค้าตอบ', tone: 'paused' },
];

function slaGroup(s: SlaState): number {
  if (s.level === 'bad') return 0;
  if (s.paused) return 3;
  return s.level === 'warn' ? 1 : 2;
}

/* Every stored field can be filtered on, not just the ones shown in the table. */
const FIELD_CATALOG = [
  ...INCIDENTS[0].groups.flatMap((g) => g.items.map((i) => ({ key: i.key, label: i.label }))),
  { key: 'parsed_by', label: 'Parse โดย' },
];

function matches(inc: Incident, c: Condition) {
  const raw = c.field === 'parsed_by' ? inc.parsedBy : fieldValue(inc, c.field);
  const value = raw.toLowerCase();
  const target = c.value.toLowerCase();
  if (c.op === 'equals') return value === target;
  if (c.op === 'not') return value !== target;
  if (c.op === 'starts') return value.startsWith(target);
  return value.includes(target);
}

export function QueuePage() {
  const { visible, customerOf, role, me, query, updateIncident, toast } = useStore();
  const now = useNow(1000);
  const [view, setView] = useMemory<View>('queue:view', 'open');
  const [sev, setSev] = useMemory<string[]>('queue:sev', []);
  const [statuses, setStatuses] = useMemory<string[]>('queue:status', []);
  const [sources, setSources] = useMemory<string[]>('queue:source', []);
  const [assignees, setAssignees] = useMemory<string[]>('queue:assignee', []);
  const [conditions, setConditions] = useMemory<Condition[]>('queue:conditions', []);
  const [sort, setSort] = useMemory<{ key: SortKey; dir: 1 | -1 }>('queue:sort', { key: 'sla', dir: 1 });
  const [columns, setColumns] = useStored<string[]>(`queue-columns:${role}`, DEFAULT_COLUMNS);
  const [picked, setPicked] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [adding, setAdding] = useState(false);
  const keyboardMoved = useRef(false);

  const isRisk = (inc: Incident) => {
    const level = slaOf(inc, customerOf(inc.customerId), now).level;
    return level === 'warn' || level === 'bad';
  };

  const viewTest: Record<View, (inc: Incident) => boolean> = {
    open: (i) => i.status !== 'closed',
    mine: (i) => i.status !== 'closed' && i.assignee === me.name,
    unassigned: (i) => i.status !== 'closed' && !i.assignee,
    risk: (i) => i.status !== 'closed' && isRisk(i),
    waiting: (i) => i.status === 'waiting',
    closed: (i) => i.status === 'closed',
  };

  const q = query.trim().toLowerCase();
  const rows = visible
    .filter(viewTest[view])
    .filter((i) => !sev.length || sev.includes(i.severity))
    .filter((i) => !statuses.length || statuses.includes(i.status))
    .filter((i) => !sources.length || sources.includes(i.logSource))
    .filter((i) => !assignees.length || assignees.includes(i.assignee ?? 'none'))
    .filter((i) => conditions.every((c) => matches(i, c)))
    .filter((i) => {
      if (!q) return true;
      const c = customerOf(i.customerId);
      const hay = [i.id, i.title, c.code, c.name, ...i.groups.flatMap((g) => g.items.map((f) => f.value ?? ''))].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      const rank = (inc: Incident) => {
        if (sort.key === 'sla') {
          const s = slaOf(inc, customerOf(inc.customerId), now);
          return slaGroup(s) * 1e14 + s.remaining;
        }
        if (sort.key === 'severity') return SEVERITY_ORDER.indexOf(inc.severity);
        return -inc.detectedAt;
      };
      return (rank(a) - rank(b)) * sort.dir;
    });

  const order = rows.map((r) => r.id).join('|');
  useEffect(() => {
    setQueueOrder(order ? order.split('|') : []);
  }, [order]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyJ' || e.code === 'KeyK') keyboardMoved.current = true;
      if (e.code === 'KeyJ') setCursor((c) => Math.min(c + 1, rows.length - 1));
      if (e.code === 'KeyK') setCursor((c) => Math.max(c - 1, 0));
      if (e.key === 'Enter' && rows[cursor]) navigate(`/incident/${rows[cursor].id}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, cursor]);

  /* Only the keyboard scrolls the list. Hovering a row must never move it under the pointer. */
  useEffect(() => {
    if (!keyboardMoved.current) return;
    keyboardMoved.current = false;
    document.querySelector('tr.is-cursor')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const shownColumns = COLUMNS.filter((c) => !c.sub && columns.includes(c.key) && (role === 'soc' || !c.soc));
  const rowGroups = rows.map((inc) => slaGroup(slaOf(inc, customerOf(inc.customerId), now)));
  const showGroups = sort.key === 'sla' && sort.dir === 1 && view !== 'closed' && new Set(rowGroups).size > 1;

  const claim = (id: string) => {
    updateIncident(id, (inc) => ({ ...inc, assignee: me.name, status: inc.status === 'new' ? 'investigating' : inc.status }), 'รับงาน');
    toast('รับงานแล้ว');
  };

  const exportRows = (list: Incident[]) => {
    const fields = downloadCsv(`im2-incidents-${list.length}.csv`, list.map((i) => flattenIncident(i, customerOf(i.customerId))));
    toast(`ส่งออก ${list.length} เคส ครบ ${fields} field`);
  };

  const count = (v: View) => visible.filter(viewTest[v]).length;
  const views: { id: View; label: string; count: number }[] = (
    role === 'soc'
      ? ([
          ['open', 'เปิดอยู่ทั้งหมด'],
          ['mine', 'งานของฉัน'],
          ['unassigned', 'ยังไม่มีผู้รับ'],
          ['risk', 'ใกล้หมด SLA'],
          ['waiting', 'รอลูกค้าตอบ'],
          ['closed', 'ปิดแล้ว'],
        ] as [View, string][])
      : ([
          ['open', 'เปิดอยู่ทั้งหมด'],
          ['waiting', 'รอคุณตอบ'],
          ['closed', 'ปิดแล้ว'],
        ] as [View, string][])
  ).map(([id, label]) => ({ id, label, count: count(id) }));

  const clearFilters = () => {
    setSev([]);
    setStatuses([]);
    setSources([]);
    setAssignees([]);
    setConditions([]);
  };
  const filtered = sev.length + statuses.length + sources.length + assignees.length + conditions.length > 0;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));

  return (
    <>
      <Topbar title="คิว Incident" />
      <div className="queue">
        <div className="queue-views">
          <Tabs tabs={views} value={view} onChange={(v) => { setView(v); setCursor(0); setPicked([]); }} />
        </div>

        <div className="toolbar">
          {picked.length > 0 ? (
            <div className="toolbar-left">
              <span className="picked">เลือก {picked.length} เคส</span>
              {role === 'soc' && (
                <button
                  className="btn"
                  onClick={() => {
                    picked.forEach((id) => updateIncident(id, (inc) => ({ ...inc, assignee: me.name, status: inc.status === 'new' ? 'investigating' : inc.status }), 'รับงาน'));
                    toast(`รับงาน ${picked.length} เคสแล้ว`);
                    setPicked([]);
                  }}
                >
                  รับงานทั้งหมด
                </button>
              )}
              <button className="btn" onClick={() => exportRows(rows.filter((r) => picked.includes(r.id)))}>
                <Download {...ICON} className="muted" />
                Export
              </button>
              <button className="btn btn-ghost" onClick={() => setPicked([])}>
                ล้าง
              </button>
            </div>
          ) : (
            <div className="toolbar-left">
              <MultiMenu
                label="ความรุนแรง"
                selected={sev}
                onChange={setSev}
                options={SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))}
              />
              <MultiMenu
                label="สถานะ"
                selected={statuses}
                onChange={setStatuses}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              />
              <MultiMenu label="Log source" selected={sources} onChange={setSources} options={LOG_SOURCES.map((s) => ({ value: s, label: s }))} />
              {role === 'soc' && (
                <MultiMenu
                  label="ผู้รับผิดชอบ"
                  selected={assignees}
                  onChange={setAssignees}
                  options={[{ value: 'none', label: 'ยังไม่มีผู้รับ' }, ...ANALYSTS.map((a) => ({ value: a, label: a }))]}
                />
              )}
              <DeepFilter conditions={conditions} onApply={setConditions} />
            </div>
          )}

          <div className="toolbar-right">
            <ColumnMenu columns={columns} setColumns={setColumns} />
            <button className="btn" onClick={() => exportRows(rows)}>
              <Download {...ICON} className="muted" />
              Export
            </button>
            {role === 'soc' && (
              <button className="btn" onClick={() => setAdding(true)}>
                <Plus {...ICON} className="muted" />
                เพิ่ม Incident
              </button>
            )}
          </div>
        </div>

        {conditions.length > 0 && (
          <div className="chips">
            {conditions.map((c, i) => (
              <span className="chip" key={`${c.field}-${i}`}>
                <span className="muted">{FIELD_CATALOG.find((f) => f.key === c.field)?.label}</span>
                <span className="muted">{OPS.find((o) => o.id === c.op)?.label}</span>
                <span className="mono">{c.value}</span>
                <button aria-label="เอาเงื่อนไขนี้ออก" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}>
                  <X size={12} strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="table-wrap">
          <table className="tbl tbl-queue">
            <thead>
              <tr>
                <th className="cell-check">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))}
                  />
                </th>
                {shownColumns.map((col) => (
                  <th key={col.key} className={col.className} aria-sort={sort.key === col.sort ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {col.sort ? (
                      <button className="th-sort" onClick={() => toggleSort(col.sort as SortKey)}>
                        {col.label}
                        {sort.key === col.sort && (sort.dir === 1 ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />)}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((inc, index) => {
                const customer = customerOf(inc.customerId);
                const group = rowGroups[index];
                return (
                  <Fragment key={inc.id}>
                  {showGroups && group !== rowGroups[index - 1] && (
                    <tr className={`group-row group-${SLA_GROUPS[group].tone}`}>
                      <td colSpan={shownColumns.length + 1}>
                        {SLA_GROUPS[group].label}
                        <span className="num">{rowGroups.filter((g) => g === group).length}</span>
                      </td>
                    </tr>
                  )}
                  <tr className={index === cursor ? 'is-cursor' : ''} onClick={() => navigate(`/incident/${inc.id}`)} onMouseEnter={() => setCursor(index)}>
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`เลือก ${inc.id}`}
                        checked={picked.includes(inc.id)}
                        onChange={() => setPicked((list) => (list.includes(inc.id) ? list.filter((v) => v !== inc.id) : [...list, inc.id]))}
                      />
                    </td>
                    {shownColumns.map((col) => (
                      <td key={col.key} className={col.className}>
                        {col.render(inc, customer, now, claim, columns)}
                      </td>
                    ))}
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty">
              <p>ไม่มีเคสตามเงื่อนไขนี้</p>
              {filtered && (
                <button className="link" onClick={clearFilters}>
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="queue-foot">
          <span className="muted">
            <span className="num">{rows.length}</span> เคส
            {sort.key === 'sla' && sort.dir === 1 ? ' เรียงจากเร่งด่วนที่สุด' : ''}
          </span>
          <span className="hints">
            <span><Keycap>J</Keycap><Keycap>K</Keycap> เลื่อน</span>
            <span><Keycap>Enter</Keycap> เปิดเคส</span>
            <span><Keycap>/</Keycap> ค้นหา</span>
          </span>
        </footer>
      </div>
      {adding && <AddIncidentSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function ColumnMenu({ columns, setColumns }: { columns: string[]; setColumns: (c: string[]) => void }) {
  const { role } = useStore();
  const toggleable = COLUMNS.filter((c) => (role === 'soc' || !c.soc) && c.key !== 'sla' && c.key !== 'title');
  return (
    <Popover
      align="right"
      width={240}
      trigger={(open, flip) => (
        <button className="btn" aria-expanded={open} onClick={flip}>
          <Columns3 {...ICON} className="muted" />
          คอลัมน์
        </button>
      )}
    >
      <ul className="menu">
        {toggleable.map((c) => (
          <li key={c.key}>
            <label className="menu-row">
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                onChange={() => setColumns(columns.includes(c.key) ? columns.filter((k) => k !== c.key) : [...columns, c.key])}
              />
              <span className="menu-label">{c.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="menu-foot spread">
        <span className="muted">จำแยกตามผู้ใช้</span>
        <button className="link" onClick={() => setColumns(DEFAULT_COLUMNS)}>
          ค่าเริ่มต้น
        </button>
      </div>
    </Popover>
  );
}

function DeepFilter({ conditions, onApply }: { conditions: Condition[]; onApply: (c: Condition[]) => void }) {
  const blank: Condition = { field: 'src_ip', op: 'contains', value: '' };
  return (
    <Popover
      width={560}
      trigger={(open, flip) => (
        <button className={`btn btn-filter ${conditions.length ? 'is-active' : ''}`} aria-expanded={open} onClick={flip}>
          <ListFilter {...ICON} className="muted" />
          ตัวกรองเชิงลึก
          {conditions.length > 0 && <span className="num">{conditions.length}</span>}
        </button>
      )}
    >
      {(close) => <DeepFilterForm initial={conditions.length ? conditions : [blank]} blank={blank} onApply={(c) => { onApply(c); close(); }} />}
    </Popover>
  );
}

function DeepFilterForm({ initial, blank, onApply }: { initial: Condition[]; blank: Condition; onApply: (c: Condition[]) => void }) {
  const [rows, setRows] = useState(initial);
  const set = (i: number, patch: Partial<Condition>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="deep">
      <p className="muted deep-note">ค้นได้ทุก field ที่เก็บในฐานข้อมูล ทุกเงื่อนไขต้องตรงพร้อมกัน</p>
      {rows.map((row, i) => (
        <div className="deep-row" key={i}>
          <select className="input" aria-label="Field" value={row.field} onChange={(e) => set(i, { field: e.target.value })}>
            {FIELD_CATALOG.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <select className="input" aria-label="เงื่อนไข" value={row.op} onChange={(e) => set(i, { op: e.target.value as Condition['op'] })}>
            {OPS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input className="input mono" aria-label="ค่า" value={row.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="ค่า" />
          <button className="icon-btn" aria-label="ลบเงื่อนไข" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <X {...ICON} />
          </button>
        </div>
      ))}
      <div className="deep-foot">
        <button className="link" onClick={() => setRows([...rows, blank])}>
          เพิ่มเงื่อนไข
        </button>
        <button className="btn btn-primary" onClick={() => onApply(rows.filter((r) => r.value.trim()))}>
          ใช้ตัวกรอง
        </button>
      </div>
    </div>
  );
}

function AddIncidentSheet({ onClose }: { onClose: () => void }) {
  const { customers, addIncidents, me, toast } = useStore();
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('high');
  const [source, setSource] = useState(LOG_SOURCES[0]);
  const [srcIp, setSrcIp] = useState('');
  const [hostname, setHostname] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const customer = customers.find((c) => c.id === customerId) as Customer;
  const [departmentId, setDepartmentId] = useState(customer.departments[0].id);

  const makeIncident = (name: string, sev: Severity, offset: number, cust: Customer, dept: string): Incident => {
    const template = INCIDENTS[0];
    const at = Date.now() - offset;
    const id = `INC-26-${String(4900 + Math.floor(Math.random() * 90)).padStart(5, '0')}`;
    return {
      ...template,
      id,
      customerId: cust.id,
      departmentId: dept,
      title: name,
      severity: sev,
      status: 'new',
      assignee: null,
      logSource: source,
      detectedAt: at,
      sentAt: null,
      closedAt: null,
      reopened: 0,
      pdf: 'ready',
      groups: template.groups.map((g) => ({
        ...g,
        items: g.items.map((f) => {
          if (f.key === 'rule_name') return { ...f, value: name };
          if (f.key === 'log_source') return { ...f, value: source };
          if (f.key === 'src_ip') return { ...f, value: srcIp || null };
          if (f.key === 'hostname') return { ...f, value: hostname || null };
          return { ...f, value: null };
        }),
      })),
      syncable: {},
      comments: [],
      deliveries: [],
      activity: [{ id: `${id}-a0`, at, actor: me.name, text: mode === 'manual' ? 'เพิ่มเคสด้วยมือ' : `นำเข้าจากไฟล์ ${file}` }],
    };
  };

  const submitManual = () => {
    const inc = makeIncident(title.trim(), severity, 0, customer, departmentId);
    addIncidents([inc]);
    toast(`เพิ่ม ${inc.id} แล้ว`);
    onClose();
    navigate(`/incident/${inc.id}`);
  };

  const submitImport = () => {
    addIncidents([
      makeIncident('Imported: Suspicious login from partner network', 'medium', 240000, customers[0], customers[0].departments[0].id),
      makeIncident('Imported: Blocked malware download', 'low', 480000, customers[3], customers[3].departments[0].id),
    ]);
    toast('นำเข้า 2 เคสแล้ว');
    onClose();
  };

  return (
    <Sheet
      title="เพิ่ม Incident"
      onClose={onClose}
      footer={
        mode === 'manual' ? (
          <button className="btn btn-primary btn-lg" disabled={!title.trim()} onClick={submitManual}>
            สร้างเคส
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" disabled={!file} onClick={submitImport}>
            นำเข้า 2 เคส
          </button>
        )
      }
    >
      <Tabs
        tabs={[
          { id: 'manual', label: 'กรอกเอง' },
          { id: 'import', label: 'นำเข้าไฟล์' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'manual' ? (
        <div className="form">
          <div className="form-2">
            <Field label="ลูกค้า">
              <select
                className="input"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setDepartmentId((customers.find((c) => c.id === e.target.value) as Customer).departments[0].id);
                }}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="หน่วยงาน">
              <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {customer.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="เรื่อง">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <div className="form-2">
            <Field label="ความรุนแรง">
              <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                {SEVERITY_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Log source">
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                {LOG_SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-2">
            <Field label="Source IP">
              <input className="input mono" value={srcIp} onChange={(e) => setSrcIp(e.target.value)} />
            </Field>
            <Field label="Hostname">
              <input className="input mono" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : (
        <div className="form">
          <label className="drop">
            <FileUp {...ICON} className="muted" />
            {file ?? 'เลือกไฟล์ CSV หรือ Excel'}
            <input type="file" accept=".csv,.xls,.xlsx" hidden onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
          </label>
          {file && (
            <div className="import-check">
              <p>
                ตรวจไฟล์แล้ว นำเข้าได้ <span className="num">2</span> จาก <span className="num">3</span> แถว
              </p>
              <table className="tbl tbl-plain">
                <thead>
                  <tr>
                    <th>แถว</th>
                    <th>ลูกค้า</th>
                    <th>เรื่อง</th>
                    <th>ผล</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">2</td>
                    <td className="mono">{CUSTOMERS[0].code}</td>
                    <td>Suspicious login from partner network</td>
                    <td>พร้อมนำเข้า</td>
                  </tr>
                  <tr>
                    <td className="mono">3</td>
                    <td className="mono">{CUSTOMERS[3].code}</td>
                    <td>Blocked malware download</td>
                    <td>พร้อมนำเข้า</td>
                  </tr>
                  <tr>
                    <td className="mono">4</td>
                    <td className="mono text-bad">ไม่พบ</td>
                    <td>Unknown source alert</td>
                    <td className="text-bad">ไม่พบรหัสลูกค้า</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
