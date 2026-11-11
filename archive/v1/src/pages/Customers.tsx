import { useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { fmtMinutes, navigate, SEVERITY_ORDER, useMemory } from '../lib';
import { ENCRYPTION_RULES, REPORT_TEMPLATES } from '../mock';
import { Topbar } from '../shell';
import { useStore } from '../store';
import { Field, ICON, Segmented, SevTag, Sheet, Tabs, Toggle } from '../ui';
import type { Customer, Department, Severity, SlaTarget } from '../types';

type Tab = 'departments' | 'sla' | 'delivery';

export function CustomersPage({ customerId }: { customerId?: string }) {
  const { customers, incidents, setScope } = useStore();
  const customer = customers.find((c) => c.id === customerId) ?? customers[0];
  const [tab, setTab] = useMemory<Tab>('customers:tab', 'departments');
  const openOf = (id: string) => incidents.filter((i) => i.customerId === id && i.status !== 'closed').length;

  return (
    <>
      <Topbar title="ลูกค้า" scope={false} />
      <div className="cust">
        <aside className="cust-list" aria-label="รายชื่อลูกค้า">
          {customers.map((c) => (
            <a key={c.id} href={`#/customers/${c.id}`} className={`cust-row ${c.id === customer.id ? 'is-active' : ''}`}>
              <span className="tile">{c.code}</span>
              <span className="cust-row-text">
                <span className="ellipsis">{c.name}</span>
                <span className="muted">Partner {c.partner}</span>
              </span>
              <span className="num muted" title="เคสที่เปิดอยู่">
                {openOf(c.id)}
              </span>
            </a>
          ))}
        </aside>

        <section className="cust-detail">
          <div className="cust-head">
            <div className="tenant">
              <span className="code code-lg">{customer.code}</span>
              <h1>{customer.name}</h1>
              <span className="tenant-meta">Partner {customer.partner}</span>
            </div>
            <button
              className="btn"
              onClick={() => {
                setScope([customer.id]);
                navigate('/queue');
              }}
            >
              <Inbox {...ICON} className="muted" />
              ดูคิวของลูกค้านี้
            </button>
          </div>

          <Tabs
            tabs={[
              { id: 'departments', label: 'หน่วยงานและผู้รับ', count: customer.departments.length },
              { id: 'sla', label: 'SLA' },
              { id: 'delivery', label: 'การส่งเคส' },
            ]}
            value={tab}
            onChange={setTab}
          />

          <div className="cust-body">
            {tab === 'departments' && <Departments key={customer.id} customer={customer} />}
            {tab === 'sla' && <SlaTable key={customer.id} customer={customer} />}
            {tab === 'delivery' && <DeliverySettings key={customer.id} customer={customer} />}
          </div>
        </section>
      </div>
    </>
  );
}

function Departments({ customer }: { customer: Customer }) {
  const { updateCustomer, toast } = useStore();
  const [adding, setAdding] = useState(false);

  const setAuto = (id: string, autoSend: boolean) =>
    updateCustomer(customer.id, (c) => ({ ...c, departments: c.departments.map((d) => (d.id === id ? { ...d, autoSend } : d)) }));

  return (
    <>
      <div className="section-head">
        <p className="secondary">หน่วยงานที่เปิดรับทุกเคสจะถูกเลือกไว้ให้ตอนส่ง และเลือกเพิ่มหรือลดได้ในแต่ละเคส</p>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus {...ICON} className="muted" />
          เพิ่มหน่วยงาน
        </button>
      </div>
      <div className="card card-flush">
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
                <td className="secondary">{d.type}</td>
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
    </>
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
          onClick={() =>
            onAdd({
              id: `dept-${Date.now()}`,
              name: name.trim(),
              type,
              autoSend: false,
              contacts: list.map((email) => ({ name: email.split('@')[0], email })),
            })
          }
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
  const set = (severity: Severity, key: keyof SlaTarget, value: number) =>
    updateCustomer(customer.id, (c) => ({ ...c, sla: { ...c.sla, [severity]: { ...c.sla[severity], [key]: value } } }));

  return (
    <>
      <div className="section-head">
        <p className="secondary">MTTD นับจาก Detect ถึงส่งเมล และ MTTR นับจากส่งเมลถึงปิดเคส โดยไม่นับช่วงรอลูกค้าตอบ ค่าที่แก้จะมีผลกับแถบ SLA ในคิวทันที</p>
      </div>
      <div className="card card-flush">
        <table className="tbl tbl-static">
          <thead>
            <tr>
              <th>ความรุนแรง</th>
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
                    <input
                      className="input input-num mono"
                      type="number"
                      min={1}
                      aria-label={`MTTD ${severity}`}
                      value={target.mttd}
                      onChange={(e) => set(severity, 'mttd', Math.max(1, Number(e.target.value)))}
                    />
                  </td>
                  <td className="muted">{fmtMinutes(target.mttd)}</td>
                  <td>
                    <input
                      className="input input-num mono"
                      type="number"
                      min={1}
                      aria-label={`MTTR ${severity}`}
                      value={target.mttr}
                      onChange={(e) => set(severity, 'mttr', Math.max(1, Number(e.target.value)))}
                    />
                  </td>
                  <td className="muted">{fmtMinutes(target.mttr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* Requirement 3: everything about sending a case lives on this one tab. */
function DeliverySettings({ customer }: { customer: Customer }) {
  const { updateCustomer } = useStore();
  const options = (current: string) => Array.from(new Set([current, ...REPORT_TEMPLATES]));
  const [opening, setOpening] = useState(`เรียน ทีมงาน ${customer.name}\nSOC ตรวจพบเหตุการณ์ตามรายละเอียดด้านล่าง`);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title-row">
          <h3>เข้ารหัสไฟล์ PDF</h3>
          <Toggle
            checked={customer.encryption.enabled}
            label="เข้ารหัสไฟล์ PDF"
            onChange={(enabled) => updateCustomer(customer.id, (c) => ({ ...c, encryption: { ...c.encryption, enabled } }))}
          />
        </div>
        {customer.encryption.enabled ? (
          <div className="form-2 narrow">
            <Field label="รูปแบบรหัสผ่าน">
              <select
                className="input"
                value={customer.encryption.rule}
                onChange={(e) => updateCustomer(customer.id, (c) => ({ ...c, encryption: { ...c.encryption, rule: e.target.value } }))}
              >
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
        ) : (
          <p className="secondary">PDF ของลูกค้านี้จะถูกส่งโดยไม่เข้ารหัส</p>
        )}
      </section>

      <section className="card">
        <div className="card-title-row">
          <h3>Template เมล</h3>
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
        {customer.emailTemplate === 'default' ? (
          <p className="secondary">ดึงตารางจาก Incident report มาใส่ในเมลให้อัตโนมัติ ไม่ต้องตั้งแยกตาม Template</p>
        ) : (
          <Field label="ข้อความเปิด" hint="ตารางจาก Incident report จะต่อท้ายข้อความนี้">
            <textarea className="input" rows={3} value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
        )}
      </section>

      <section className="card card-flush">
        <div className="card-title-row card-pad">
          <h3>Template รายงานตาม Log source</h3>
          <span className="muted">Partner {customer.partner}</span>
        </div>
        <table className="tbl tbl-static">
          <thead>
            <tr>
              <th>Log source</th>
              <th>Template</th>
            </tr>
          </thead>
          <tbody>
            {customer.reportTemplates.map((row) => (
              <tr key={row.logSource}>
                <td>{row.logSource}</td>
                <td>
                  <select
                    className="input input-inline"
                    aria-label={`Template ของ ${row.logSource}`}
                    value={row.template}
                    onChange={(e) =>
                      updateCustomer(customer.id, (c) => ({
                        ...c,
                        reportTemplates: c.reportTemplates.map((t) => (t.logSource === row.logSource ? { ...t, template: e.target.value } : t)),
                      }))
                    }
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
      </section>
    </div>
  );
}
