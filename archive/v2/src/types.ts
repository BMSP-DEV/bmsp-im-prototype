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
  emailTemplate: 'default' | 'custom';
  reportTemplates: { logSource: string; template: string }[];
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
