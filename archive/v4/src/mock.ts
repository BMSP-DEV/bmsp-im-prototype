import type {
  Activity,
  Comment,
  Contact,
  Customer,
  Department,
  FieldGroup,
  Incident,
  Ioc,
  Severity,
  SlaTarget,
  SopKind,
  Status,
} from './types';

/* All organisations, people and addresses here are invented for the prototype. */

const MIN = 60_000;
const NOW = Date.now();

export const ME_SOC = { name: 'นิดา ส.', title: 'SOC L2' };
export const ME_CUSTOMER = { name: 'วิภา จ.', title: 'ลูกค้า · SNK' };
export const CUSTOMER_VIEW_ID = 'snk';
export const ANALYSTS = ['นิดา ส.', 'กร ว.', 'ภาคิน ท.', 'อรทัย ม.', 'ธนพล ร.'];
export const LOG_SOURCES = ['Securonix', 'FortiGate', 'Microsoft Defender', 'Palo Alto', 'Windows Security', 'Proofpoint'];
export const APP_VERSION = 'IM2 2.0 prototype';

export const ENCRYPTION_RULES = [
  { id: 'customer-date', label: 'รหัสลูกค้า + วันที่ส่ง' },
  { id: 'case-customer', label: 'เลข Incident + รหัสลูกค้า' },
  { id: 'fixed', label: 'รหัสคงที่ที่ลูกค้ากำหนด' },
];

export const REPORT_TEMPLATES = ['default', 'template_Sinority', 'template_Network', 'custom_ผู้บริหาร'];

function dept(id: string, name: string, type: Department['type'], autoSend: boolean, contacts: [string, string][]): Department {
  return { id, name, type, autoSend, contacts: contacts.map(([n, email]): Contact => ({ name: n, email })) };
}

function sla(c: [number, number], h: [number, number], m: [number, number], l: [number, number]): Record<Severity, SlaTarget> {
  const t = ([mttd, mttr]: [number, number]) => ({ mttd, mttr });
  return { critical: t(c), high: t(h), medium: t(m), low: t(l) };
}

