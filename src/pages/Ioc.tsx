import { ChevronRight } from 'lucide-react';
import { fmtDateTime, navigate, useMemory } from '../lib';
import { useStore } from '../store';
import { EmptyState, ICON, MultiMenu, Person, TenantCell } from '../ui';
import type { Ioc } from '../types';

export function IocPage() {
  const { iocs, customers, customerOf, removeIoc, restoreIoc, updateIncident, toast } = useStore();
  /* A value isolated by mistake can be taken out; the case history keeps both steps. */
  const remove = (item: Ioc) => {
    const short = item.value.length > 22 ? `${item.value.slice(0, 22)}…` : item.value;
    removeIoc(item.id);
    updateIncident(item.incidentId, (x) => x, `นำ ${short} ออกจาก IoC`);
    toast(`นำ ${short} ออกจาก IoC แล้ว`, () => {
      restoreIoc(item);
      updateIncident(item.incidentId, (x) => x, `คืน ${short} เข้า IoC`);
    });
  };
  const [types, setTypes] = useMemory<string[]>('ioc:types', []);
  const [customerIds, setCustomerIds] = useMemory<string[]>('ioc:customers', []);
  const [text, setText] = useMemory('ioc:text', '');
  const q = text.trim().toLowerCase();
  const rows = iocs
    .filter((i) => !customerIds.length || customerIds.includes(i.customerId))
    .filter((i) => !types.length || types.includes(i.type))
    .filter((i) => !q || `${i.value} ${i.incidentId}`.toLowerCase().includes(q));

  return (
    <div className="page">
      <header className="page-head">
        <h1>IoC</h1>
        <span className="num muted">{rows.length}</span>
      </header>
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="visually-hidden" htmlFor="ioc-text">
            ค้นหา IoC
          </label>
          <input id="ioc-text" className="input input-search" placeholder="ค้นหาค่าหรือเลขเคส" value={text} onChange={(e) => setText(e.target.value)} />
          <MultiMenu label="ประเภท" selected={types} onChange={setTypes} options={['IP', 'Hash', 'Host'].map((t) => ({ value: t, label: t }))} />
          <MultiMenu label="ลูกค้า" selected={customerIds} onChange={setCustomerIds} options={customers.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl tbl-list">
          <thead>
            <tr>
              <th>ประเภท</th>
              <th className="cell-title">ค่า</th>
              <th className="col-customer">ลูกค้า</th>
              <th>เคสต้นทาง</th>
              <th className="col-assignee">เพิ่มโดย</th>
              <th className="col-detected">เมื่อ</th>
              <th aria-label="คำสั่ง" />
              <th className="cell-chevron" aria-label="เปิดเคส" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} onClick={() => navigate(`/case/${i.incidentId}`)}>
                <td>
                  <span className="type-tag">{i.type}</span>
                </td>
                <td className="cell-title">
                  <span className="mono ellipsis title-text" title={i.value}>
                    {i.value}
                  </span>
                </td>
                <td className="col-customer">
                  <TenantCell customer={customerOf(i.customerId)} />
                </td>
                <td>
                  <a className="mono row-link" href={`#/case/${i.incidentId}`} onClick={(e) => e.stopPropagation()}>
                    {i.incidentId}
                  </a>
                </td>
                <td className="col-assignee">
                  <Person name={i.by} />
                </td>
                <td className="col-detected mono muted">{fmtDateTime(i.at)}</td>
                <td className="cell-right">
                  <button
                    className="btn btn-sm"
                    aria-label={`นำ ${i.value} ออกจาก IoC`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(i);
                    }}
                  >
                    นำออก
                  </button>
                </td>
                <td className="cell-chevron">
                  <ChevronRight {...ICON} className="muted" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="ไม่มี IoC ตามเงื่อนไขนี้" />}
      </div>
    </div>
  );
}
