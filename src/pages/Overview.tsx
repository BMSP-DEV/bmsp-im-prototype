import { useMemo, useState } from 'react';
import { SlidersHorizontal, Table2, TrendingUp } from 'lucide-react';
import { fmtDate, fmtMinutes, navigate, SEVERITY_LABEL, SEVERITY_ORDER, slaOf, smoothPath, useHeight, useNow, useStored, useWidth } from '../lib';
import { CUSTOMER_VIEW_ID, trendFor, type DayPoint } from '../mock';
import { useStore } from '../store';
import { ICON, Popover, Segmented, TenantCell } from '../ui';
import { CountUp, PressureMap } from '../viz';

type Metric = 'mttd' | 'mttr';
type Period = '7' | '14' | '30';

const BLOCKS = [
  { id: 'kpi', label: 'ตัวเลขสรุป' },
  { id: 'pressure', label: 'ปริมาณเคสรายชั่วโมง' },
  { id: 'matrix', label: 'ตารางลูกค้า' },
  { id: 'trend', label: 'กราฟ MTTD และ MTTR' },
];

const COLUMNS = [
  { id: 'partner', label: 'Partner' },
  { id: 'severity', label: 'เปิดตามระดับ' },
  { id: 'breached', label: 'เกิน SLA' },
  { id: 'near', label: 'ใกล้หมด' },
  { id: 'closed', label: 'ปิด 30 วัน' },
  { id: 'mttd', label: 'MTTD เฉลี่ย' },
  { id: 'mttdWithin', label: 'MTTD ทัน SLA' },
  { id: 'mttr', label: 'MTTR เฉลี่ย' },
  { id: 'mttrWithin', label: 'MTTR ทัน SLA' },
];

const DEFAULT_LAYOUT = { blocks: BLOCKS.map((b) => b.id), columns: COLUMNS.filter((c) => c.id !== 'partner').map((c) => c.id) };
const HIDE_ON_PHONE = ['closed', 'mttdWithin', 'mttrWithin'];
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const compact = (min: number) => (min < 60 ? `${min.toFixed(1)} น.` : `${Math.floor(min / 60)} ชม. ${Math.round(min % 60)} น.`);

function Diff({ now, before, days }: { now: number; before: number; days: number }) {
  const diff = Math.round((now - before) * 10) / 10;
  return (
    <>
      {diff <= 0 ? 'ลดลง' : 'เพิ่มขึ้น'} {fmtMinutes(Math.abs(diff))} เทียบ {days} วันก่อน
    </>
  );
}