export const CUSTOMERS: Customer[] = [
  {
    id: 'snk',
    code: 'SNK',
    name: 'ศรีนคร โลจิสติกส์',
    partner: 'Sinority',
    departments: [
      dept('snk-sec', 'IT Security สำนักงานใหญ่', 'Group', true, [['พรทิพย์ ก.', 'porntip@srinakorn.example'], ['วิภา จ.', 'wipa@srinakorn.example']]),
      dept('snk-infra', 'ฝ่ายโครงสร้างพื้นฐาน', 'Group', false, [['ชาญ ป.', 'chan@srinakorn.example'], ['เอกชัย ล.', 'ekachai@srinakorn.example'], ['ศิริ น.', 'siri@srinakorn.example']]),
      dept('snk-lcb', 'สาขาแหลมฉบัง', 'Branch', false, [['มานพ ช.', 'manop@srinakorn.example']]),
      dept('snk-lkb', 'สาขาลาดกระบัง', 'Branch', false, [['สุดา ว.', 'suda@srinakorn.example']]),
    ],
    sla: sla([15, 240], [30, 480], [60, 1440], [240, 4320]),
    encryption: { enabled: true, rule: 'customer-date' },
    emailTemplate: 'default',
    reportTemplates: [
      { logSource: 'Securonix', template: 'template_Sinority' },
      { logSource: 'Microsoft Defender', template: 'template_Sinority' },
      { logSource: 'Windows Security', template: 'default' },
      { logSource: 'Proofpoint', template: 'default' },
    ],
    kpi: { closed: 212, mttd: 11.4, mttdWithin: 97.2, mttr: 176, mttrWithin: 94.8 },
  },
  {
    id: 'ppe',
    code: 'PPE',
    name: 'ภูผา พลังงาน',
    partner: 'Direct',
    departments: [
      dept('ppe-sec', 'IT Security', 'Group', true, [['ณัฐ ท.', 'nat@phupha.example'], ['อภิชาติ ส.', 'apichart@phupha.example']]),
      dept('ppe-ctl', 'ศูนย์ควบคุมระบบ', 'Group', true, [['ปรีชา ด.', 'preecha@phupha.example']]),
      dept('ppe-ryg', 'คลังระยอง', 'Branch', false, [['สมศรี พ.', 'somsri@phupha.example']]),
    ],
    sla: sla([10, 120], [20, 240], [60, 720], [240, 2880]),
    encryption: { enabled: true, rule: 'fixed' },
    emailTemplate: 'custom',
    reportTemplates: [
      { logSource: 'Microsoft Defender', template: 'default' },
      { logSource: 'FortiGate', template: 'template_Network' },
    ],
    kpi: { closed: 148, mttd: 8.2, mttdWithin: 98.6, mttr: 104, mttrWithin: 92.1 },
  },
  {
    id: 'tlt',
    code: 'TLT',
    name: 'ทะเลใต้ รีเทล',
    partner: 'Sinority',
    departments: [
      dept('tlt-it', 'ฝ่าย IT', 'Group', true, [['กิตติ ร.', 'kitti@talaytai.example']]),
      dept('tlt-hkt', 'สาขาภูเก็ต', 'Branch', false, [['อารี บ.', 'aree@talaytai.example']]),
      dept('tlt-hdy', 'สาขาหาดใหญ่', 'Branch', false, [['ฮาซัน ม.', 'hasan@talaytai.example']]),
    ],
    sla: sla([30, 480], [60, 960], [120, 2880], [480, 7200]),
    encryption: { enabled: true, rule: 'customer-date' },
    emailTemplate: 'default',
    reportTemplates: [
      { logSource: 'Securonix', template: 'template_Sinority' },
      { logSource: 'Proofpoint', template: 'template_Sinority' },
    ],
    kpi: { closed: 96, mttd: 24.7, mttdWithin: 93.4, mttr: 412, mttrWithin: 90.3 },
  },
  {
    id: 'wri',
    code: 'WRI',
    name: 'วารี ประกันภัย',
    partner: 'Direct',
    departments: [
      dept('wri-risk', 'Risk และ Compliance', 'Group', true, [['วรรณา ห.', 'wanna@waree.example']]),
      dept('wri-sec', 'IT Security', 'Group', true, [['ธีระ อ.', 'teera@waree.example'], ['จิรา ก.', 'jira@waree.example']]),
    ],
    sla: sla([15, 240], [30, 480], [90, 1440], [240, 4320]),
    encryption: { enabled: true, rule: 'case-customer' },
    emailTemplate: 'default',
    reportTemplates: [
      { logSource: 'Securonix', template: 'default' },
      { logSource: 'Palo Alto', template: 'template_Network' },
    ],
    kpi: { closed: 131, mttd: 12.9, mttdWithin: 95.5, mttr: 203, mttrWithin: 93.7 },
  },
  {
    id: 'mnr',
    code: 'MNR',
    name: 'มณีรัตน์ ฮอสปิทัล',
    partner: 'Direct',
    departments: [
      dept('mnr-it', 'ศูนย์คอมพิวเตอร์', 'Group', true, [['ชลธิชา ส.', 'chonticha@maneerat.example']]),
      dept('mnr-sec', 'ความปลอดภัยสารสนเทศ', 'Group', true, [['สรวิศ ค.', 'sorawit@maneerat.example']]),
      dept('mnr-rm3', 'อาคารพระราม 3', 'Branch', false, [['เบญจา ว.', 'benja@maneerat.example']]),
    ],
    sla: sla([10, 180], [30, 360], [60, 1440], [240, 4320]),
    encryption: { enabled: true, rule: 'fixed' },
    emailTemplate: 'custom',
    reportTemplates: [
      { logSource: 'Palo Alto', template: 'template_Network' },
      { logSource: 'Windows Security', template: 'default' },
    ],
    kpi: { closed: 87, mttd: 9.8, mttdWithin: 96.1, mttr: 158, mttrWithin: 91.2 },
  },
  {
    id: 'kkf',
    code: 'KKF',
    name: 'คลังข้าว ฟู้ดส์',
    partner: 'Direct',
    departments: [
      dept('kkf-it', 'ฝ่ายเทคโนโลยี', 'Group', true, [['ไพโรจน์ ท.', 'pairoj@klangkhao.example']]),
      dept('kkf-fac', 'โรงงานนครปฐม', 'Branch', false, [['ดวงใจ ส.', 'duangjai@klangkhao.example']]),
    ],
    sla: sla([30, 480], [60, 960], [120, 2880], [480, 7200]),
    encryption: { enabled: false, rule: 'customer-date' },
    emailTemplate: 'default',
    reportTemplates: [
      { logSource: 'Microsoft Defender', template: 'default' },
    ],
    kpi: { closed: 54, mttd: 21.3, mttdWithin: 94.4, mttr: 365, mttrWithin: 95.0 },
  },
];

