import { useState, type CSSProperties } from 'react';
import { fmtClock, SEVERITY_LABEL, SEVERITY_ORDER, slaOf, useCountUp, useWidth } from './lib';
import { eventWave, hourlyLoad } from './mock';
import { useStore } from './store';
import type { Customer, Incident, Severity } from './types';

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const shown = useCountUp(value);
  return <>{shown.toFixed(decimals)}</>;
}

/* Slow light behind the dark panels. It sits under the content and never competes with it. */
export function HeroAmbient({ children }: { children?: React.ReactNode }) {
  return (
    <span className="hero-ambient" aria-hidden="true">
      <i />
      {children}
    </span>
  );
}

/* ---------- Runway: every open case, flying towards its deadline ---------- */

const MAX_MINUTES = 4320;
const TICKS = [
  { min: 15, label: '15 นาที' },
  { min: 60, label: '1 ชม.' },
  { min: 240, label: '4 ชม.' },
  { min: 1440, label: '1 วัน' },
];
const DOT_SIZE: Record<Severity, number> = { critical: 16, high: 13, medium: 10, low: 8 };
const LANE_HEIGHT = 26;
const AXIS_HEIGHT = 22;
const LEFT = 44;
const RIGHT = 12;
/* Rows stay this many however many customers there are: the riskiest get a row each, the rest share the last one. */
const MAX_ROWS = 6;

