import { Building2, FileText, Gauge, Inbox, Moon, Search, ShieldAlert, Sun, Table2, Terminal, Users, Workflow, Zap } from 'lucide-react';
import { navigate, slaOf, useNow } from './lib';
import { APP_VERSION } from './mock';
import { useStore } from './store';
import { ICON, Popover } from './ui';

function Mark() {
  /* The product mark is the SLA fuse: time used and time left. */
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="4" rx="2" fill="var(--text-3)" />
      <rect x="3" y="14" width="11" height="4" rx="2" fill="var(--accent)" />
    </svg>
  );
}

const MAIN = [
  { to: 'work', label: 'งาน', icon: Inbox, soc: false },
  { to: 'cases', label: 'เคส', icon: Table2, soc: false },
  { to: 'sla', label: 'SLA', icon: Gauge, soc: false },
  { to: 'customers', label: 'ลูกค้า', icon: Building2, soc: true },
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
  const { role, setRole, me, theme, setTheme, visible, customerOf, toast, setPaletteOpen } = useStore();
  const now = useNow(5000);
  const breached = visible.filter((i) => i.status !== 'closed' && slaOf(i, customerOf(i.customerId), now).level === 'bad').length;

  return (
    <nav className="rail" aria-label="เมนูหลัก">
      <div className="rail-brand" title={APP_VERSION}>
        <Mark />
      </div>

      <button className="rail-item rail-search" onClick={() => setPaletteOpen(true)} title="ค้นหาและคำสั่ง Ctrl K">
        <Search {...ICON} />
        <span>ค้นหา</span>
      </button>

      <div className="rail-group">
        {MAIN.filter((item) => role === 'soc' || !item.soc).map((item) => (
          <a key={item.to} href={`#/${item.to}`} className={`rail-item ${page === item.to ? 'is-active' : ''}`} aria-current={page === item.to ? 'page' : undefined}>
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
        <div className="rail-group rail-later" aria-label="รอบถัดไป">
          {LATER.map((item) => (
            <button key={item.label} className="rail-item" title={`${item.full} อยู่ในรอบถัดไป`} onClick={() => toast(`${item.full} อยู่ในรอบถัดไป`)}>
              <item.icon {...ICON} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rail-foot">
        <Popover
          place="side"
          width={248}
          trigger={(open, flip) => (
            <button className="rail-user" aria-expanded={open} aria-label={`บัญชี ${me.name}`} onClick={flip}>
              <span className="avatar">{me.name.charAt(0)}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu-identity">
                <span>{me.name}</span>
                <span className="muted">{me.title}</span>
              </div>
              <div className="menu-sep" />
              <div className="menu-head">ดูในมุมของ</div>
              <button
                className={`menu-row ${role === 'soc' ? 'is-active' : ''}`}
                onClick={() => {
                  setRole('soc');
                  close();
                  navigate('/work');
                }}
              >
                SOC analyst
              </button>
              <button
                className={`menu-row ${role === 'customer' ? 'is-active' : ''}`}
                onClick={() => {
                  setRole('customer');
                  close();
                  navigate('/work');
                }}
              >
                ลูกค้า ศรีนคร โลจิสติกส์
              </button>
              <div className="menu-sep" />
              <button className="menu-row" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
                {theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
              </button>
              <div className="menu-foot muted mono">{APP_VERSION}</div>
            </div>
          )}
        </Popover>
      </div>
    </nav>
  );
}