export interface Sop {
  id: string;
  name: string;
  analysis: string;
  steps: string[];
  recommendation: string;
}

export const SOPS: Record<SopKind, Sop> = {
  auth: {
    id: 'SOP-AUTH-03',
    name: 'Brute force และการใช้บัญชีผิดปกติ',
    analysis: 'พบการล็อกอินล้มเหลวจำนวนมากจากแหล่งเดียวกัน ตามด้วยการล็อกอินสำเร็จ มีแนวโน้มว่าบัญชีถูกเดารหัสผ่านสำเร็จ',
    steps: ['ยืนยันกับเจ้าของบัญชีว่าล็อกอินเองหรือไม่', 'ตรวจว่า Source IP อยู่ในช่วงที่อนุญาตหรือไม่', 'ไล่กิจกรรมของบัญชีหลังล็อกอินสำเร็จ 30 นาที', 'หากไม่ใช่เจ้าของบัญชี ให้ลูกค้าระงับบัญชี'],
    recommendation: 'ระงับบัญชีชั่วคราว เปลี่ยนรหัสผ่าน และเปิด MFA',
  },
  malware: {
    id: 'SOP-MAL-01',
    name: 'มัลแวร์บนเครื่องปลายทาง',
    analysis: 'Endpoint ตรวจพบไฟล์หรือพฤติกรรมที่เข้าข่ายมัลแวร์บนเครื่องปลายทาง',
    steps: ['ตรวจ SHA-256 กับฐานข้อมูล threat intelligence', 'ตรวจว่าไฟล์ถูกเรียกใช้งานแล้วหรือไม่', 'แยกเครื่องออกจากเครือข่ายเมื่อยืนยันว่าอันตราย', 'ค้นหาเครื่องอื่นที่มี hash เดียวกัน'],
    recommendation: 'แยกเครื่องออกจากเครือข่าย สแกนทั้งเครื่อง และบล็อก hash นี้',
  },
  network: {
    id: 'SOP-NET-02',
    name: 'การเชื่อมต่อออกนอกที่น่าสงสัย',
    analysis: 'พบการเชื่อมต่อจากเครื่องภายในไปยังปลายทางที่มีประวัติเป็น command and control หรือมีปริมาณข้อมูลผิดปกติ',
    steps: ['ตรวจชื่อเสียงของ Destination IP', 'ดูปริมาณข้อมูลและความถี่ของการเชื่อมต่อ', 'ระบุโปรเซสต้นทางบนเครื่อง', 'บล็อกปลายทางที่ไฟร์วอลล์เมื่อยืนยันแล้ว'],
    recommendation: 'บล็อกปลายทางที่ไฟร์วอลล์ และตรวจเครื่องต้นทาง',
  },
  phish: {
    id: 'SOP-PHI-04',
    name: 'Phishing',
    analysis: 'ผู้ใช้เปิดลิงก์หรือไฟล์แนบจากอีเมลที่เข้าข่าย phishing',
    steps: ['เก็บหัวอีเมลและ URL ต้นทาง', 'ตรวจว่ามีผู้ใช้อื่นได้รับอีเมลเดียวกันหรือไม่', 'ตรวจว่าผู้ใช้กรอกรหัสผ่านหรือไม่', 'ลบอีเมลออกจากกล่องผู้ใช้ทั้งหมด'],
    recommendation: 'เปลี่ยนรหัสผ่านของผู้ใช้ที่เกี่ยวข้อง และบล็อกโดเมนผู้ส่ง',
  },
  priv: {
    id: 'SOP-PRV-02',
    name: 'การใช้สิทธิ์สูงผิดปกติ',
    analysis: 'พบการใช้บัญชีสิทธิ์สูงหรือการสร้างบัญชีผู้ดูแลนอกช่วงเวลาทำงานหรือนอกแผนงาน',
    steps: ['ตรวจกับแผนงานเปลี่ยนแปลงของลูกค้า', 'ยืนยันตัวตนผู้ใช้บัญชี', 'ไล่คำสั่งที่รันด้วยสิทธิ์สูง', 'ปิดบัญชีที่สร้างโดยไม่ได้รับอนุมัติ'],
    recommendation: 'ตรวจสอบกับเจ้าของระบบ และปิดบัญชีที่ไม่ได้รับอนุมัติ',
  },
  web: {
    id: 'SOP-WEB-01',
    name: 'การโจมตีเว็บแอปพลิเคชัน',
    analysis: 'พบความพยายามอัปโหลดหรือเรียกใช้ไฟล์ที่เข้าข่าย web shell บนเว็บเซิร์ฟเวอร์',
    steps: ['ตรวจว่าไฟล์ถูกเขียนลงเซิร์ฟเวอร์หรือไม่', 'ไล่ access log ของ Source IP', 'ตรวจเวอร์ชันแอปพลิเคชันและช่องโหว่ที่เกี่ยวข้อง', 'บล็อก Source IP ที่ WAF หรือไฟร์วอลล์'],
    recommendation: 'บล็อก Source IP ลบไฟล์ที่พบ และอัปเดตแพตช์',
  },
  policy: {
    id: 'SOP-POL-05',
    name: 'การละเมิดนโยบาย',
    analysis: 'พบการกระทำที่ขัดกับนโยบายความปลอดภัยของลูกค้า',
    steps: ['ตรวจกับแผนงานเปลี่ยนแปลงของลูกค้า', 'ยืนยันผู้ดำเนินการ', 'บันทึกหลักฐานการเปลี่ยนแปลง'],
    recommendation: 'แจ้งเจ้าของนโยบาย และคืนค่าการเปลี่ยนแปลงที่ไม่ได้รับอนุมัติ',
  },
};

