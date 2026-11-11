import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Table2, TrendingUp } from 'lucide-react';
import { fmtDate, fmtMinutes, navigate, SEVERITY_LABEL, SEVERITY_ORDER, slaOf, useNow, useStored } from '../lib';
import { CUSTOMER_VIEW_ID, trendFor, type DayPoint } from '../mock';
import { Topbar } from '../shell';
import { useStore } from '../store';
import { ICON, Popover, Segmented, TenantCell } from '../ui';

type Metric = 'mttd' | 'mttr';
type Period = '7' | '14' | '30';

const WIDGETS = [
  { id: 'stats', label: 'ตัวเลขสรุป' },
  { id: 'trend', label: 'กราฟ MTTD และ MTTR' },
  { id: 'load', label: 'ภาระงานรายลูกค้า' },
  { id: 'table', label: 'ตาราง KPI รายลูกค้า' },
];

const KPI_COLUMNS = [
  { id: 'partner', label: 'Partner' },
  { id: 'open', label: 'เปิดอยู่' },
  { id: 'closed', label: 'ปิดแล้ว' },
  { id: 'mttd', label: 'MTTD เฉลี่ย' },
  { id: 'mttdWithin', label: 'MTTD ทัน SLA' },
  { id: 'mttr', label: 'MTTR เฉลี่ย' },
  { id: 'mttrWithin', label: 'MTTR ทัน SLA' },
];

const DEFAULT_LAYOUT = { widgets: WIDGETS.map((w) => w.id), columns: KPI_COLUMNS.map((c) => c.id) };

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

function DiffText({ now, before, days }: { now: number; before: number; days: number }) {
  const diff = now - before;
  const word = diff <= 0 ? 'ลดลง' : 'เพิ่มขึ้น';
  return (
    <>
      {word} {fmtMinutes(Math.abs(Math.round(diff * 10) / 10))} เทียบ {days} วันก่อนหน้า
    </>
  );
}

