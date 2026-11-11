import { Building2, FileText, Gauge, Inbox, LayoutTemplate, ShieldAlert, Table2, Terminal, Users, Workflow, Zap } from 'lucide-react';
import { slaOf, useNow } from './lib';
import { useStore } from './store';
import { ICON } from './ui';

function Mark() {
  /* The product mark is the SLA fuse: time used and time left. */
  return (
    <span className="rail-logo" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <rect x="3" y="6" width="18" height="4" rx="2" fill="currentColor" opacity="0.55" />
        <rect x="3" y="14" width="11" height="4" rx="2" fill="currentColor" />
      </svg>
    </span>
  );
}

const MAIN = [
  { to: 'work', label: 'งาน', icon: Inbox, soc: false },
  { to: 'cases', label: 'เคส', icon: Table2, soc: false },
  { to: 'sla', label: 'SLA', icon: Gauge, soc: false },
  { to: 'customers', label: 'ลูกค้า', icon: Building2, soc: true },
  /* Set-up work for a desk, so it stays off the phone's bottom bar. */
  { to: 'templates', label: 'Template', icon: LayoutTemplate, soc: true, desktop: true },
  { to: 'ioc', label: 'IoC', icon: ShieldAlert, soc: true },
];

const LATER = [
  { label: 'นโยบาย', full: 'Auto Incident Policy', icon: Zap },
  { label: 'รายงาน', full: 'รายงาน', icon: FileText },
  { label: 'Flow', full: 'Flow Status', icon: Workflow },
  { label: 'สิทธิ์', full: 'บัญชีและสิทธิ์', icon: Users },
  { label: 'ระบบ', full: 'Admin Console', icon: Terminal },
];

export function Rail({ page }: { page: string }) {
  const { role, visible, customerOf, toast } = useStore();
  const now = useNow(5000);
  const breached = visible.filter((i) => i.status !== 'closed' && slaOf(i, customerOf(i.customerId), now).level === 'bad').length;

  return (
    <nav className="rail" aria-label="เมนูหลัก">
      <Mark />
      <div className="rail-group">
        {MAIN.filter((item) => role === 'soc' || !item.soc).map((item) => (
          <a key={item.to} href={`#/${item.to}`} className={`rail-item ${page === item.to ? 'is-active' : ''} ${'desktop' in item ? 'rail-desktop' : ''}`} aria-current={page === item.to ? 'page' : undefined}>
            <item.icon {...ICON} />
            <span>{item.label}</span>
            {item.to === 'work' && breached > 0 && (
              <b className="rail-badge" title={`เกิน SLA ${breached} เคส`}>
                {breached}
              </b>
            )}
          </a>
        ))}
      </div>

      {role === 'soc' && (
        <div className="rail-group rail-later" role="group" aria-label="รอบถัดไป ยังไม่เปิดใช้">
          <span className="rail-caption" aria-hidden="true">
            ถัดไป
          </span>
          {LATER.map((item) => (
            <button key={item.label} className="rail-item" aria-disabled="true" title={`${item.full} อยู่ในรอบถัดไป`} onClick={() => toast(`${item.full} อยู่ในรอบถัดไป`)}>
              <item.icon {...ICON} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