const KIND_LABEL: Record<SopKind, string> = {
  auth: 'Authentication',
  malware: 'Malware',
  network: 'Network',
  phish: 'Phishing',
  priv: 'Privilege abuse',
  web: 'Web attack',
  policy: 'Policy violation',
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  c: string;
  d: number;
  t: string;
  k: SopKind;
  s: Severity;
  st: Status;
  a: string | null;
  src: string;
  ago: number;
  sent?: number;
  closed?: number;
  aiDown?: boolean;
  pdfFailed?: boolean;
  missing?: string[];
  reopened?: number;
}

const ME = ME_SOC.name;

const SPECS: Spec[] = [
  { c: 'ppe', d: 0, t: 'Ransomware behaviour: mass file rename', k: 'malware', s: 'critical', st: 'new', a: null, src: 'Microsoft Defender', ago: 12.2 },
  { c: 'snk', d: 2, t: 'Multiple failed logins followed by success', k: 'auth', s: 'critical', st: 'investigating', a: ME, src: 'Securonix', ago: 11.4, aiDown: true, missing: ['geo', 'user_dept'] },
  { c: 'mnr', d: 1, t: 'Outbound traffic to known C2', k: 'network', s: 'high', st: 'investigating', a: 'กร ว.', src: 'Palo Alto', ago: 24.6 },
  { c: 'wri', d: 1, t: 'Privileged account used outside working hours', k: 'priv', s: 'critical', st: 'new', a: null, src: 'Securonix', ago: 8.1 },
  { c: 'snk', d: 0, t: 'Suspicious PowerShell encoded command', k: 'malware', s: 'high', st: 'sent', a: ME, src: 'Microsoft Defender', ago: 500, sent: 471.5 },
  { c: 'ppe', d: 1, t: 'VPN login from unusual country', k: 'auth', s: 'high', st: 'new', a: null, src: 'FortiGate', ago: 15.7 },
  { c: 'kkf', d: 0, t: 'Web shell upload attempt', k: 'web', s: 'critical', st: 'investigating', a: 'ภาคิน ท.', src: 'FortiGate', ago: 14.2, pdfFailed: true },
  { c: 'tlt', d: 1, t: 'Phishing URL clicked by user', k: 'phish', s: 'high', st: 'waiting', a: 'อรทัย ม.', src: 'Proofpoint', ago: 640, sent: 605 },
  { c: 'mnr', d: 0, t: 'New local admin account created', k: 'priv', s: 'medium', st: 'investigating', a: 'ธนพล ร.', src: 'Windows Security', ago: 41 },
  { c: 'snk', d: 3, t: 'SMB lateral movement between workstations', k: 'network', s: 'high', st: 'investigating', a: 'กร ว.', src: 'Securonix', ago: 19 },
  { c: 'wri', d: 0, t: 'Data exfiltration over DNS', k: 'network', s: 'high', st: 'sent', a: 'ภาคิน ท.', src: 'Palo Alto', ago: 300, sent: 270 },
  { c: 'ppe', d: 2, t: 'Firewall policy changed outside change window', k: 'policy', s: 'medium', st: 'waiting', a: 'อรทัย ม.', src: 'FortiGate', ago: 520, sent: 490 },
  { c: 'tlt', d: 0, t: 'Credential stuffing on e-commerce login', k: 'auth', s: 'high', st: 'new', a: null, src: 'Securonix', ago: 22 },
  { c: 'kkf', d: 1, t: 'Malware detected on endpoint: loader', k: 'malware', s: 'medium', st: 'new', a: null, src: 'Microsoft Defender', ago: 33, aiDown: true },
  { c: 'mnr', d: 2, t: 'USB mass storage on restricted host', k: 'policy', s: 'low', st: 'investigating', a: 'ธนพล ร.', src: 'Windows Security', ago: 96 },
  { c: 'snk', d: 1, t: 'Service account interactive logon', k: 'priv', s: 'medium', st: 'sent', a: ME, src: 'Windows Security', ago: 900, sent: 860, reopened: 1 },
  { c: 'wri', d: 1, t: 'Brute force on VPN gateway', k: 'auth', s: 'medium', st: 'investigating', a: 'กร ว.', src: 'Securonix', ago: 62 },
  { c: 'tlt', d: 2, t: 'POS terminal beaconing to unknown host', k: 'network', s: 'critical', st: 'investigating', a: 'ธนพล ร.', src: 'Securonix', ago: 21, missing: ['dst_port'] },
  { c: 'ppe', d: 0, t: 'Suspicious scheduled task created', k: 'malware', s: 'medium', st: 'new', a: null, src: 'Microsoft Defender', ago: 38 },
  { c: 'snk', d: 2, t: 'Large outbound transfer after hours', k: 'network', s: 'medium', st: 'waiting', a: 'อรทัย ม.', src: 'Securonix', ago: 720, sent: 690 },
  { c: 'mnr', d: 1, t: 'Remote desktop from unapproved subnet', k: 'policy', s: 'low', st: 'new', a: null, src: 'Palo Alto', ago: 130 },
  { c: 'kkf', d: 1, t: 'Phishing attachment opened', k: 'phish', s: 'high', st: 'sent', a: 'ภาคิน ท.', src: 'Proofpoint', ago: 400, sent: 372 },
  { c: 'wri', d: 0, t: 'Disabled account login attempt', k: 'auth', s: 'low', st: 'investigating', a: ME, src: 'Windows Security', ago: 180 },
  { c: 'snk', d: 0, t: 'Phishing campaign reported by staff', k: 'phish', s: 'medium', st: 'closed', a: ME, src: 'Proofpoint', ago: 2200, sent: 2181, closed: 1500 },
  { c: 'ppe', d: 1, t: 'Port scan from internal host', k: 'network', s: 'medium', st: 'closed', a: 'กร ว.', src: 'FortiGate', ago: 1800, sent: 1752, closed: 1320 },
  { c: 'tlt', d: 1, t: 'Admin login from new device', k: 'priv', s: 'low', st: 'closed', a: 'อรทัย ม.', src: 'Securonix', ago: 3100, sent: 3010, closed: 2400 },
  { c: 'mnr', d: 0, t: 'Malicious macro blocked', k: 'malware', s: 'high', st: 'closed', a: 'ธนพล ร.', src: 'Microsoft Defender', ago: 2600, sent: 2574, closed: 2300 },
];

