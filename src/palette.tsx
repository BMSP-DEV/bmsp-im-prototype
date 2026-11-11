import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { navigate, slaBand, slaOf } from './lib';
import { useStore } from './store';
import { ICON, Keycap, SevTag, Tile, useLayerFocus } from './ui';

interface Item {
  id: string;
  group: string;
  label: ReactNode;
  meta?: ReactNode;
  run: () => void;
}

/* Keeps Tab inside the palette and hands focus back to where it was when the palette closes. */
function PaletteFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayerFocus(ref, onClose);
  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="ค้นหาและคำสั่ง" tabIndex={-1} ref={ref}>
      {children}
    </div>
  );
}

/* One box to reach any case, IP, hash, customer or page. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, visible, customers, iocs, customerOf, role, theme, setTheme, setScope } = useStore();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => setPaletteOpen(false);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setActive(0);
      inputRef.current?.focus();
    }
  }, [paletteOpen]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const open = (path: string) => () => {
      navigate(path);
      setPaletteOpen(false);
    };

    const cases = visible
      .filter((inc) => {
        if (!q) return inc.status !== 'closed';
        const c = customerOf(inc.customerId);
        const hay = [inc.id, inc.title, c.code, c.name, ...inc.groups.flatMap((g) => g.items.map((f) => f.value ?? ''))].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const rank = (i: typeof a) => {
          const s = slaOf(i, customerOf(i.customerId), now);
          return slaBand(s) * 1e14 + s.remaining;
        };
        return rank(a) - rank(b);
      })
      .slice(0, q ? 8 : 5)
      .map<Item>((inc) => ({
        id: inc.id,
        group: q ? 'เคส' : 'เคสเร่งด่วน',
        label: inc.title,
        meta: (
          <>
            <SevTag severity={inc.severity} />
            <Tile code={customerOf(inc.customerId).code} size="sm" />
          </>
        ),
        run: open(`/work/${inc.id}`),
      }));

    const iocItems =
      role === 'soc' && q
        ? iocs
            .filter((i) => i.value.toLowerCase().includes(q))
            .slice(0, 4)
            .map<Item>((i) => ({ id: i.id, group: 'IoC', label: <span className="mono">{i.value}</span>, meta: <Tile code={customerOf(i.customerId).code} size="sm" />, run: open(`/work/${i.incidentId}`) }))
        : [];

    const customerItems =
      role === 'soc'
        ? customers
            .filter((c) => q && `${c.code} ${c.name}`.toLowerCase().includes(q))
            .map<Item>((c) => ({
              id: c.id,
              group: 'ดูคิวของลูกค้า',
              label: c.name,
              meta: <Tile code={c.code} size="sm" />,
              run: () => {
                setScope([c.id]);
                open('/work')();
              },
            }))
        : [];

    const pages: [string, string][] = [
      ['/work', 'ไปหน้างาน'],
      ['/cases', 'ไปหน้าเคสทั้งหมด'],
      ['/sla', 'ไปหน้า SLA และ KPI'],
      ...(role === 'soc' ? ([['/customers', 'ไปหน้าลูกค้า'], ['/templates', 'ไปหน้า Template รายงานและเมล'], ['/ioc', 'ไปหน้า IoC']] as [string, string][]) : []),
    ];
    const commands = [
      ...pages.map<Item>(([path, label]) => ({ id: path, group: 'คำสั่ง', label, run: open(path) })),
      {
        id: 'theme',
        group: 'คำสั่ง',
        label: theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด',
        run: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          close();
        },
      },
    ].filter((c) => !q || String(c.label).toLowerCase().includes(q));

    return [...cases, ...iocItems, ...customerItems, ...commands];
    // close is recreated each render but only calls a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visible, customers, iocs, customerOf, role, theme, setTheme, setScope, setPaletteOpen]);

  useEffect(() => setActive(0), [query]);

  if (!paletteOpen) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === 'Enter') items[active]?.run();
    if (e.key === 'Escape') close();
  };

  let previousGroup = '';

  return createPortal(
    <div className="sheet-layer palette-layer" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <PaletteFrame onClose={close}>
        <div className="palette-input">
          <Search {...ICON} className="muted" />
          <input
            ref={inputRef}
            placeholder="ค้นหาเคส IP Hash ผู้ใช้ ลูกค้า หรือคำสั่ง"
            aria-label="ค้นหา"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `palette-opt-${active}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <Keycap>Esc</Keycap>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" aria-label="ผลลัพธ์">
          {items.length === 0 && <li className="palette-empty">ไม่พบผลลัพธ์สำหรับ “{query}”</li>}
          {items.map((item, index) => {
            const showGroup = item.group !== previousGroup;
            previousGroup = item.group;
            return (
              <li key={`${item.group}-${item.id}`} role="presentation">
                {showGroup && <div className="palette-group">{item.group}</div>}
                <button id={`palette-opt-${index}`} tabIndex={-1} role="option" aria-selected={index === active} className={`palette-item ${index === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={item.run}>
                  <span className="ellipsis palette-label">{item.label}</span>
                  {item.meta && <span className="palette-meta">{item.meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </PaletteFrame>
    </div>,
    document.body,
  );
}
