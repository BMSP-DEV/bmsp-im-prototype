import { Building2, ChevronsUpDown, Keyboard, Moon, Search, Sun } from 'lucide-react';
import { fmtTime, navigate, slaOf, useNow } from './lib';
import { APP_VERSION, CUSTOMER_VIEW_ID } from './mock';
import { useStore } from './store';
import { ICON, ICON_SM, Keycap, Popover, Tile } from './ui';

/* Which customers the whole app is looking at. Always in the same place, always visible. */
function TenantSwitcher() {
  const { customers, incidents, scope, setScope } = useStore();
  const now = useNow(5000);
  const selected = scope ?? customers.map((c) => c.id);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setScope(next.length === customers.length || next.length === 0 ? null : next);
  };
  const names = customers.filter((c) => selected.includes(c.id));
  const label = scope === null ? 'ทุกลูกค้า' : names.length === 1 ? names[0].name : `${names.length} จาก ${customers.length} ราย`;

  return (
    <Popover
      width={320}
      trigger={(open, flip) => (
        <button className="tenant-pill" aria-expanded={open} onClick={flip}>
          {names.length === 1 ? (
            <Tile code={names[0].code} size="sm" />
          ) : (
            <span className="tenant-pill-mark">
              <Building2 {...ICON_SM} />
            </span>
          )}
          <span className="tenant-pill-name">{label}</span>
          <span className="sub">SOC</span>
          <ChevronsUpDown {...ICON_SM} className="muted" />
        </button>
      )}
    >
      <ul className="menu">
        {customers.map((c) => {
          const open = incidents.filter((i) => i.customerId === c.id && i.status !== 'closed');
          const risk = open.filter((i) => {
            const level = slaOf(i, c, now).level;
            return level === 'bad' || level === 'warn';
          }).length;
          return (
            <li key={c.id}>
              <label className="menu-row">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                <Tile code={c.code} size="sm" />
                <span className="menu-label">{c.name}</span>
                <span className={`num ${risk ? 'text-warn' : 'muted'}`} title={`เกินหรือใกล้หมด ${risk} จาก ${open.length} เคส`}>
                  {risk}/{open.length}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="menu-foot spread">
        <span className="muted">ใกล้หมด SLA / เปิดอยู่</span>
        <button className="link" onClick={() => setScope(null)}>
          เลือกทั้งหมด
        </button>
      </div>
    </Popover>
  );
}

function LiveClock() {
  const now = useNow(1000);
  return (
    <span className="live-clock" title="เวลาปัจจุบัน">
      <i aria-hidden="true" />
      {fmtTime(now, true)}
    </span>
  );
}

export function Topbar() {
  const { role, setRole, me, theme, setTheme, setPaletteOpen, customers, shortcuts, setShortcuts } = useStore();
  const own = customers.find((c) => c.id === CUSTOMER_VIEW_ID);
  return (
    <header className="topbar">
      {role === 'soc' ? (
        <TenantSwitcher />
      ) : (
        <div className="tenant-pill is-static">
          {own && <Tile code={own.code} size="sm" />}
          <span className="tenant-pill-name">{own?.name}</span>
        </div>
      )}
      <div className="topbar-right">
        <LiveClock />
        <button className="searchbox" onClick={() => setPaletteOpen(true)} aria-label="ค้นหาและคำสั่ง">
          <Search {...ICON} className="muted" />
          <span>ค้นหาเคส IP Hash</span>
          <Keycap>Ctrl K</Keycap>
        </button>
        <Popover
          align="right"
          width={248}
          trigger={(open, flip) => (
            <button className="topbar-user" aria-expanded={open} aria-label={`บัญชี ${me.name}`} onClick={flip}>
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
              <button className="menu-row" role="switch" aria-checked={shortcuts} onClick={() => setShortcuts(!shortcuts)}>
                <Keyboard {...ICON} />
                <span className="menu-label">ปุ่มลัด J K A S /</span>
                <span className="muted">{shortcuts ? 'เปิด' : 'ปิด'}</span>
              </button>
              <div className="menu-foot muted mono">{APP_VERSION}</div>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
