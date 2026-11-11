import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Columns3, Download, FileUp, ListFilter, Maximize2, Minimize2, Plus, Search, X } from 'lucide-react';
import {
  downloadCsv,
  flattenIncident,
  fmtDetected,
  fmtMinutes,
  hasOpenLayer,
  isTyping,
  lettersOff,
  navigate,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SLA_BANDS,
  slaBand,
  slaOf,
  STATUS_LABEL,
  STATUS_ORDER,
  useMemory,
  useNow,
  useStored,
} from '../lib';
import { ANALYSTS, CUSTOMER_VIEW_ID, CUSTOMERS, INCIDENTS, LOG_SOURCES, trendFor, weeklyCounts, type WeekPoint } from '../mock';
import { useStore } from '../store';
import { EmptyState, Field, ICON, ICON_SM, IconTile, MultiMenu, Person, Popover, SEV_TONE, SevTag, Sheet, SlaCell, StatusTag, Tabs, TenantCell } from '../ui';
import { CountUp, HeroAmbient, SlaRunway } from '../viz';
import type { Customer, Incident, Severity } from '../types';

type View = 'all' | 'open' | 'waiting' | 'closed';
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

const fieldValue = (inc: Incident, key: string) => inc.groups.flatMap((g) => g.items).find((i) => i.key === key)?.value ?? '';

const COLUMNS: Column[] = [
  {
    key: 'title',
    label: 'เคส',
    className: 'cell-title',
    render: (inc, _c, _n, _claim, columns) => (
      <span className="inc-cell">
        <IconTile tone={inc.status === 'closed' ? 'gray' : SEV_TONE[inc.severity]}>
          <AlertTriangle {...ICON} />
        </IconTile>
        <span className="two-line">
          <span className="inc-title">
            <a className="ellipsis title-text row-link" href={`#/case/${inc.id}`} title={inc.title} onClick={(e) => e.stopPropagation()}>
              {inc.title}
            </a>
            {columns.includes('id') && <span className="mono sub">{inc.id}</span>}
          </span>
          {columns.includes('source') && <span className="sub ellipsis">{inc.logSource}</span>}
        </span>
      </span>
    ),
  },
  { key: 'id', label: 'Incident', sub: true, render: () => null },
  { key: 'source', label: 'Log source', sub: true, render: () => null },
  {
    key: 'customer',
    label: 'ลูกค้า',
    soc: true,
    className: 'col-customer',
    render: (inc, c, _n, _claim, columns) => <TenantCell customer={c} sub={columns.includes('department') ? c.departments.find((d) => d.id === inc.departmentId)?.name : undefined} />,
  },
  { key: 'department', label: 'หน่วยงาน', sub: true, render: () => null },
  { key: 'severity', label: 'ระดับ', sort: 'severity', render: (inc) => <SevTag severity={inc.severity} /> },
  { key: 'status', label: 'สถานะ', className: 'col-status', render: (inc) => <StatusTag status={inc.status} /> },
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
  { key: 'partner', label: 'Partner', optional: true, render: (_inc, c) => <span className="secondary">{c.partner}</span> },
  { key: 'src_ip', label: 'Source IP', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'src_ip')}</span> },
  { key: 'hostname', label: 'Hostname', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'hostname')}</span> },
  { key: 'username', label: 'Username', optional: true, render: (inc) => <span className="mono">{fieldValue(inc, 'username')}</span> },
  { key: 'sla', label: 'SLA เหลือ', sort: 'sla', render: (inc, c, now) => <SlaCell inc={inc} customer={c} now={now} /> },
  { key: 'detected', label: 'Detect', sort: 'detected', className: 'col-detected', render: (inc, _c, now) => <span className="mono muted">{fmtDetected(inc.detectedAt, now)}</span> },
];

const DEFAULT_COLUMNS = COLUMNS.filter((c) => !c.optional).map((c) => c.key);

/* Every stored field can be filtered on, not just the ones shown in the table. */
const FIELD_CATALOG = [...INCIDENTS[0].groups.flatMap((g) => g.items.map((i) => ({ key: i.key, label: i.label }))), { key: 'parsed_by', label: 'Parse โดย' }];