export function OverviewPage() {
  const { visible, customers, customerOf, role, scope, setScope } = useStore();
  const now = useNow(5000);
  const [period, setPeriod] = useStored<Period>('overview-period', '14');
  const [asTable, setAsTable] = useState(false);
  /* Requirement 12: each user keeps their own layout, and nobody else can see it. */
  const [layout, setLayout] = useStored(`overview-layout-v4:${role}`, DEFAULT_LAYOUT);
  const isSoc = role === 'soc';

  const days = Number(period);
  const ids = isSoc ? scope ?? customers.map((c) => c.id) : [CUSTOMER_VIEW_ID];
  const allPoints = useMemo(() => trendFor(ids, days * 2), [ids.join(','), days]); // eslint-disable-line react-hooks/exhaustive-deps
  const points = allPoints.slice(days);
  const before = allPoints.slice(0, days);

  const open = visible.filter((i) => i.status !== 'closed');
  const levels = open.map((i) => slaOf(i, customerOf(i.customerId), now).level);
  const breached = levels.filter((l) => l === 'bad').length;
  const near = levels.filter((l) => l === 'warn').length;
  const mttd = average(points.map((p) => p.mttd));
  const mttr = average(points.map((p) => p.mttr));

  const rows = customers
    .filter((c) => ids.includes(c.id))
    .map((customer) => {
      const list = open.filter((i) => i.customerId === customer.id);
      const state = list.map((i) => slaOf(i, customer, now).level);
      return {
        customer,
        total: list.length,
        bad: state.filter((l) => l === 'bad').length,
        warn: state.filter((l) => l === 'warn').length,
        bySeverity: SEVERITY_ORDER.map((s) => ({ severity: s, count: list.filter((i) => i.severity === s).length })),
      };
    })
    .sort((a, b) => b.bad - a.bad || b.warn - a.warn || b.total - a.total);

  const hasBlock = (id: string) => layout.blocks.includes(id);
  const hasCol = (id: string) => layout.columns.includes(id);
  const custom = layout.blocks.length !== DEFAULT_LAYOUT.blocks.length || layout.columns.length !== DEFAULT_LAYOUT.columns.length;
  const toggle = (key: 'blocks' | 'columns', id: string) => setLayout((l) => ({ ...l, [key]: l[key].includes(id) ? l[key].filter((v) => v !== id) : [...l[key], id] }));
  const maxOpen = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="page">
      <header className="page-head">
        <h1>SLA และ KPI</h1>
        <div className="page-tools">
          <Segmented
            label="ช่วงเวลา"
            value={period}
            onChange={setPeriod}
            options={[
              { id: '7', label: '7 วัน' },
              { id: '14', label: '14 วัน' },
              { id: '30', label: '30 วัน' },
            ]}
          />
          <Popover
            align="right"
            width={264}
            trigger={(isOpen, flip) => (
              <button className={`btn ${custom ? 'is-on' : ''}`} aria-expanded={isOpen} onClick={flip}>
                <SlidersHorizontal {...ICON} className="muted" />
                {custom ? 'มุมมองของฉัน' : 'ปรับมุมมอง'}
              </button>
            )}
          >
            <div className="menu">
              <div className="menu-head">ส่วนที่แสดง</div>
              {BLOCKS.map((b) => (
                <label className="menu-row" key={b.id}>
                  <input type="checkbox" checked={hasBlock(b.id)} onChange={() => toggle('blocks', b.id)} />
                  {b.label}
                </label>
              ))}
              <div className="menu-sep" />
              <div className="menu-head">Field ในตารางลูกค้า</div>
              {COLUMNS.map((c) => (
                <label className="menu-row" key={c.id}>
                  <input type="checkbox" checked={hasCol(c.id)} onChange={() => toggle('columns', c.id)} />
                  {c.label}
                </label>
              ))}
              <div className="menu-foot spread">
                <span className="muted">ผู้ใช้อื่นไม่เห็นมุมมองนี้</span>
                <button className="link" onClick={() => setLayout(DEFAULT_LAYOUT)}>
                  ค่าเริ่มต้น
                </button>
              </div>
            </div>
          </Popover>
        </div>
      </header>

      <div className="overview">
        {hasBlock('kpi') && (
          <dl className="kpis">
            <div className="kpi">
              <dt>เปิดอยู่</dt>
              <dd>
                <CountUp value={open.length} />
              </dd>
              <span className="sub">
                {SEVERITY_ORDER.map((s) => `${SEVERITY_LABEL[s]} ${open.filter((i) => i.severity === s).length}`).join('  ')}
              </span>
            </div>
            <div className="kpi">
              <dt>เกิน SLA ตอนนี้</dt>
              <dd className={breached ? 'text-bad' : ''}>
                <CountUp value={breached} />
              </dd>
              <span className="sub">ต้องจัดการก่อน</span>
            </div>
            <div className="kpi">
              <dt>ใกล้หมด SLA</dt>
              <dd className={near ? 'text-warn' : ''}>
                <CountUp value={near} />
              </dd>
              <span className="sub">เหลือไม่ถึง 25% ของเวลา</span>
            </div>
            <div className="kpi">
              <dt>MTTD เฉลี่ย</dt>
              <dd>
                <CountUp value={mttd} decimals={1} />
                <small> นาที</small>
              </dd>
              <span className="sub">
                <Diff now={mttd} before={average(before.map((p) => p.mttd))} days={days} />
              </span>
            </div>
            <div className="kpi">
              <dt>MTTR เฉลี่ย</dt>
              <dd>
                <CountUp value={mttr / 60} decimals={1} />
                <small> ชม.</small>
              </dd>
              <span className="sub">
                <Diff now={Math.round(mttr)} before={Math.round(average(before.map((p) => p.mttr)))} days={days} />
              </span>
            </div>
          </dl>
        )}

        {hasBlock('pressure') && <PressureMap customers={customers.filter((c) => ids.includes(c.id))} />}

        <div className={`overview-grid ${hasBlock('matrix') && hasBlock('trend') ? '' : 'is-single'}`}>
          {hasBlock('matrix') && (
            <section className="panel panel-flush" aria-label="ตารางลูกค้า">
              <div className="panel-head panel-pad">
                <h2>{isSoc ? 'ลูกค้าเรียงตามความเสี่ยง' : 'KPI ของคุณ'}</h2>
                <span className="legend">
                  {SEVERITY_ORDER.map((s) => (
                    <span key={s}>
                      <i className={`sev-dot sev-${s}`} />
                      {SEVERITY_LABEL[s]}
                    </span>
                  ))}
                </span>
              </div>
              <div className="table-scroll">
                <table className="tbl tbl-matrix">
                  <thead>
                    <tr>
                      <th>ลูกค้า</th>
                      {COLUMNS.filter((c) => hasCol(c.id)).map((c) => (
                        <th key={c.id} className={`${c.id === 'partner' || c.id === 'severity' ? '' : 'cell-right'} ${HIDE_ON_PHONE.includes(c.id) ? 'col-opt' : ''}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.customer.id}
                        className={isSoc ? 'is-link' : ''}
                        onClick={
                          isSoc
                            ? () => {
                                setScope([row.customer.id]);
                                navigate('/work');
                              }
                            : undefined
                        }
                      >
                        <td>
                          {isSoc ? (
                            <a
                              className="row-link"
                              href="#/work"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setScope([row.customer.id]);
                                navigate("/work");
                              }}
                            >
                              <TenantCell customer={row.customer} />
                            </a>
                          ) : (
                            <TenantCell customer={row.customer} />
                          )}
                        </td>
                        {hasCol('partner') && <td className="secondary">{row.customer.partner}</td>}
                        {hasCol('severity') && (
                          <td>
                            <span className="stack-bar-wrap">
                              <span className="num stack-total">{row.total}</span>
                              <span className="stack-bar" style={{ width: `${Math.max(6, (row.total / maxOpen) * 100)}%` }}>
                                {row.bySeverity
                                  .filter((s) => s.count > 0)
                                  .map((s) => (
                                    <i key={s.severity} className={`sev-${s.severity}`} style={{ flexGrow: s.count }} title={`${SEVERITY_LABEL[s.severity]} ${s.count} เคส`} />
                                  ))}
                              </span>
                            </span>
                          </td>
                        )}
                        {hasCol('breached') && <td className={`cell-right mono ${row.bad ? 'text-bad' : 'muted'}`}>{row.bad}</td>}
                        {hasCol('near') && <td className={`cell-right mono ${row.warn ? 'text-warn' : 'muted'}`}>{row.warn}</td>}
                        {hasCol('closed') && <td className="cell-right mono col-opt">{row.customer.kpi.closed}</td>}
                        {hasCol('mttd') && <td className="cell-right mono">{compact(row.customer.kpi.mttd)}</td>}
                        {hasCol('mttdWithin') && <td className="cell-right mono col-opt">{row.customer.kpi.mttdWithin.toFixed(1)}%</td>}
                        {hasCol('mttr') && <td className="cell-right mono">{compact(row.customer.kpi.mttr)}</td>}
                        {hasCol('mttrWithin') && <td className="cell-right mono col-opt">{row.customer.kpi.mttrWithin.toFixed(1)}%</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {hasBlock('trend') && (
            <section className="panel" aria-label="แนวโน้ม MTTD และ MTTR">
              <div className="panel-head">
                <h2>แนวโน้มรายวัน</h2>
                <button className="icon-btn" aria-label={asTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'} title={asTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'} onClick={() => setAsTable(!asTable)}>
                  {asTable ? <TrendingUp {...ICON} /> : <Table2 {...ICON} />}
                </button>
              </div>
              {asTable ? (
                <TrendTable points={points} />
              ) : (
                <div className="charts">
                  <TrendChart points={points} metric="mttd" title="MTTD" />
                  <TrendChart points={points} metric="mttr" title="MTTR" />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendTable({ points }: { points: DayPoint[] }) {
  return (
    <div className="trend-table">
      <table className="tbl tbl-plain">
        <thead>
          <tr>
            <th>วันที่</th>
            <th className="cell-right">MTTD</th>
            <th className="cell-right">MTTR</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td className="mono">{fmtDate(p.day)}</td>
              <td className="cell-right mono">{fmtMinutes(Math.round(p.mttd * 10) / 10)}</td>
              <td className="cell-right mono">{fmtMinutes(Math.round(p.mttr))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceCeil(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  /* Every step divides evenly by 4, so the grid lines land on round values. */
  const step = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 4.8, 6, 8, 10].find((s) => s * power >= value) as number;
  return step * power;
}

/* MTTD and MTTR differ by an order of magnitude, so each gets its own chart and scale. */
function TrendChart({ points, metric, title }: { points: DayPoint[]; metric: Metric; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [plotRef, room] = useHeight<HTMLDivElement>(168);
  const [hover, setHover] = useState<number | null>(null);

  /* Fills the room the layout gives it when the page fits the window, never squeezed below a readable size. */
  const height = Math.max(120, Math.round(room));
  const m = { top: 8, right: 8, bottom: 24, left: 52 };
  const targetKey = metric === 'mttd' ? 'mttdTarget' : 'mttrTarget';
  const top = niceCeil(Math.max(...points.map((p) => p[metric]), ...points.map((p) => p[targetKey])) * 1.08);
  const x = (i: number) => m.left + (i / Math.max(1, points.length - 1)) * (width - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / top) * (height - m.top - m.bottom);
  const line = smoothPath(points.map((p, i) => [x(i), y(p[metric])]));
  const target = smoothPath(points.map((p, i) => [x(i), y(p[targetKey])]));
  const ticks = [0, 0.5, 1].map((t) => t * top);
  const labelEvery = points.length > 20 ? 7 : points.length > 10 ? 3 : 1;
  const unit = (v: number) => (metric === 'mttd' ? `${Math.round(v)} น.` : `${(v / 60).toFixed(v % 60 ? 1 : 0)} ชม.`);
  const hovered = hover === null ? null : points[hover];
  const flip = hover !== null && x(hover) > width - 168;
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - box.left) / box.width) * (points.length - 1)))));
  };

  return (
    <div className="chart" ref={ref}>
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="legend">
          <span>
            <i className="legend-line" />
            เฉลี่ย
          </span>
          <span>
            <i className="legend-line legend-dash" />
            เป้า SLA
          </span>
        </span>
      </div>
      <div className="chart-plot" ref={plotRef}>
      <svg width={width} height={height} role="img" aria-label={`${title} เฉลี่ยรายวัน ${points.length} วัน ล่าสุด ${fmtMinutes(Math.round(points[points.length - 1][metric]))}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.left - 8} y={y(t) + 4} textAnchor="end" className="axis">
              {unit(t)}
            </text>
          </g>
        ))}
        {points.map(
          (p, i) =>
            (points.length - 1 - i) % labelEvery === 0 && (
              <text key={p.day} x={x(i)} y={height - 6} textAnchor={i === points.length - 1 ? 'end' : 'middle'} className="axis">
                {fmtDate(p.day).slice(0, -3)}
              </text>
            ),
        )}
        <defs>
          <linearGradient id={`trend-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="area-top" />
            <stop offset="1" className="area-bottom" />
          </linearGradient>
        </defs>
        <path d={`${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#trend-${metric})`} />
        <path d={target} className="line-target" />
        <path d={line} className="line-main" pathLength={1} />
        {hover !== null && hovered && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={height - m.bottom} className="crosshair" />
            <circle cx={x(hover)} cy={y(hovered[metric])} r={4} className="point" />
          </g>
        )}
        <rect x={m.left} y={m.top} width={Math.max(0, width - m.left - m.right)} height={height - m.top - m.bottom} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      </div>
      {hovered && hover !== null && (
        <div className="tip" style={{ left: flip ? x(hover) - 12 : x(hover) + 12, top: 36, transform: flip ? 'translateX(-100%)' : undefined }}>
          <div className="mono muted">{fmtDate(hovered.day)}</div>
          <div className="tip-row">
            <span className="muted">เฉลี่ย</span>
            <span className="mono">{fmtMinutes(Math.round(hovered[metric] * 10) / 10)}</span>
          </div>
          <div className="tip-row">
            <span className="muted">เป้า</span>
            <span className="mono">{fmtMinutes(Math.round(hovered[targetKey]))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