export function DashboardPage() {
  const { visible, customers, customerOf, role, scope, setScope } = useStore();
  const now = useNow(5000);
  const [period, setPeriod] = useStored<Period>('dash-period', '14');
  const [metric, setMetric] = useState<Metric>('mttd');
  const [asTable, setAsTable] = useState(false);
  /* Requirement 12: each user keeps their own layout, and nobody else can see it. */
  const [layout, setLayout] = useStored(`dash-layout:${role}`, DEFAULT_LAYOUT);

  const days = Number(period);
  const ids = role === 'customer' ? [CUSTOMER_VIEW_ID] : scope ?? customers.map((c) => c.id);
  const allPoints = useMemo(() => trendFor(ids, days * 2), [ids.join(','), days]); // eslint-disable-line react-hooks/exhaustive-deps
  const points = allPoints.slice(days);
  const before = allPoints.slice(0, days);

  const open = visible.filter((i) => i.status !== 'closed');
  const levels = open.map((i) => slaOf(i, customerOf(i.customerId), now).level);
  const breached = levels.filter((l) => l === 'bad').length;
  const near = levels.filter((l) => l === 'warn').length;
  const count = (s: string) => open.filter((i) => i.severity === s).length;

  const mttd = average(points.map((p) => p.mttd));
  const mttr = average(points.map((p) => p.mttr));

  const inView = customers.filter((c) => ids.includes(c.id));
  const load = inView
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
  const maxOpen = Math.max(1, ...load.map((l) => l.total));

  const has = (id: string) => layout.widgets.includes(id);
  const hasCol = (id: string) => layout.columns.includes(id);
  const custom = layout.widgets.length !== DEFAULT_LAYOUT.widgets.length || layout.columns.length !== DEFAULT_LAYOUT.columns.length;
  const toggle = (key: 'widgets' | 'columns', id: string) =>
    setLayout((l) => ({ ...l, [key]: l[key].includes(id) ? l[key].filter((v) => v !== id) : [...l[key], id] }));
  const showLoad = has('load') && role === 'soc';

  return (
    <>
      <Topbar title="SLA และ KPI">
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
          width={260}
          trigger={(isOpen, flip) => (
            <button className="btn" aria-expanded={isOpen} onClick={flip}>
              <SlidersHorizontal {...ICON} className="muted" />
              {custom ? 'มุมมองของฉัน' : 'ปรับมุมมอง'}
            </button>
          )}
        >
          <div className="menu">
            <div className="menu-head">ส่วนที่แสดง</div>
            {WIDGETS.filter((w) => role === 'soc' || w.id !== 'load').map((w) => (
              <label className="menu-row" key={w.id}>
                <input type="checkbox" checked={has(w.id)} onChange={() => toggle('widgets', w.id)} />
                {w.label}
              </label>
            ))}
            <div className="menu-sep" />
            <div className="menu-head">Field ในตาราง KPI</div>
            {KPI_COLUMNS.map((c) => (
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
      </Topbar>

      <div className="content">
        <div className="dash">
          {has('stats') && (
            <div className="stats">
              <div className="stat">
                <span className="stat-label">เคสที่เปิดอยู่</span>
                <span className="stat-fig">{open.length}</span>
                <span className="stat-sub">
                  วิกฤต {count('critical')} สูง {count('high')} กลาง {count('medium')} ต่ำ {count('low')}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">เกินหรือใกล้หมด SLA ตอนนี้</span>
                <span className={`stat-fig ${breached ? 'text-bad' : ''}`}>{breached + near}</span>
                <span className="stat-sub">
                  เกิน {breached} ใกล้หมด {near}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">MTTD เฉลี่ย</span>
                <span className="stat-fig">
                  {(Math.round(mttd * 10) / 10).toFixed(1)}
                  <small> นาที</small>
                </span>
                <span className="stat-sub">
                  <DiffText now={mttd} before={average(before.map((p) => p.mttd))} days={days} />
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">MTTR เฉลี่ย</span>
                <span className="stat-fig">
                  {(mttr / 60).toFixed(1)}
                  <small> ชม.</small>
                </span>
                <span className="stat-sub">
                  <DiffText now={Math.round(mttr)} before={Math.round(average(before.map((p) => p.mttr)))} days={days} />
                </span>
              </div>
            </div>
          )}

          {(has('trend') || showLoad) && (
            <div className={`dash-row ${has('trend') && showLoad ? '' : 'dash-row-single'}`}>
              {has('trend') && (
                <section className="card">
                  <div className="card-title-row">
                    <h3>{metric === 'mttd' ? 'MTTD เฉลี่ยรายวัน' : 'MTTR เฉลี่ยรายวัน'}</h3>
                    <div className="row-gap">
                      <Segmented
                        label="ตัวชี้วัด"
                        value={metric}
                        onChange={setMetric}
                        options={[
                          { id: 'mttd', label: 'MTTD' },
                          { id: 'mttr', label: 'MTTR' },
                        ]}
                      />
                      <button className="icon-btn" aria-label={asTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'} title={asTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'} onClick={() => setAsTable(!asTable)}>
                        {asTable ? <TrendingUp {...ICON} /> : <Table2 {...ICON} />}
                      </button>
                    </div>
                  </div>
                  {asTable ? <TrendTable points={points} metric={metric} /> : <TrendChart points={points} metric={metric} />}
                </section>
              )}

              {showLoad && (
                <section className="card">
                  <div className="card-title-row">
                    <h3>ภาระงานรายลูกค้า</h3>
                    <span className="legend">
                      {SEVERITY_ORDER.map((s) => (
                        <span key={s}>
                          <i className={`sev-dot sev-${s}`} />
                          {SEVERITY_LABEL[s]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="load">
                    {load.map((row) => (
                      <button
                        key={row.customer.id}
                        className="load-row"
                        onClick={() => {
                          setScope([row.customer.id]);
                          navigate('/queue');
                        }}
                      >
                        <span className="load-top">
                          <span className="code">{row.customer.code}</span>
                          <span className="load-name ellipsis">{row.customer.name}</span>
                          <span className="num">{row.total}</span>
                        </span>
                        <span className="load-bar" style={{ width: `${Math.max(4, (row.total / maxOpen) * 100)}%` }}>
                          {row.bySeverity
                            .filter((s) => s.count > 0)
                            .map((s) => (
                              <i key={s.severity} className={`sev-${s.severity}`} style={{ flexGrow: s.count }} title={`${SEVERITY_LABEL[s.severity]} ${s.count} เคส`} />
                            ))}
                        </span>
                        <span className="load-meta">
                          {row.bad > 0 && <span className="text-bad">เกิน {row.bad}</span>}
                          {row.warn > 0 && <span className="text-warn">ใกล้หมด {row.warn}</span>}
                          {row.bad === 0 && row.warn === 0 && <span>อยู่ใน SLA ทั้งหมด</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {has('table') && (
            <section className="card card-flush">
              <div className="card-title-row card-pad">
                <h3>{role === 'soc' ? 'KPI รายลูกค้า' : 'KPI ของคุณ'}</h3>
                <span className="muted">30 วันล่าสุด</span>
              </div>
              <table className="tbl tbl-static">
                <thead>
                  <tr>
                    <th>ลูกค้า</th>
                    {KPI_COLUMNS.filter((c) => hasCol(c.id)).map((c) => (
                      <th key={c.id} className={c.id === 'partner' ? '' : 'cell-right'}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inView.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <TenantCell customer={c} />
                      </td>
                      {hasCol('partner') && <td className="secondary">{c.partner}</td>}
                      {hasCol('open') && <td className="cell-right mono">{open.filter((i) => i.customerId === c.id).length}</td>}
                      {hasCol('closed') && <td className="cell-right mono">{c.kpi.closed}</td>}
                      {hasCol('mttd') && <td className="cell-right mono">{fmtMinutes(c.kpi.mttd)}</td>}
                      {hasCol('mttdWithin') && <td className="cell-right mono">{c.kpi.mttdWithin.toFixed(1)}%</td>}
                      {hasCol('mttr') && <td className="cell-right mono">{fmtMinutes(c.kpi.mttr)}</td>}
                      {hasCol('mttrWithin') && <td className="cell-right mono">{c.kpi.mttrWithin.toFixed(1)}%</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function TrendTable({ points, metric }: { points: DayPoint[]; metric: Metric }) {
  const target = metric === 'mttd' ? 'mttdTarget' : 'mttrTarget';
  return (
    <div className="trend-table">
      <table className="tbl tbl-plain">
        <thead>
          <tr>
            <th>วันที่</th>
            <th className="cell-right">เฉลี่ย</th>
            <th className="cell-right">เป้า SLA</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td className="mono">{fmtDate(p.day)}</td>
              <td className="cell-right mono">{fmtMinutes(Math.round(p[metric] * 10) / 10)}</td>
              <td className="cell-right mono">{fmtMinutes(Math.round(p[target]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function smoothPath(xy: [number, number][]) {
  const n = xy.length;
  if (n < 2) return '';
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0]));
  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    tangents.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (2 * slopes[i - 1] * slopes[i]) / (slopes[i - 1] + slopes[i]));
  }
  tangents.push(slopes[n - 2]);
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (xy[i + 1][0] - xy[i][0]) / 3;
    d += `C${xy[i][0] + h},${xy[i][1] + tangents[i] * h} ${xy[i + 1][0] - h},${xy[i + 1][1] - tangents[i + 1] * h} ${xy[i + 1][0]},${xy[i + 1][1]}`;
  }
  return d;
}

function niceCeil(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  /* Every step divides evenly by 4, so the four grid lines land on round values. */
  const step = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 4.8, 6, 8, 10].find((s) => s * power >= value) as number;
  return step * power;
}

function TrendChart({ points, metric }: { points: DayPoint[]; metric: Metric }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const height = 300;
  const m = { top: 12, right: 12, bottom: 28, left: 64 };
  const targetKey = metric === 'mttd' ? 'mttdTarget' : 'mttrTarget';
  const values = points.map((p) => p[metric]);
  const targets = points.map((p) => p[targetKey]);
  const top = niceCeil(Math.max(...values, ...targets) * 1.08);
  const x = (i: number) => m.left + (i / Math.max(1, points.length - 1)) * (width - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / top) * (height - m.top - m.bottom);
  const line = smoothPath(points.map((p, i) => [x(i), y(p[metric])]));
  const target = smoothPath(points.map((p, i) => [x(i), y(p[targetKey])]));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
  const labelEvery = points.length > 20 ? 5 : points.length > 10 ? 2 : 1;
  const unit = (v: number) => (metric === 'mttd' ? `${Math.round(v)} น.` : `${(v / 60).toFixed(v / 60 < 10 && v % 60 ? 1 : 0)} ชม.`);
  const hovered = hover === null ? null : points[hover];
  const flip = hover !== null && x(hover) > width - 200;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };

  return (
    <div className="chart" ref={ref}>
      <div className="legend legend-chart">
        <span>
          <i className="legend-line" />
          เฉลี่ยรายวัน
        </span>
        <span>
          <i className="legend-line legend-dash" />
          เป้า SLA เฉลี่ย
        </span>
      </div>
      <svg width={width} height={height} role="img" aria-label={`กราฟ ${metric.toUpperCase()} เฉลี่ยรายวัน ${points.length} วัน`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.left - 12} y={y(t) + 4} textAnchor="end" className="axis">
              {unit(t)}
            </text>
          </g>
        ))}
        {points.map(
          (p, i) =>
            (points.length - 1 - i) % labelEvery === 0 && (
              <text key={p.day} x={x(i)} y={height - 8} textAnchor={i === points.length - 1 ? 'end' : 'middle'} className="axis">
                {fmtDate(p.day).slice(0, -3)}
              </text>
            ),
        )}
        <path d={target} className="line-target" />
        <path d={line} className="line-main" />
        {hover !== null && hovered && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={height - m.bottom} className="crosshair" />
            <circle cx={x(hover)} cy={y(hovered[metric])} r={4} className="point" />
          </g>
        )}
        <rect x={m.left} y={m.top} width={Math.max(0, width - m.left - m.right)} height={height - m.top - m.bottom} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hovered && hover !== null && (
        <div className="tip" style={{ left: flip ? x(hover) - 12 : x(hover) + 12, top: 44, transform: flip ? 'translateX(-100%)' : undefined }}>
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