function matches(inc: Incident, c: Condition) {
  const raw = c.field === 'parsed_by' ? inc.parsedBy : fieldValue(inc, c.field);
  const value = raw.toLowerCase();
  const target = c.value.toLowerCase();
  if (c.op === 'equals') return value === target;
  if (c.op === 'not') return value !== target;
  if (c.op === 'starts') return value.startsWith(target);
  return value.includes(target);
}

function WeekBars({ points }: { points: WeekPoint[] }) {
  const total = (p: WeekPoint) => SEVERITY_ORDER.reduce((sum, s) => sum + p.counts[s], 0);
  const max = Math.max(...points.map(total));
  return (
    <div className="weekbars" role="img" aria-label={`จำนวนเคสต่อสัปดาห์ ${points.length} สัปดาห์ ล่าสุด ${total(points[points.length - 1])} เคส`}>
      {points.map((p) => (
        <div className="weekbar" key={p.label} title={`สัปดาห์ ${p.label}: ${SEVERITY_ORDER.map((s) => `${SEVERITY_LABEL[s]} ${p.counts[s]}`).join(', ')}`} style={{ height: `${(total(p) / max) * 100}%` }}>
          {SEVERITY_ORDER.map((s) => (
            <i key={s} className={`sev-${s}`} style={{ flexGrow: p.counts[s] }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CasesPage() {
  const { visible, customers, customerOf, role, me, scope, updateIncident, toast, flashId } = useStore();
  const now = useNow(1000);
  const [view, setView] = useMemory<View>('cases:view', 'all');
  const [text, setText] = useMemory('cases:text', '');
  const [customerIds, setCustomerIds] = useMemory<string[]>('cases:customers', []);
  const [sev, setSev] = useMemory<string[]>('cases:sev', []);
  const [statuses, setStatuses] = useMemory<string[]>('cases:status', []);
  const [sources, setSources] = useMemory<string[]>('cases:source', []);
  const [assignees, setAssignees] = useMemory<string[]>('cases:assignee', []);
  const [conditions, setConditions] = useMemory<Condition[]>('cases:conditions', []);
  const [sort, setSort] = useMemory<{ key: SortKey; dir: 1 | -1 }>('cases:sort', { key: 'sla', dir: 1 });
  const [columns, setColumns] = useStored<string[]>(`case-columns-v3:${role}`, DEFAULT_COLUMNS);
  const [compact, setCompact] = useStored('cases-hero-compact', false);
  const [picked, setPicked] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const keyboardMoved = useRef(false);

  const isSoc = role === 'soc';
  const q = text.trim().toLowerCase();
  const ids = isSoc ? scope ?? customers.map((c) => c.id) : [CUSTOMER_VIEW_ID];
  const idsKey = ids.join(',');
  const weeks = useMemo(() => weeklyCounts(ids), [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mttr = useMemo(() => {
    const points = trendFor(ids, 14);
    return points.reduce((sum, p) => sum + p.mttr, 0) / points.length;
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewTest: Record<View, (i: Incident) => boolean> = {
    all: () => true,
    open: (i) => i.status !== 'closed',
    waiting: (i) => i.status === 'waiting',
    closed: (i) => i.status === 'closed',
  };

  const open = visible.filter(viewTest.open);
  const levels = open.map((i) => slaOf(i, customerOf(i.customerId), now).level);
  const breached = levels.filter((l) => l === 'bad').length;
  const near = levels.filter((l) => l === 'warn').length;

  const rows = visible
    .filter(viewTest[view])
    .filter((i) => !customerIds.length || customerIds.includes(i.customerId))
    .filter((i) => !sev.length || sev.includes(i.severity))
    .filter((i) => !statuses.length || statuses.includes(i.status))
    .filter((i) => !sources.length || sources.includes(i.logSource))
    .filter((i) => !assignees.length || assignees.includes(i.assignee ?? 'none'))
    .filter((i) => conditions.every((c) => matches(i, c)))
    .filter((i) => {
      if (!q) return true;
      const c = customerOf(i.customerId);
      return [i.id, i.title, c.code, c.name, ...i.groups.flatMap((g) => g.items.map((f) => f.value ?? ''))].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const rank = (inc: Incident) => {
        if (sort.key === 'sla') {
          const s = slaOf(inc, customerOf(inc.customerId), now);
          return inc.closedAt ? 9e14 - inc.closedAt / 1e4 : slaBand(s) * 1e14 + s.remaining;
        }
        if (sort.key === 'severity') return SEVERITY_ORDER.indexOf(inc.severity);
        return -inc.detectedAt;
      };
      return (rank(a) - rank(b)) * sort.dir;
    });

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || hasOpenLayer() || e.ctrlKey || e.metaKey || e.altKey) return;
      const letters = !lettersOff();
      if (letters && (e.code === 'KeyJ' || e.code === 'KeyK')) keyboardMoved.current = true;
      if (letters && e.code === 'KeyJ') setCursor((c) => Math.min(c + 1, rows.length - 1));
      if (letters && e.code === 'KeyK') setCursor((c) => Math.max(c - 1, 0));
      /* A focused button or link handles its own Enter; the shortcut is only for the row under the cursor. */
      const onControl = (e.target as HTMLElement | null)?.closest('a, button, [role="button"], [role="tab"], [role="switch"]');
      if (e.key === 'Enter' && rows[cursor] && !onControl) navigate(`/case/${rows[cursor].id}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, cursor]);

  useEffect(() => {
    if (!keyboardMoved.current) return;
    keyboardMoved.current = false;
    document.querySelector('tr.is-cursor')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const shownColumns = COLUMNS.filter((c) => !c.sub && columns.includes(c.key) && (isSoc || !c.soc));
  const rowBands = rows.map((inc) => (inc.closedAt ? -1 : slaBand(slaOf(inc, customerOf(inc.customerId), now))));
  const showBands = sort.key === 'sla' && sort.dir === 1 && new Set(rowBands).size > 1;

  const claim = (id: string) => {
    const before = rows.find((r) => r.id === id);
    updateIncident(id, (inc) => ({ ...inc, assignee: me.name, status: inc.status === 'new' ? 'investigating' : inc.status }), 'รับงาน');
    toast('รับงานแล้ว', before ? () => updateIncident(id, () => before) : undefined);
  };

  const exportRows = (list: Incident[]) => {
    const fields = downloadCsv(`im2-incidents-${list.length}.csv`, list.map((i) => flattenIncident(i, customerOf(i.customerId))));
    toast(`ส่งออก ${list.length} เคส ครบ ${fields} field`);
  };

  const clearFilters = () => {
    setCustomerIds([]);
    setSev([]);
    setStatuses([]);
    setSources([]);
    setAssignees([]);
    setConditions([]);
    setText('');
  };
  const filterCount = customerIds.length + sev.length + statuses.length + sources.length + assignees.length + conditions.length;
  const filtered = filterCount > 0 || q !== '';
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const countBy = (s: Severity) => open.filter((i) => i.severity === s).length;

  return (
    <div className="page page-cases">
      <header className="hero">
        <h1>เคส</h1>
        <div className="page-tools">
          <button className="btn btn-lg" aria-pressed={compact} onClick={() => setCompact(!compact)}>
            {compact ? <Maximize2 {...ICON} className="muted" /> : <Minimize2 {...ICON} className="muted" />}
            {compact ? 'ขยายภาพรวม' : 'ย่อภาพรวม'}
          </button>
          {isSoc && (
            <button className="btn btn-primary btn-lg" onClick={() => setAdding(true)}>
              <Plus {...ICON} />
              เพิ่ม Incident
            </button>
          )}
        </div>
      </header>

      <section className={`ops-hero ${compact ? 'is-compact' : ''}`} aria-label="ภาพรวมเคส">
        <HeroAmbient />
        <div className="ops-stats">
          <span className="ops-label">เกินหรือใกล้หมด SLA</span>
          <span className="ops-fig">
            <CountUp value={breached + near} />
          </span>
          <span className="ops-sub">
            เกิน {breached} · ใกล้หมด {near}
          </span>
          <dl className="ops-mini">
            <div>
              <dt>เปิดอยู่</dt>
              <dd>
                <CountUp value={open.length} />
              </dd>
            </div>
            <div>
              <dt>วิกฤต</dt>
              <dd>
                <CountUp value={countBy('critical')} />
              </dd>
            </div>
            <div title={`14 วันล่าสุด ไม่นับช่วงรอลูกค้า ${fmtMinutes(Math.round(mttr))}`}>
              <dt>MTTR เฉลี่ย</dt>
              <dd>
                <CountUp value={mttr / 60} decimals={1} />
                <small> ชม.</small>
              </dd>
            </div>
          </dl>
        </div>
        {!compact && (
          <>
            <SlaRunway incidents={visible} customers={customers.filter((c) => ids.includes(c.id))} now={now} />
            <div className="ops-week">
              <span className="ops-label">ต่อสัปดาห์ · 8 สัปดาห์</span>
              <WeekBars points={weeks} />
            </div>
          </>
        )}
      </section>

      <section className="table-card" aria-label="รายการเคส">
        <div className="table-head">
          <Tabs
            panelId="cases-table"
            tabs={[
              { id: 'open', label: 'เปิดอยู่', count: open.length },
              { id: 'waiting', label: isSoc ? 'รอลูกค้าตอบ' : 'รอคุณตอบ', count: visible.filter(viewTest.waiting).length },
              { id: 'closed', label: 'ปิดแล้ว', count: visible.filter(viewTest.closed).length },
              { id: 'all', label: 'ทั้งหมด', count: visible.length },
            ]}
            value={view}
            onChange={(v) => {
              setView(v);
              setCursor(0);
              setPicked([]);
            }}
          />
          <div className="table-tools">
            <div className="field-search">
              <Search {...ICON_SM} className="muted" />
              <label className="visually-hidden" htmlFor="case-text">
                ค้นหาเคส
              </label>
              <input id="case-text" placeholder="ค้นหาเคส IP Hash" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <button className={`btn ${filtersOpen || filterCount ? 'is-on' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              <ListFilter {...ICON_SM} className="muted" />
              ตัวกรอง
              {filterCount > 0 && <span className="num">{filterCount}</span>}
            </button>
            <ColumnMenu columns={columns} setColumns={setColumns} />
            <button className="btn" onClick={() => exportRows(rows)}>
              <Download {...ICON_SM} className="muted" />
              Export
            </button>
          </div>
        </div>

        {picked.length > 0 && (
          <div className="filters">
            <span>เลือก {picked.length} เคส</span>
            {isSoc && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  picked.forEach((id) => updateIncident(id, (inc) => ({ ...inc, assignee: me.name, status: inc.status === 'new' ? 'investigating' : inc.status }), 'รับงาน'));
                  toast(`รับงาน ${picked.length} เคสแล้ว`);
                  setPicked([]);
                }}
              >
                รับงานทั้งหมด
              </button>
            )}
            <button className="btn btn-sm" onClick={() => exportRows(rows.filter((r) => picked.includes(r.id)))}>
              Export ที่เลือก
            </button>
            <button className="btn btn-sm btn-text" onClick={() => setPicked([])}>
              ล้าง
            </button>
          </div>
        )}

        {filtersOpen && (
          <div className="filters">
            {isSoc && <MultiMenu label="ลูกค้า" selected={customerIds} onChange={setCustomerIds} options={customers.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))} />}
            <MultiMenu label="ระดับ" selected={sev} onChange={setSev} options={SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
            <MultiMenu label="สถานะ" selected={statuses} onChange={setStatuses} options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            <MultiMenu label="Log source" selected={sources} onChange={setSources} options={LOG_SOURCES.map((s) => ({ value: s, label: s }))} />
            {isSoc && <MultiMenu label="ผู้รับผิดชอบ" selected={assignees} onChange={setAssignees} options={[{ value: 'none', label: 'ยังไม่มีผู้รับ' }, ...ANALYSTS.map((a) => ({ value: a, label: a }))]} />}
            <button className={`btn btn-sm ${deepOpen || conditions.length ? 'is-on' : ''}`} aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}>
              ตัวกรองเชิงลึก
              {conditions.length > 0 && <span className="num">{conditions.length}</span>}
            </button>
            {filtered && (
              <button className="link" onClick={clearFilters}>
                ล้างทั้งหมด
              </button>
            )}
          </div>
        )}

        {filtersOpen && deepOpen && (
          <DeepFilter
            conditions={conditions}
            onApply={(c) => {
              setConditions(c);
              setDeepOpen(false);
            }}
          />
        )}

        {conditions.length > 0 && !deepOpen && (
          <div className="chips">
            {conditions.map((c, i) => (
              <span className="chip" key={`${c.field}-${i}`}>
                <span className="muted">{FIELD_CATALOG.find((f) => f.key === c.field)?.label}</span>
                <span className="muted">{OPS.find((o) => o.id === c.op)?.label}</span>
                <span className="mono">{c.value}</span>
                <button aria-label="เอาเงื่อนไขนี้ออก" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}>
                  <X size={12} strokeWidth={1.75} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="table-wrap" id="cases-table" role="tabpanel" aria-labelledby={`cases-table-tab-${view}`}>
          <table className="tbl tbl-cases">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" aria-label="เลือกทั้งหมด" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))} />
                </th>
                {shownColumns.map((col) => (
                  <th key={col.key} className={col.className} aria-sort={sort.key === col.sort ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {col.sort ? (
                      <button className="th-sort" onClick={() => toggleSort(col.sort as SortKey)}>
                        {col.label}
                        {sort.key === col.sort && (sort.dir === 1 ? <ChevronUp size={12} strokeWidth={1.75} /> : <ChevronDown size={12} strokeWidth={1.75} />)}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                <th className="cell-chevron" aria-label="เปิดเคส" />
              </tr>
            </thead>
            <tbody>
              {rows.map((inc, index) => {
                const customer = customerOf(inc.customerId);
                const band = rowBands[index];
                return (
                  <Fragment key={inc.id}>
                    {showBands && band !== rowBands[index - 1] && (
                      <tr className={`band-row ${band >= 0 ? `band-${SLA_BANDS[band].tone}` : ''}`}>
                        <td colSpan={shownColumns.length + 2}>
                          <span className="band-label">
                            {band >= 0 ? SLA_BANDS[band].label : 'ปิดแล้ว'}
                            <span className="num">{rowBands.filter((b) => b === band).length}</span>
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className={`${index === cursor ? 'is-cursor' : ''} ${inc.status === 'closed' ? 'is-closed' : ''} ${inc.id === flashId ? 'is-flash' : ''}`} onClick={() => navigate(`/case/${inc.id}`)} onMouseEnter={() => setCursor(index)} onFocus={() => setCursor(index)}>
                      <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`เลือก ${inc.id}`} checked={picked.includes(inc.id)} onChange={() => setPicked((list) => (list.includes(inc.id) ? list.filter((v) => v !== inc.id) : [...list, inc.id]))} />
                      </td>
                      {shownColumns.map((col) => (
                        <td key={col.key} className={col.className}>
                          {col.render(inc, customer, now, claim, columns)}
                        </td>
                      ))}
                      <td className="cell-chevron">
                        <ChevronRight {...ICON} className="muted" />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState title="ไม่มีเคสตามเงื่อนไขนี้">
              {filtered && (
                <button className="link" onClick={clearFilters}>
                  ล้างตัวกรอง
                </button>
              )}
            </EmptyState>
          )}
        </div>
      </section>
      {adding && <AddIncidentSheet onClose={() => setAdding(false)} />}
    </div>
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
          <Columns3 {...ICON_SM} className="muted" />
          คอลัมน์
        </button>
      )}
    >
      <ul className="menu">
        {toggleable.map((c) => (
          <li key={c.key}>
            <label className="menu-row">
              <input type="checkbox" checked={columns.includes(c.key)} onChange={() => setColumns(columns.includes(c.key) ? columns.filter((k) => k !== c.key) : [...columns, c.key])} />
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
  const [rows, setRows] = useState(conditions.length ? conditions : [blank]);
  const set = (i: number, patch: Partial<Condition>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="deep" aria-label="ตัวกรองเชิงลึก">
      <p className="sub">ค้นได้ทุก field ที่เก็บในฐานข้อมูล ทุกเงื่อนไขต้องตรงพร้อมกัน</p>
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
    </section>
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
    navigate(`/case/${inc.id}`);
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
      dirty={mode === 'manual' ? Boolean(title.trim() || srcIp.trim() || hostname.trim()) : file !== null}
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
            <div>
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
                    <td className="text-bad">ไม่พบรหัสลูกค้า แก้ไขรหัสในไฟล์แล้วนำเข้าใหม่</td>
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
