export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Status = 'new' | 'investigating' | 'sent' | 'waiting' | 'closed';
export type Role = 'soc' | 'customer';
export type IocType = 'IP' | 'Hash' | 'Host';

export interface Contact {
  name: string;
  email: string;
}

export interface Department {
  id: string;
  name: string;
  type: 'Branch' | 'Group';
  contacts: Contact[];
  autoSend: boolean;
}

export interface SlaTarget {
  mttd: number;
  mttr: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  partner: string;
  departments: Department[];
  sla: Record<Severity, SlaTarget>;
  encryption: { enabled: boolean; rule: string };
  /* The log sources this customer sends; templates are chosen per case, not stored here. */
  logSources: string[];
  kpi: { closed: number; mttd: number; mttdWithin: number; mttr: number; mttrWithin: number };
}

export interface FieldItem {
  key: string;
  label: string;
  value: string | null;
  ioc?: IocType;
}

export interface FieldGroup {
  title: string;
  items: FieldItem[];
}

export interface Attachment {
  name: string;
  size: string;
}

export interface Comment {
  id: string;
  author: string;
  side: 'soc' | 'customer';
  internal: boolean;
  at: number;
  text: string;
  attachments: Attachment[];
}

export interface Activity {
  id: string;
  at: number;
  actor: string;
  text: string;
}

export interface Delivery {
  at: number;
  by: string;
  recipients: string[];
  file: string;
  encrypted: boolean;
  manual: boolean;
  /* Which templates this send used, so a report can be traced back later. */
  reportTemplateId?: string;
  emailTemplateId?: string;
  /* Set only when the analyst changed the mail's wording for this one send: what was actually sent. */
  mailEdit?: { subject: string; opening: string; closing: string };
}

export type TemplateKind = 'report' | 'email';

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  /* The system default for its kind: always exists, can be edited, cannot be deleted. */
  builtIn: boolean;
  note: string;
  /* Report: heading and the case fields shown in the report table, in order. */
  heading?: string;
  fields?: string[];
  /* Email: text with {{placeholders}}, and whether the report table goes into the body. */
  subject?: string;
  opening?: string;
  includeReport?: boolean;
  closing?: string;
  updatedAt: number;
  updatedBy: string;
}

/* Empty conditions mean "any". The most specific matching rule wins: customer, then Partner, then log source. */
export interface TemplateRule {
  id: string;
  kind: TemplateKind;
  customerId: string | null;
  partner: string | null;
  logSource: string | null;
  templateId: string;
}

export type SopKind = 'auth' | 'malware' | 'network' | 'phish' | 'priv' | 'web' | 'policy';

export interface Incident {
  id: string;
  customerId: string;
  departmentId: string;
  title: string;
  kind: SopKind;
  severity: Severity;
  status: Status;
  assignee: string | null;
  logSource: string;
  detectedAt: number;
  sentAt: number | null;
  closedAt: number | null;
  reopened: number;
  /* Time that never counts towards SLA: waiting on the customer, or closed before a Re-Open. */
  pausedMs: number;
  pausedAt: number | null;
  mttdPausedMs: number;
  groups: FieldGroup[];
  syncable: Record<string, string>;
  rawLog: string;
  parsedBy: 'SOAR' | 'IM2';
  aiState: 'ok' | 'down';
  sopApplied: boolean;
  pdf: 'ready' | 'failed';
  comments: Comment[];
  activity: Activity[];
  deliveries: Delivery[];
}

export interface Ioc {
  id: string;
  type: IocType;
  value: string;
  customerId: string;
  incidentId: string;
  by: string;
  at: number;
}
