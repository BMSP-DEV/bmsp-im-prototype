import { useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { fmtMinutes, navigate, SEVERITY_ORDER } from '../lib';
import { ENCRYPTION_RULES, REPORT_TEMPLATES } from '../mock';
import { useStore } from '../store';
import { Field, ICON, Segmented, SevTag, Sheet, Tile, Toggle } from '../ui';
import type { Customer, Department, Severity, SlaTarget } from '../types';

export function CustomersPage({ customerId }: { customerId?: string }) {
  const { customers, incidents, setScope } = useStore();
  const customer = customers.find((c) => c.id === customerId) ?? customers[0];
  const openOf = (id: string) => incidents.filter((i) => i.customerId === id && i.status !== 'closed').length;

  return (
    <div className="split">
      <aside className="split-list" aria-label="รายชื่อลูกค้า">
        <header className="page-head">
          <h1>ลูกค้า</h1>
          <span className="num muted">{customers.length}</span>
        </header>
        <nav className="split-nav">
          {customers.map((c) => (
            <a key={c.id} href={`#/customers/${c.id}`} className={`cust-row ${c.id === customer.id ? 'is-active' : ''}`} aria-current={c.id === customer.id ? 'true' : undefined}>
              <Tile code={c.code} />
              <span className="tenant-cell-text">
                <span className="ellipsis">{c.name}</span>
                <span className="sub">Partner {c.partner}</span>
              </span>
              <span className="num muted" title="เคสที่เปิดอยู่">
                {openOf(c.id)}
              </span>
            </a>
          ))}
        </nav>
      </aside>

      <section className="split-detail">
        <div className="settings">
          <header className="settings-head">
            <Tile code={customer.code} size="lg" />
            <div className="tenant-cell-text">
              <h2>{customer.name}</h2>
              <span className="sub">
                Partner {customer.partner} · เปิดอยู่ {openOf(customer.id)} เคส
              </span>
            </div>
            <button
              className="btn"
              onClick={() => {
                setScope([customer.id]);
                navigate('/work');
              }}
            >
              <Inbox {...ICON} className="muted" />
              ดูคิวของลูกค้านี้
            </button>
          </header>

          <Departments key={`d-${customer.id}`} customer={customer} />
          <SlaTable key={`s-${customer.id}`} customer={customer} />
          <DeliverySettings key={`m-${customer.id}`} customer={customer} />
        </div>
      </section>
    </div>
  );
}

function Departments({ customer }: { customer: Customer }) {
  const { updateCustomer, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const setAuto = (id: string, autoSend: boolean) => updateCustomer(customer.id, (c) => ({ ...c, departments: c.departments.map((d) => (d.id === id ? { ...d, autoSend } : d)) }));

  return (
    <section className="panel panel-flush" aria-label="หน่วยงานและผู้รับ">
      <div className="panel-head panel-pad">
        <div>
          <h3>หน่วยงานและผู้รับ</h3>
          <p className="sub">หน่วยงานที่รับทุกเคสจะถูกเลือกไว้ให้ตอนส่ง และเลือกเพิ่มหรือลดได้ในแต่ละเคส</p>
        </div>
        <button className="btn btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={1.75} className="muted" />
          เพิ่มหน่วยงาน
        </button>
      </div>
      <div className="table-scroll">
        <table className="tbl tbl-static">
          <thead>
            <tr>
              <th>หน่วยงาน</th>
              <th>ประเภท</th>
              <th>ผู้รับเมล</th>
              <th>รับทุกเคส</th>
            </tr>
          </thead>
          <tbody>
            {customer.departments.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>
                  <span className="type-tag">{d.type}</span>
                </td>
                <td className="cell-wrap">
                  {d.contacts.map((c) => (
                    <span className="contact" key={c.email}>
                      {c.name} <span className="mono muted">{c.email}</span>
                    </span>
                  ))}
                </td>
                <td>
                  <Toggle checked={d.autoSend} onChange={(v) => setAuto(d.id, v)} label={`${d.name} รับทุกเคส`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && (
        <AddDepartment
          onClose={() => setAdding(false)}
          onAdd={(dept) => {
            updateCustomer(customer.id, (c) => ({ ...c, departments: [...c.departments, dept] }));
            toast(`เพิ่ม ${dept.name} แล้ว`);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function AddDepartment({ onClose, onAdd }: { onClose: () => void; onAdd: (d: Department) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Department['type']>('Group');
  const [emails, setEmails] = useState('');
  const list = emails.split(/[\s,]+/).filter(Boolean);
  return (
    <Sheet
      title="เพิ่มหน่วยงาน"
      width={480}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary btn-lg"
          disabled={!name.trim() || !list.length}
          onClick={() => onAdd({ id: `dept-${Date.now()}`, name: name.trim(), type, autoSend: false, contacts: list.map((email) => ({ name: email.split('@')[0], email })) })}
        >
          เพิ่มหน่วยงาน
        </button>
      }
    >
      <div className="form">
        <Field label="ชื่อหน่วยงาน">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="ประเภท">
          <Segmented
            label="ประเภทหน่วยงาน"
            value={type}
            onChange={setType}
            options={[
              { id: 'Group', label: 'Group' },
              { id: 'Branch', label: 'Branch' },
            ]}
          />
        </Field>
        <Field label="อีเมลผู้รับ" hint="คั่นด้วยเครื่องหมายจุลภาค หรือขึ้นบรรทัดใหม่">
          <textarea className="input mono" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function SlaTable({ customer }: { customer: Customer }) {
  const { updateCustomer } = useStore();
  const set = (severity: Severity, key: keyof SlaTarget, value: number) => updateCustomer(customer.id, (c) => ({ ...c, sla: { ...c.sla, [severity]: { ...c.sla[severity], [key]: value } } }));

  return (
    <section className="panel panel-flush" aria-label="SLA">
      <div className="panel-head panel-pad">
        <div>
          <h3>SLA</h3>
          <p className="sub">MTTD นับจาก Detect ถึงส่งเมล และ MTTR นับจากส่งเมลถึงปิดเคส โดยไม่นับช่วงรอลูกค้าตอบ</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="tbl tbl-static">
          <thead>
            <tr>
              <th>ระดับ</th>
              <th>MTTD (นาที)</th>
              <th />
              <th>MTTR (นาที)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SEVERITY_ORDER.map((severity) => {
              const target = customer.sla[severity];
              return (
                <tr key={severity}>
                  <td>
                    <SevTag severity={severity} />
                  </td>
                  <td>
                    <input className="input input-num mono" type="number" min={1} aria-label={`MTTD ${severity}`} value={target.mttd} onChange={(e) => set(severity, 'mttd', Math.max(1, Number(e.target.value)))} />
                  </td>
                  <td className="muted">{fmtMinutes(target.mttd)}</td>
                  <td>
                    <input className="input input-num mono" type="number" min={1} aria-label={`MTTR ${severity}`} value={target.mttr} onChange={(e) => set(severity, 'mttr', Math.max(1, Number(e.target.value)))} />
                  </td>
                  <td className="muted">{fmtMinutes(target.mttr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Requirement 3: everything about sending a case lives in this one block. */
function DeliverySettings({ customer }: { customer: Customer }) {
  const { updateCustomer } = useStore();
  const options = (current: string) => Array.from(new Set([current, ...REPORT_TEMPLATES]));
  const [opening, setOpening] = useState(`เรียน ทีมงาน ${customer.name}\nSOC ตรวจพบเหตุการณ์ตามรายละเอียดด้านล่าง`);

  return (
    <section className="panel" aria-label="การส่งเคส">
      <div className="panel-head">
        <h3>การส่งเคส</h3>
      </div>

      <div className="setting">
        <div className="setting-head">
          <div>
            <h4>เข้ารหัสไฟล์ PDF</h4>
            <p className="sub">{customer.encryption.enabled ? 'ส่งเคสเป็น PDF เข้ารหัสตามกติกาด้านล่าง' : 'PDF ของลูกค้านี้จะถูกส่งโดยไม่เข้ารหัส'}</p>
          </div>
          <Toggle checked={customer.encryption.enabled} label="เข้ารหัสไฟล์ PDF" onChange={(enabled) => updateCustomer(customer.id, (c) => ({ ...c, encryption: { ...c.encryption, enabled } }))} />
        </div>
        {customer.encryption.enabled && (
          <div className="form-2">
            <Field label="รูปแบบรหัสผ่าน">
              <select className="input" value={customer.encryption.rule} onChange={(e) => updateCustomer(customer.id, (c) => ({ ...c, encryption: { ...c.encryption, rule: e.target.value } }))}>
                {ENCRYPTION_RULES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="วิธีเข้ารหัส">
              <input className="input" value="AES-256" readOnly />
            </Field>
          </div>
        )}
      </div>

      <div className="setting">
        <div className="setting-head">
          <div>
            <h4>Template เมล</h4>
            <p className="sub">{customer.emailTemplate === 'default' ? 'ดึงตารางจาก Incident report มาใส่ในเมลให้อัตโนมัติ' : 'ข้อความเปิดของลูกค้านี้ ต่อด้วยตารางจาก Incident report'}</p>
          </div>
          <Segmented
            label="Template เมล"
            value={customer.emailTemplate}
            onChange={(emailTemplate) => updateCustomer(customer.id, (c) => ({ ...c, emailTemplate }))}
            options={[
              { id: 'default', label: 'Default' },
              { id: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {customer.emailTemplate === 'custom' && (
          <Field label="ข้อความเปิด">
            <textarea className="input" rows={3} value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
        )}
      </div>

      <div className="setting">
        <div className="setting-head">
          <div>
            <h4>Template รายงานตาม Log source</h4>
            <p className="sub">Partner {customer.partner}</p>
          </div>
        </div>
        <table className="tbl tbl-plain">
          <tbody>
            {customer.reportTemplates.map((row) => (
              <tr key={row.logSource}>
                <td>{row.logSource}</td>
                <td className="cell-right">
                  <select
                    className="input input-inline"
                    aria-label={`Template ของ ${row.logSource}`}
                    value={row.template}
                    onChange={(e) => updateCustomer(customer.id, (c) => ({ ...c, reportTemplates: c.reportTemplates.map((t) => (t.logSource === row.logSource ? { ...t, template: e.target.value } : t)) }))}
                  >
                    {options(row.template).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
