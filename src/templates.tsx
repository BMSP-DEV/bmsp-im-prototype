import { fmtDateTime, SEVERITY_LABEL } from './lib';
import { INCIDENTS } from './mock';
import type { Customer, Incident, Template, TemplateKind, TemplateRule } from './types';

/* ---------- Which template a case gets, and why ---------- */

/* Customer beats Partner beats log source; a rule naming two of them beats either one alone. */
export const ruleWeight = (r: TemplateRule) => (r.customerId ? 4 : 0) + (r.partner ? 2 : 0) + (r.logSource ? 1 : 0);

export function ruleMatches(r: TemplateRule, customer: Customer, logSource: string | null) {
  return (!r.customerId || r.customerId === customer.id) && (!r.partner || r.partner === customer.partner) && (!r.logSource || r.logSource === logSource);
}

export function matchingRules(kind: TemplateKind, customer: Customer, logSource: string | null, rules: TemplateRule[]) {
  return rules.filter((r) => r.kind === kind && ruleMatches(r, customer, logSource)).sort((a, b) => ruleWeight(b) - ruleWeight(a));
}

export function ruleLabel(r: Pick<TemplateRule, 'customerId' | 'partner' | 'logSource'>, customers: Customer[]) {
  const parts: string[] = [];
  if (r.customerId) parts.push(`ลูกค้า ${customers.find((c) => c.id === r.customerId)?.code ?? r.customerId}`);
  if (r.partner) parts.push(`Partner ${r.partner}`);
  if (r.logSource) parts.push(`Log source ${r.logSource}`);
  return parts.join(' + ');
}

export interface Resolved {
  template: Template;
  rule: TemplateRule | null;
  reason: string;
}

export function resolveTemplate(kind: TemplateKind, customer: Customer, logSource: string | null, templates: Template[], rules: TemplateRule[], customers: Customer[]): Resolved {
  const fallback = templates.find((t) => t.kind === kind && t.builtIn) as Template;
  const rule = matchingRules(kind, customer, logSource, rules)[0] ?? null;
  const template = (rule && templates.find((t) => t.id === rule.templateId)) || fallback;
  return { template, rule, reason: rule ? `ตามกติกา ${ruleLabel(rule, customers)}` : 'ค่าเริ่มต้น ไม่มีกติกาไหนตรง' };
}

/* Which customers and log sources a rule actually decides, after more specific rules have taken theirs. */
export function ruleReach(rule: TemplateRule, customers: Customer[], templates: Template[], rules: TemplateRule[]) {
  const hits: { customer: Customer; logSource: string | null }[] = [];
  for (const customer of customers) {
    const sources = rule.kind === 'report' ? customer.logSources : [null];
    for (const logSource of sources) {
      if (resolveTemplate(rule.kind, customer, logSource, templates, rules, customers).rule?.id === rule.id) hits.push({ customer, logSource });
    }
  }
  return hits;
}

/* ---------- Fields and placeholders ---------- */

export const FIELD_GROUPS = INCIDENTS[0].groups.map((g) => ({ title: g.title, items: g.items.map((i) => ({ key: i.key, label: i.label })) }));
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELD_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])));

export const PLACEHOLDERS = [
  { key: 'incident_id', label: 'เลขเคส' },
  { key: 'title', label: 'ชื่อเรื่อง' },
  { key: 'customer_code', label: 'รหัสลูกค้า' },
  { key: 'customer_name', label: 'ชื่อลูกค้า' },
  { key: 'severity', label: 'ระดับ' },
  { key: 'detected_at', label: 'เวลา Detect' },
];

export function fill(text: string | undefined, inc: Incident, customer: Customer) {
  const values: Record<string, string> = {
    incident_id: inc.id,
    title: inc.title,
    customer_code: customer.code,
    customer_name: customer.name,
    severity: SEVERITY_LABEL[inc.severity],
    detected_at: fmtDateTime(inc.detectedAt),
  };
  return (text ?? '').replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] ?? m);
}

/* ---------- Preview: the same rendering for the template page and the send sheet ---------- */

export function ReportTable({ report, inc }: { report: Template; inc: Incident }) {
  const valueOf = (key: string) => inc.groups.flatMap((g) => g.items).find((f) => f.key === key)?.value ?? 'ไม่มีข้อมูล';
  const rows: [string, string][] = [['Incident', inc.id], ...(report.fields ?? []).map((k): [string, string] => [FIELD_LABEL[k] ?? k, valueOf(k)]), ['Detect', fmtDateTime(inc.detectedAt)]];
  return (
    <>
      <p className="mail-report-head">
        {report.heading} <span className="sub">· {report.name}</span>
      </p>
      <table className="tbl tbl-plain">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="muted">{k}</td>
              <td className="mono">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function TemplatePreview({ mail, report, inc, customer }: { mail: Template | null; report: Template; inc: Incident; customer: Customer }) {
  if (!mail) {
    return (
      <div className="mail">
        <ReportTable report={report} inc={inc} />
      </div>
    );
  }
  return (
    <div className="mail">
      <p className="mail-subject">{fill(mail.subject, inc, customer)}</p>
      {mail.opening && <p className="mail-text">{fill(mail.opening, inc, customer)}</p>}
      {mail.includeReport ? <ReportTable report={report} inc={inc} /> : <p className="sub">ไม่ใส่ตารางในตัวเมล รายละเอียดอยู่ใน PDF ที่แนบ</p>}
      {mail.closing && <p className="mail-text">{fill(mail.closing, inc, customer)}</p>}
    </div>
  );
}
