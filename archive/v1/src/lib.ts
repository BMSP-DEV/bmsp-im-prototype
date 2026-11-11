import { useCallback, useEffect, useState } from 'react';
import type { Customer, Incident, Severity, Status } from './types';

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'วิกฤต',
  high: 'สูง',
  medium: 'กลาง',
  low: 'ต่ำ',
};
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export const STATUS_LABEL: Record<Status, string> = {
  new: 'ใหม่',
  investigating: 'กำลังตรวจสอบ',
  sent: 'ส่งลูกค้าแล้ว',
  waiting: 'รอลูกค้าตอบ',
  closed: 'ปิดเคส',
};
export const STATUS_ORDER: Status[] = ['new', 'investigating', 'sent', 'waiting', 'closed'];

/* ---------- Time format ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function fmtClock(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  if (days > 0) return `${days} วัน ${pad(hours)}:${pad(minutes)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min * 10) / 10} นาที`;
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const rest = Math.round(min % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} วัน`);
  if (hours) parts.push(`${hours} ชม.`);
  if (rest) parts.push(`${rest} นาที`);
  return parts.join(' ');
}

export function fmtTime(ts: number, seconds = false): string {
  const d = new Date(ts);
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${base}:${pad(d.getSeconds())}` : base;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())} ${THAI_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}

export function fmtDateTime(ts: number): string {
  return `${fmtDate(ts)} ${fmtTime(ts)}`;
}

/* A case detected earlier than today shows its date too, so the queue never reads as today. */
export function fmtDetected(ts: number, now: number): string {
  const sameDay = new Date(ts).toDateString() === new Date(now).toDateString();
  return sameDay ? fmtTime(ts) : `${new Date(ts).getDate()} ${THAI_MONTHS[new Date(ts).getMonth()]} ${fmtTime(ts)}`;
}

/* ---------- SLA: MTTD = Detect to email sent, MTTR = email sent to case closed ---------- */

export type SlaLevel = 'ok' | 'warn' | 'bad' | 'done';

export interface SlaState {
  phase: 'mttd' | 'mttr' | 'done';
  elapsed: number;
  target: number;
  remaining: number;
  pct: number;
  level: SlaLevel;
  paused: boolean;
}

export function slaOf(inc: Incident, customer: Customer, now: number): SlaState {
  const t = customer.sla[inc.severity];
  if (inc.closedAt) {
    const elapsed = inc.closedAt - (inc.sentAt ?? inc.detectedAt) - (inc.sentAt ? inc.pausedMs : inc.mttdPausedMs);
    const target = t.mttr * 60000;
    return { phase: 'done', elapsed, target, remaining: target - elapsed, pct: 0, level: 'done', paused: false };
  }
  const phase = inc.sentAt ? 'mttr' : 'mttd';
  const start = inc.sentAt ?? inc.detectedAt;
  const target = (phase === 'mttr' ? t.mttr : t.mttd) * 60000;
  const paused = inc.pausedAt !== null;
  const elapsed = (inc.pausedAt ?? now) - start - (phase === 'mttr' ? inc.pausedMs : inc.mttdPausedMs);
  const remaining = target - elapsed;
  const pct = Math.max(0, Math.min(1, remaining / target));
  /* A paused case cannot run out, so it is never "near". One already over SLA stays over. */
  const level: SlaLevel = remaining <= 0 ? 'bad' : pct < 0.25 && !paused ? 'warn' : 'ok';
  return { phase, elapsed, target, remaining, pct, level, paused };
}

/* Every status change goes through here, so the SLA pause can never drift from the status. */
export function withStatus(inc: Incident, status: Status, now = Date.now()): Incident {
  const entering = inc.status !== 'waiting' && status === 'waiting';
  const leaving = inc.status === 'waiting' && status !== 'waiting';
  return {
    ...inc,
    status,
    pausedMs: leaving && inc.pausedAt ? inc.pausedMs + (now - inc.pausedAt) : inc.pausedMs,
    pausedAt: entering ? now : leaving ? null : inc.pausedAt,
  };
}

export function pausedTotal(inc: Incident, now: number): number {
  return inc.pausedMs + (inc.pausedAt ? now - inc.pausedAt : 0);
}

/* ---------- Hooks ---------- */

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`im2:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`im2:${key}`, JSON.stringify(value));
  } catch {
    /* Storage can be blocked. The prototype still works for the session. */
  }
}

type Updater<T> = T | ((prev: T) => T);

/* Survives reloads. Used for per-user preferences like columns and theme. */
export function useStored<T>(key: string, fallback: T): [T, (next: Updater<T>) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  useEffect(() => {
    setValue(readStored(key, fallback));
    // fallback is a literal default, the key alone decides when to re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: Updater<T>) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        writeStored(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

const memory = new Map<string, unknown>();

/* Survives leaving a page, so filters are still there after opening a case and coming back. */
export function useMemory<T>(key: string, initial: T): [T, (next: Updater<T>) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const set = useCallback(
    (next: Updater<T>) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        memory.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

export function setQueueOrder(ids: string[]) {
  memory.set('queue:order', ids);
}

export function getQueueOrder(): string[] {
  return (memory.get('queue:order') as string[]) ?? [];
}

/* ---------- Routing ---------- */

export function useRoute(): string[] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const onChange = () => setParts(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parts;
}

export function navigate(path: string) {
  window.location.hash = path;
}

/* Thai keyboards send different characters for J, K and /, so shortcuts read the physical key. */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function hasOpenLayer(): boolean {
  return document.querySelector('.sheet-layer') !== null;
}

/* ---------- Export: all fields, with a BOM so Excel keeps Thai text intact ---------- */

export function flattenIncident(inc: Incident, customer: Customer): Record<string, string> {
  const dept = customer.departments.find((d) => d.id === inc.departmentId);
  const base: Record<string, string> = {
    id: inc.id,
    customer_code: customer.code,
    customer_name: customer.name,
    partner: customer.partner,
    department: dept?.name ?? '',
    title: inc.title,
    severity: SEVERITY_LABEL[inc.severity],
    status: STATUS_LABEL[inc.status],
    assignee: inc.assignee ?? '',
    detected_at: new Date(inc.detectedAt).toISOString(),
    email_sent_at: inc.sentAt ? new Date(inc.sentAt).toISOString() : '',
    closed_at: inc.closedAt ? new Date(inc.closedAt).toISOString() : '',
    reopened: String(inc.reopened),
    sla_paused_minutes: String(Math.round((pausedTotal(inc, Date.now()) + inc.mttdPausedMs) / 60000)),
  };
  for (const group of inc.groups) {
    for (const item of group.items) base[item.key] = item.value ?? '';
  }
  return base;
}

export function downloadCsv(filename: string, rows: Record<string, string>[]): number {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h] ?? '')).join(','))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return headers.length;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
