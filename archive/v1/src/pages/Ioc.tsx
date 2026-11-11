import { fmtDateTime, navigate, useMemory } from '../lib';
import { Topbar } from '../shell';
import { useStore } from '../store';
import { MultiMenu, Person, TenantCell } from '../ui';

export function IocPage() {
  const { iocs, customerOf, scope, query } = useStore();
  const [types, setTypes] = useMemory<string[]>('ioc:types', []);
  const q = query.trim().toLowerCase();
  const rows = iocs
    .filter((i) => !scope || scope.includes(i.customerId))
    .filter((i) => !types.length || types.includes(i.type))
    .filter((i) => !q || `${i.value} ${i.incidentId}`.toLowerCase().includes(q));

  return (
    <>
      <Topbar title="IoC" />
      <div className="queue">
        <div className="toolbar">
          <div className="toolbar-left">
            <MultiMenu
              label="ประเภท"
              selected={types}
              onChange={setTypes}
              options={['IP', 'Hash', 'Host'].map((t) => ({ value: t, label: t }))}
            />
          </div>
          <span className="muted">
            <span className="num">{rows.length}</span> รายการ
          </span>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const customer = customerOf(i.customerId);
                return (
                  <tr key={i.id} onClick={() => navigate(`/incident/${i.incidentId}`)}>
                    <td>
                      <span className="code">{i.type}</span>
                    </td>
                    <td className="cell-title">
                      <span className="mono ellipsis title-text" title={i.value}>
                        {i.value}
                      </span>
                    </td>
                    <td className="col-customer">
                      <TenantCell customer={customer} />
                    </td>
                    <td className="mono muted">{i.incidentId}</td>
                    <td className="col-assignee">
                      <Person name={i.by} />
                    </td>
                    <td className="col-detected mono muted">{fmtDateTime(i.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty">
              <p>ไม่มี IoC ตามเงื่อนไขนี้</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