function buildGroups(spec: Spec, code: string, r: () => number) {
  const n = (a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
  const hex = (len: number) => Array.from({ length: len }, () => n(0, 15).toString(16)).join('');
  const internalIp = `10.${n(10, 60)}.${n(1, 40)}.${n(2, 250)}`;
  const externalIp = r() > 0.5 ? `203.0.113.${n(2, 250)}` : `198.51.100.${n(2, 250)}`;
  const inbound = spec.k === 'auth' || spec.k === 'web';
  const users = ['s.kittipong', 'n.warisa', 'p.chaiwat', 'a.supansa', 't.anucha', 'k.pimchanok'];
  const geos = ['ไทย', 'สิงคโปร์', 'เนเธอร์แลนด์', 'รัสเซีย', 'ไม่ทราบตำแหน่ง'];
  const username = users[n(0, users.length - 1)];
  const hasFile = spec.k === 'malware' || spec.k === 'web' || spec.k === 'phish';
  const hostname = `${code}-${spec.k === 'web' ? 'WEB' : 'WS'}-${String(n(11, 980)).padStart(4, '0')}`;

  const groups: FieldGroup[] = [
    {
      title: 'การตรวจจับ',
      items: [
        { key: 'rule_name', label: 'Rule', value: spec.t },
        { key: 'category', label: 'ประเภท', value: KIND_LABEL[spec.k] },
        { key: 'risk_score', label: 'Risk score', value: String(n(40, 98)) },
        { key: 'event_count', label: 'จำนวน event', value: String(n(4, 860)) },
        { key: 'violation_id', label: 'Violation ID', value: `SNX-${n(100000, 999999)}` },
        { key: 'log_source', label: 'Log source', value: spec.src },
      ],
    },
    {
      title: 'เครือข่าย',
      items: [
        { key: 'src_ip', label: 'Source IP', value: inbound ? externalIp : internalIp, ioc: 'IP' },
        { key: 'dst_ip', label: 'Destination IP', value: inbound ? internalIp : externalIp, ioc: 'IP' },
        { key: 'dst_port', label: 'Destination port', value: String([443, 445, 3389, 53, 8080][n(0, 4)]) },
        { key: 'protocol', label: 'Protocol', value: ['TCP', 'UDP'][n(0, 1)] },
        { key: 'geo', label: 'ที่ตั้ง IP', value: geos[n(0, geos.length - 1)] },
      ],
    },
    {
      title: 'เครื่องและผู้ใช้',
      items: [
        { key: 'hostname', label: 'Hostname', value: hostname, ioc: 'Host' },
        { key: 'os', label: 'ระบบปฏิบัติการ', value: spec.k === 'web' ? 'Ubuntu 22.04' : 'Windows 11 23H2' },
        { key: 'username', label: 'Username', value: username },
        { key: 'user_dept', label: 'แผนกผู้ใช้', value: ['บัญชี', 'คลังสินค้า', 'ไอที', 'จัดซื้อ'][n(0, 3)] },
      ],
    },
    {
      title: 'ไฟล์',
      items: [
        { key: 'file_name', label: 'ชื่อไฟล์', value: hasFile ? ['invoice_0811.docm', 'update.ps1', 'upload.php', 'svchost32.exe'][n(0, 3)] : 'ไม่เกี่ยวข้อง' },
        { key: 'sha256', label: 'SHA-256', value: hasFile ? hex(64) : 'ไม่เกี่ยวข้อง', ioc: hasFile ? 'Hash' : undefined },
      ],
    },
  ];

  const syncable: Record<string, string> = {};
  for (const group of groups) {
    for (const item of group.items) {
      if (spec.missing?.includes(item.key)) {
        syncable[item.key] = item.value as string;
        item.value = null;
      }
    }
  }
  return { groups, syncable, username, hostname, internalIp, externalIp };
}

function buildIncident(spec: Spec, index: number): Incident {
  const customer = CUSTOMERS.find((c) => c.id === spec.c) as Customer;
  const department = customer.departments[spec.d];
  const r = seeded(index * 97 + 13);
  const id = `INC-26-${String(4812 - index * 3).padStart(5, '0')}`;
  const detectedAt = NOW - spec.ago * MIN;
  const sentAt = spec.sent ? NOW - spec.sent * MIN : null;
  const closedAt = spec.closed ? NOW - spec.closed * MIN : null;
  const built = buildGroups(spec, customer.code, r);

  const activity: Activity[] = [
    { id: `${id}-a0`, at: detectedAt + 20_000, actor: 'ระบบ', text: `สร้างเคสอัตโนมัติจาก ${spec.src} ตาม Auto Incident Policy` },
  ];
  if (spec.a) activity.push({ id: `${id}-a1`, at: detectedAt + 90_000, actor: spec.a, text: 'รับงาน' });
  if (spec.aiDown) activity.push({ id: `${id}-a2`, at: detectedAt + 40_000, actor: 'ระบบ', text: 'AI ไม่ตอบสนอง เคสนี้ต้องใช้ SOP แทน' });

  const recipients = customer.departments.filter((d) => d.autoSend).map((d) => d.name);
  if (!recipients.includes(department.name)) recipients.push(department.name);
  const deliveries = sentAt && spec.a
    ? [{ at: sentAt, by: spec.a, recipients, file: `${id}.pdf`, encrypted: customer.encryption.enabled, manual: false }]
    : [];
  if (sentAt && spec.a) {
    activity.push({ id: `${id}-a3`, at: sentAt, actor: spec.a, text: `ส่ง PDF ถึง ${recipients.join(', ')}` });
  }
  if (closedAt && spec.a) activity.push({ id: `${id}-a4`, at: closedAt, actor: spec.a, text: 'ปิดเคส และปิดบน Securonix ด้วย Token ของผู้ใช้' });

  const comments: Comment[] = [];
  const customerContact = department.contacts[0]?.name ?? 'ลูกค้า';
  if (sentAt && spec.a) {
    comments.push({
      id: `${id}-c1`,
      author: spec.a,
      side: 'soc',
      internal: false,
      at: sentAt + 60_000,
      text: `ส่งรายงานแล้ว รบกวนยืนยันว่าเครื่อง ${built.hostname} เป็นการใช้งานปกติหรือไม่`,
      attachments: [],
    });
    comments.push({
      id: `${id}-c2`,
      author: customerContact,
      side: 'customer',
      internal: false,
      at: sentAt + 34 * MIN,
      text: 'ตรวจกับผู้ใช้แล้ว ไม่ได้ทำรายการนี้ แนบรายการเครื่องที่เกี่ยวข้องมาให้',
      attachments: [{ name: 'affected_hosts.xlsx', size: '48 KB' }],
    });
    comments.push({
      id: `${id}-c3`,
      author: spec.a,
      side: 'soc',
      internal: true,
      at: sentAt + 41 * MIN,
      text: 'ลูกค้ายืนยันว่าไม่ใช่การใช้งานปกติ ไล่ต่อเครื่องในไฟล์แนบ 3 เครื่องแรกก่อน',
      attachments: [],
    });
    if (spec.st === 'waiting') {
      comments.push({
        id: `${id}-c4`,
        author: spec.a,
        side: 'soc',
        internal: false,
        at: sentAt + 44 * MIN,
        text: 'รบกวนส่ง log ของเครื่องที่เกี่ยวข้องเพิ่มเติม เพื่อสรุปเคสต่อ',
        attachments: [],
      });
    }
  }

  const pausedAt = spec.st === 'waiting' && sentAt ? sentAt + 45 * MIN : null;
  if (pausedAt && spec.a) activity.push({ id: `${id}-a5`, at: pausedAt, actor: spec.a, text: 'เปลี่ยนสถานะเป็น รอลูกค้าตอบ และหยุดนับ SLA' });

  return {
    id,
    customerId: spec.c,
    departmentId: department.id,
    title: spec.t,
    kind: spec.k,
    severity: spec.s,
    status: spec.st,
    assignee: spec.a,
    logSource: spec.src,
    detectedAt,
    sentAt,
    closedAt,
    reopened: spec.reopened ?? 0,
    pausedMs: 0,
    pausedAt,
    mttdPausedMs: 0,
    groups: built.groups,
    syncable: built.syncable,
    rawLog: JSON.stringify(
      {
        timestamp: new Date(detectedAt).toISOString(),
        source: spec.src,
        rule: spec.t,
        src_ip: built.internalIp,
        dst_ip: built.externalIp,
        user: built.username,
        host: built.hostname,
        action: 'detected',
      },
      null,
      2,
    ),
    parsedBy: index % 3 === 0 ? 'IM2' : 'SOAR',
    aiState: spec.aiDown ? 'down' : 'ok',
    sopApplied: false,
    pdf: spec.pdfFailed ? 'failed' : 'ready',
    comments,
    activity,
    deliveries,
  };
}

export const INCIDENTS: Incident[] = SPECS.map(buildIncident);

export const IOCS: Ioc[] = [
  { id: 'ioc-1', type: 'IP', value: '203.0.113.87', customerId: 'mnr', incidentId: 'INC-26-04806', by: 'กร ว.', at: NOW - 58 * MIN },
  { id: 'ioc-2', type: 'Hash', value: '9f2c4e7ab1d06c3e58a4f0b7d2e91c6a4471be0d3fa8c25e7b60d19c4ea3f712', customerId: 'snk', incidentId: 'INC-26-04800', by: ME, at: NOW - 410 * MIN },
  { id: 'ioc-3', type: 'Host', value: 'WRI-WS-0231', customerId: 'wri', incidentId: 'INC-26-04782', by: 'ภาคิน ท.', at: NOW - 760 * MIN },
  { id: 'ioc-4', type: 'IP', value: '198.51.100.44', customerId: 'tlt', incidentId: 'INC-26-04791', by: 'อรทัย ม.', at: NOW - 1320 * MIN },
];

/* Event rate leading up to detection, for the waveform on the case summary. */
export function eventWave(id: string, bars = 56): number[] {
  const seed = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const r = seeded(seed);
  const peak = bars - 6 - Math.floor(r() * 8);
  return Array.from({ length: bars }, (_, i) => {
    const distance = Math.abs(i - peak);
    return Math.min(1, 0.06 + r() * 0.16 + Math.exp(-(distance * distance) / 18) * (0.55 + r() * 0.35));
  });
}

/* Cases per hour over the last 24 hours, one row per customer. */
export function hourlyLoad(customerIds: string[]): { customerId: string; hours: number[] }[] {
  const hour = new Date(NOW).getHours();
  return customerIds.map((customerId, c) => ({
    customerId,
    hours: Array.from({ length: 24 }, (_, i) => {
      const clock = (hour - 23 + i + 24) % 24;
      const r = seeded(c * 97 + clock * 13 + 3);
      const office = clock >= 8 && clock <= 19 ? 1 : 0.35;
      return Math.round((1 + r() * 4) * office + (r() > 0.88 ? 3 : 0));
    }),
  }));
}

export interface WeekPoint {
  label: string;
  counts: Record<Severity, number>;
}

export function weeklyCounts(customerIds: string[], weeks = 8): WeekPoint[] {
  const points: WeekPoint[] = [];
  const weekMs = 7 * 86400000;
  for (let i = weeks - 1; i >= 0; i--) {
    const r = seeded(i * 71 + customerIds.length * 13 + 5);
    const scale = Math.max(1, customerIds.length);
    const n = (base: number) => Math.round(base * scale * (0.6 + r() * 0.8));
    const start = new Date(NOW - i * weekMs);
    points.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, counts: { critical: n(1), high: n(3), medium: n(5), low: n(4) } });
  }
  return points;
}