export function SlaRunway({ incidents, customers, now }: { incidents: Incident[]; customers: Customer[]; now: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hovered, setHovered] = useState<string | null>(null);
  const { setScope } = useStore();
  const open = incidents.filter((i) => i.status !== 'closed');

  /* Riskiest first: most cases past SLA, then the case closest to its deadline. */
  const risk = new Map(
    customers.map((c) => {
      const states = open.filter((i) => i.customerId === c.id).map((i) => slaOf(i, c, now));
      return [c.id, { count: states.length, breached: states.filter((s) => s.remaining <= 0).length, nearest: Math.min(Infinity, ...states.filter((s) => !s.paused).map((s) => s.remaining)) }];
    }),
  );
  const ranked = customers
    .filter((c) => (risk.get(c.id)?.count ?? 0) > 0)
    .sort((a, b) => {
      const ra = risk.get(a.id)!;
      const rb = risk.get(b.id)!;
      return rb.breached - ra.breached || (ra.nearest === rb.nearest ? 0 : ra.nearest < rb.nearest ? -1 : 1);
    });
  const lanes = ranked.length > MAX_ROWS ? ranked.slice(0, MAX_ROWS - 1) : ranked;
  const rest = ranked.slice(lanes.length);
  const laneOf = (customer: Customer) => (lanes.includes(customer) ? lanes.indexOf(customer) : lanes.length);
  const laneCount = lanes.length + (rest.length ? 1 : 0);
  const plot = Math.max(120, width - LEFT - RIGHT);
  const breachZone = plot * 0.14;
  const deadline = LEFT + breachZone;

  const xOf = (remaining: number) => {
    const minutes = remaining / 60000;
    if (minutes <= 0) return deadline - Math.min(1, -minutes / 60) * (breachZone - 10);
    return deadline + (Math.log1p(Math.min(minutes, MAX_MINUTES)) / Math.log1p(MAX_MINUTES)) * (plot - breachZone);
  };

  const items = open
    .map((inc, index) => {
      const customer = customers.find((c) => c.id === inc.customerId) as Customer | undefined;
      if (!customer) return null;
      const s = slaOf(inc, customer, now);
      const lane = laneOf(customer);
      return { inc, customer, s, x: xOf(s.remaining), y: lane * LANE_HEIGHT + LANE_HEIGHT / 2 + ((index % 3) - 1) * 5, breached: s.remaining <= 0, lane };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    /* Critical is drawn last, so it is never hidden behind a quieter case. */
    .sort((a, b) => SEVERITY_ORDER.indexOf(b.inc.severity) - SEVERITY_ORDER.indexOf(a.inc.severity));

  const plotHeight = laneCount * LANE_HEIGHT;
  const active = items.find((i) => i.inc.id === hovered);
  const restNames = rest.map((c) => c.code).join(', ');

  return (
    <div className="rw" ref={ref}>
      <div className="rw-head">
        <span className="rw-title">
          รันเวย์ SLA
          {rest.length > 0 && (
            <span className="rw-note">
              {lanes.length} ลูกค้าที่เสี่ยงที่สุด · อีก {rest.length} รายรวมในแถวล่าง
            </span>
          )}
        </span>
        <span className="rw-legend">
          {SEVERITY_ORDER.map((s) => (
            <span key={s}>
              <i className={`sev-dot sev-${s}`} />
              {SEVERITY_LABEL[s]}
            </span>
          ))}
          <span>
            <i className="rw-legend-paused" />
            หยุดนับ
          </span>
        </span>
      </div>
      <div className="rw-plot" style={{ height: plotHeight + AXIS_HEIGHT }}>
        <span className="rw-breach" style={{ left: LEFT, width: breachZone, height: plotHeight }} />
        {lanes.map((c, i) => (
          <span className="rw-lane" key={c.id} style={{ top: i * LANE_HEIGHT, height: LANE_HEIGHT }}>
            <button className="rw-lane-label" title={`ดูเฉพาะ ${c.name}`} aria-label={`ดูเฉพาะ ${c.name}`} onClick={() => setScope([c.id])}>
              {c.code}
            </button>
          </span>
        ))}
        {rest.length > 0 && (
          <span className="rw-lane rw-lane-rest" style={{ top: lanes.length * LANE_HEIGHT, height: LANE_HEIGHT }}>
            <span className="rw-lane-label" title={`อีก ${rest.length} ลูกค้า: ${restNames}`}>
              +{rest.length}
              <span className="visually-hidden"> ลูกค้า {restNames}</span>
            </span>
          </span>
        )}
        {TICKS.map((t) => (
          <span key={t.min}>
            <span className="rw-tick" style={{ left: xOf(t.min * 60000), height: plotHeight }} />
            <span className="rw-axis" style={{ left: xOf(t.min * 60000) }}>
              {t.label}
            </span>
          </span>
        ))}
        <span className="rw-deadline" style={{ left: deadline, height: plotHeight }} />
        <span className="rw-axis rw-axis-deadline" style={{ left: deadline }}>
          หมดเวลา
        </span>

        {items.map((item, index) => {
          const size = DOT_SIZE[item.inc.severity];
          return (
            <a
              key={item.inc.id}
              href={`#/case/${item.inc.id}`}
              className={`rw-dot rw-sev-${item.inc.severity} ${item.breached ? 'is-breached' : ''} ${item.s.paused ? 'is-paused' : ''}`}
              style={{ transform: `translate3d(${item.x}px, ${item.y}px, 0)`, '--d': `${size}px`, '--i': index } as CSSProperties}
              aria-label={`${item.inc.title} ${item.customer.name} ${item.breached ? 'เกิน' : 'เหลือ'} ${fmtClock(item.s.remaining)}`}
              onMouseEnter={() => setHovered(item.inc.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.inc.id)}
              onBlur={() => setHovered(null)}
            >
              <i />
            </a>
          );
        })}

        {active && (
          <div className={`rw-tip ${active.lane === 0 ? 'is-below' : ''}`} style={{ left: Math.max(96, Math.min(width - 96, active.x)), top: active.y }}>
            <b>{active.inc.title}</b>
            <span className="sub">
              {active.customer.code} · {SEVERITY_LABEL[active.inc.severity]} · {active.s.paused ? 'หยุดนับ' : active.breached ? 'เกิน' : 'เหลือ'} {fmtClock(active.s.remaining)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Dial: how much of the clock is left on this case ---------- */

const TICK_ANGLES = Array.from({ length: 60 }, (_, i) => i * 6);

export function SlaDial({ inc, customer, now }: { inc: Incident; customer: Customer; now: number }) {
  const s = slaOf(inc, customer, now);
  const done = s.phase === 'done';
  const breached = !done && s.remaining <= 0;
  const phase = s.phase === 'mttd' ? 'MTTD' : 'MTTR';
  const tone = done ? 'done' : s.paused && !breached ? 'paused' : s.level;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const fraction = done || breached ? 1 : s.pct;
  const time = done ? 'ปิดแล้ว' : `${breached ? '+' : ''}${fmtClock(s.remaining)}`;
  const label = done ? 'SLA' : s.paused ? 'หยุดนับ' : breached ? `เกิน ${phase}` : `${phase} เหลือ`;

  return (
    <div className={`dial dial-${tone}`} role="img" aria-label={`${label} ${time}`}>
      <svg viewBox="0 0 136 136" aria-hidden="true">
        {TICK_ANGLES.map((angle) => (
          <line key={angle} x1="68" y1={angle % 30 === 0 ? 2 : 4} x2="68" y2="7" className={angle % 30 === 0 ? 'dial-tick dial-tick-major' : 'dial-tick'} transform={`rotate(${angle} 68 68)`} />
        ))}
        <circle cx="68" cy="68" r={radius} className="dial-track" />
        <circle cx="68" cy="68" r={radius} className="dial-arc" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - fraction) }} transform="rotate(-90 68 68)" />
      </svg>
      <div className="dial-center">
        <span className={`dial-time ${time.length > 8 ? 'is-long' : ''}`}>{time}</span>
        <span className="dial-label">{label}</span>
      </div>
    </div>
  );
}

/* ---------- Waveform: the burst of events that led to this case ---------- */

export function EventWave({ id }: { id: string }) {
  const bars = eventWave(id);
  return (
    <svg className="wave" viewBox={`0 0 ${bars.length * 6} 60`} preserveAspectRatio="none">
      {bars.map((value, i) => (
        <rect key={i} x={i * 6} y={60 - value * 60} width="4" height={value * 60} rx="2" style={{ '--i': i } as CSSProperties} />
      ))}
    </svg>
  );
}

/* ---------- Pressure map: when each customer was busiest over the last day ---------- */

interface PressureRow {
  key: string;
  label: string;
  name: string;
  /* Cases per hour, summed over the customers in the row. */
  values: number[];
  /* How many customers the row stands for; colour uses the average per customer, so rows compare fairly. */
  members: number;
}

export function PressureMap({ customers }: { customers: Customer[] }) {
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  /* Busiest first. Past the row limit, the quieter customers share one row. */
  const ranked = hourlyLoad(customers.map((c) => c.id))
    .map((r) => ({ ...r, total: r.hours.reduce((a, b) => a + b, 0), code: customers.find((c) => c.id === r.customerId)?.code ?? r.customerId }))
    .sort((a, b) => b.total - a.total);
  const named = ranked.length > MAX_ROWS ? ranked.slice(0, MAX_ROWS - 1) : ranked;
  const rest = ranked.slice(named.length);
  const rows: PressureRow[] = named.map((r) => ({ key: r.customerId, label: r.code, name: r.code, values: r.hours, members: 1 }));
  if (rest.length) {
    rows.push({
      key: 'rest',
      label: `+${rest.length}`,
      name: `อีก ${rest.length} ลูกค้า`,
      values: Array.from({ length: 24 }, (_, i) => rest.reduce((sum, r) => sum + r.hours[i], 0)),
      members: rest.length,
    });
  }
  const max = Math.max(1, ...rows.flatMap((r) => r.values.map((v) => v / r.members)));
  const currentHour = new Date().getHours();
  const hourAt = (i: number) => (currentHour - 23 + i + 24) % 24;
  const label = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const describe = (row: PressureRow, i: number) => {
    const value = row.values[i];
    return row.members > 1
      ? `${row.name} · ${label(hourAt(i))} · รวม ${value} เคส เฉลี่ย ${(value / row.members).toFixed(1)} ต่อราย`
      : `${row.name} · ${label(hourAt(i))} · ${value} เคส`;
  };
  const hovered = cursor ? describe(rows[cursor.r], cursor.c) : null;
  const show = (r: number, c: number) => setCursor({ r, c });
  const clear = () => setCursor(null);
  /* Mouse, touch and keyboard all reach the same readout: arrows move, Home and End jump along the row. */
  const onKey = (e: React.KeyboardEvent) => {
    const at = cursor ?? { r: 0, c: 23 };
    const last = rows.length - 1;
    const steps: Record<string, { r: number; c: number }> = {
      ArrowLeft: { r: at.r, c: Math.max(0, at.c - 1) },
      ArrowRight: { r: at.r, c: Math.min(23, at.c + 1) },
      ArrowUp: { r: Math.max(0, at.r - 1), c: at.c },
      ArrowDown: { r: Math.min(last, at.r + 1), c: at.c },
      Home: { r: at.r, c: 0 },
      End: { r: at.r, c: 23 },
    };
    const next = steps[e.key];
    if (!next) return;
    e.preventDefault();
    show(next.r, next.c);
  };

  return (
    <section className="pmap" aria-label="ปริมาณเคสรายชั่วโมง">
      <HeroAmbient />
      <div className="rw-head">
        <span className="rw-title">ปริมาณเคส 24 ชั่วโมง</span>
        <span className="pmap-readout" aria-live="polite">
          {hovered ?? (rest.length ? `${named.length} ลูกค้าที่เคสมากที่สุด แถวล่างรวมอีก ${rest.length} ราย · ชี้เพื่อดูจำนวน` : 'ชี้ แตะ หรือกดลูกศรเพื่อดูจำนวน')}
        </span>
        <span className="pmap-scale" aria-hidden="true">
          น้อย
          {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
            <i key={o} style={{ opacity: o }} />
          ))}
          มาก
        </span>
      </div>
      <div
        className="pmap-grid"
        tabIndex={0}
        role="group"
        aria-label="ปริมาณเคสรายชั่วโมงของแต่ละลูกค้า ใช้ปุ่มลูกศรเพื่ออ่านทีละช่อง"
        onKeyDown={onKey}
        onFocus={() => !cursor && show(0, 23)}
        onBlur={clear}
        onMouseLeave={clear}
      >
        {rows.map((row, r) => (
          <div className={`pmap-row ${row.members > 1 ? 'pmap-rest' : ''}`} key={row.key}>
            <b title={row.members > 1 ? `${row.name}: ${rest.map((x) => x.code).join(', ')}` : undefined}>{row.label}</b>
            {row.values.map((value, i) => (
              <i
                key={i}
                className={`pmap-cell ${cursor?.r === r && cursor.c === i ? 'is-cursor' : ''}`}
                title={describe(row, i)}
                style={{ '--o': 0.1 + 0.9 * (value / row.members / max), '--x': i } as CSSProperties}
                onMouseEnter={() => show(r, i)}
                onClick={() => show(r, i)}
              />
            ))}
          </div>
        ))}
        <div className="pmap-row pmap-hours" aria-hidden="true">
          <b />
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i}>{(23 - i) % 6 === 0 ? label(hourAt(i)) : ''}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