/* Daily averages per customer for the KPI chart. */
export interface DayPoint {
  day: number;
  mttd: number;
  mttr: number;
  mttdTarget: number;
  mttrTarget: number;
}

export function trendFor(customerIds: string[], days: number): DayPoint[] {
  const picked = CUSTOMERS.filter((c) => customerIds.includes(c.id));
  const dayMs = 86400000;
  const today = new Date(NOW);
  today.setHours(0, 0, 0, 0);
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    let mttd = 0;
    let mttr = 0;
    let mttdTarget = 0;
    let mttrTarget = 0;
    /* Busy days hit every customer at once, so the combined line still shows them. */
    const dayRandom = seeded(i * 53 + 7);
    const load = 1 + Math.sin(i / 2.6) * 0.16 + (dayRandom() > 0.82 ? 0.42 : 0);
    for (const customer of picked) {
      const r = seeded(i * 31 + customer.code.charCodeAt(0) * 7 + customer.code.charCodeAt(2));
      mttd += customer.kpi.mttd * load * (0.86 + r() * 0.28);
      mttr += customer.kpi.mttr * load * (0.84 + r() * 0.32);
      mttdTarget += (customer.sla.critical.mttd + customer.sla.high.mttd) / 2;
      mttrTarget += (customer.sla.critical.mttr + customer.sla.high.mttr) / 2;
    }
    const count = Math.max(1, picked.length);
    points.push({
      day: today.getTime() - i * dayMs,
      mttd: mttd / count,
      mttr: mttr / count,
      mttdTarget: mttdTarget / count,
      mttrTarget: mttrTarget / count,
    });
  }
  return points;
}
