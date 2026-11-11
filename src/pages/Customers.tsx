import { useEffect, useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { fmtMinutes, navigate, SEVERITY_LABEL, SEVERITY_ORDER } from '../lib';
import { ENCRYPTION_RULES } from '../mock';
import { resolveTemplate } from '../templates';
import { useStore } from '../store';
import { Field, ICON, Modal, Segmented, SevTag, Sheet, TenantStrip, Tile, Toggle, Words } from '../ui';
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
              <h2>
                <Words text={customer.name} />
              </h2>
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

/* Every customer setting saves as it changes, says so, and can be taken back from the toast. */
function useSaveCustomer(customer: Customer) {
  const { updateCustomer, toast } = useStore();
  return (message: string, patch: (c: Customer) => Customer) => {
    const before = customer;
    updateCustomer(customer.id, patch);
    toast(message, () => updateCustomer(customer.id, () => before));
  };
}

function Departments({ customer }: { customer: Customer }) {
  const { updateCustomer, toast } = useStore();
  const save = useSaveCustomer(customer);
  const [adding, setAdding] = useState(false);
  const setAuto = (dept: Department, autoSend: boolean) =>
    save(autoSend ? `${dept.name} รับทุกเคสแล้ว` : `${dept.name} ไม่รับทุกเคสแล้ว`, (c) => ({ ...c, departments: c.departments.map((d) => (d.id === dept.id ? { ...d, autoSend } : d)) }));

  return (
    <section className="panel panel-flush set-units" aria-label="หน่วยงานและผู้รับ">
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
                  <Toggle checked={d.autoSend} onChange={(v) => setAuto(d, v)} label={`${d.name} รับทุกเคส`} />
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
      dirty={Boolean(name.trim() || emails.trim())}
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

/* Saved when the field is left or Enter is pressed, so a half-typed number never becomes the target. */
function MinutesInput({ value, label, onCommit }: { value: number; label: string; onCommit: (minutes: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Math.round(Number(draft));
    if (!Number.isFinite(next) || next < 1) setDraft(String(value));
    else if (next !== value) onCommit(next);
  };
  return (
    <input
      className="input input-num mono"
      type="number"
      min={1}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(String(value));
      }}
    />
  );
}

function SlaTable({ customer }: { customer: Customer }) {
  const save = useSaveCustomer(customer);
  const set = (severity: Severity, key: keyof SlaTarget, value: number) =>
    save(`${key.toUpperCase()} ระดับ${SEVERITY_LABEL[severity]} เป็น ${fmtMinutes(value)} แล้ว`, (c) => ({ ...c, sla: { ...c.sla, [severity]: { ...c.sla[severity], [key]: value } } }));

  return (
    <section className="panel panel-flush set-sla" aria-label="SLA">
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
                    <MinutesInput label={`MTTD ระดับ${SEVERITY_LABEL[severity]} (นาที)`} value={target.mttd} onCommit={(v) => set(severity, 'mttd', v)} />
                  </td>
                  <td className="muted">{fmtMinutes(target.mttd)}</td>
                  <td>
                    <MinutesInput label={`MTTR ระดับ${SEVERITY_LABEL[severity]} (นาที)`} value={target.mttr} onCommit={(v) => set(severity, 'mttr', v)} />
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
  const save = useSaveCustomer(customer);
  const [confirmOff, setConfirmOff] = useState(false);
  const setEncryption = (enabled: boolean) => save(enabled ? 'เปิดการเข้ารหัส PDF แล้ว' : 'ปิดการเข้ารหัส PDF แล้ว', (c) => ({ ...c, encryption: { ...c.encryption, enabled } }));
  const { templates, rules, customers } = useStore();
  const mailTpl = resolveTemplate('email', customer, null, templates, rules, customers);

  return (
    <section className="panel set-delivery" aria-label="การส่งเคส">
      <div className="panel-head">
        <h3>การส่งเคส</h3>
      </div>

      <div className="setting">
        <div className="setting-head">
          <div>
            <h4>เข้ารหัสไฟล์ PDF</h4>
            <p className="sub">{customer.encryption.enabled ? 'ส่งเคสเป็น PDF เข้ารหัสตามกติกาด้านล่าง' : 'PDF ของลูกค้านี้จะถูกส่งโดยไม่เข้ารหัส'}</p>
          </div>
          <Toggle checked={customer.encryption.enabled} label="เข้ารหัสไฟล์ PDF" onChange={(enabled) => (enabled ? setEncryption(true) : setConfirmOff(true))} />
        </div>
        {customer.encryption.enabled && (
          <div className="form-2">
            <Field label="รูปแบบรหัสผ่าน">
              <select className="input" value={customer.encryption.rule} onChange={(e) => {
                  const rule = e.target.value;
                  save(`รูปแบบรหัสผ่านเป็น ${ENCRYPTION_RULES.find((r) => r.id === rule)?.label} แล้ว`, (c) => ({ ...c, encryption: { ...c.encryption, rule } }));
                }}>
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
            <h4>Template ที่ลูกค้านี้ได้</h4>
            <p className="sub">ตั้งที่หน้า Template ที่เดียว ระบบเลือกให้ตามกติกาตอนส่งเคส</p>
          </div>
          <a className="btn btn-sm" href="#/templates">
            จัดการ Template
          </a>
        </div>
        <div className="table-scroll">
          <table className="tbl tbl-plain tbl-effective">
            <tbody>
              <tr>
                <td>เมล</td>
                <td>{mailTpl.template.name}</td>
                <td className="muted">{mailTpl.reason}</td>
              </tr>
              {customer.logSources.map((source) => {
                const r = resolveTemplate('report', customer, source, templates, rules, customers);
                return (
                  <tr key={source}>
                    <td>รายงาน · {source}</td>
                    <td>{r.template.name}</td>
                    <td className="muted">{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmOff && (
        <Modal
          title="ปิดการเข้ารหัส PDF"
          subtitle="เคสถัดไปของลูกค้ารายนี้จะส่งเป็น PDF ที่เปิดได้โดยไม่ต้องใช้รหัสผ่าน"
          onClose={() => setConfirmOff(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmOff(false)}>
                ยกเลิก
              </button>
              <button
                className="btn btn-discard"
                onClick={() => {
                  setEncryption(false);
                  setConfirmOff(false);
                }}
              >
                ปิดการเข้ารหัส
              </button>
            </>
          }
        >
          <TenantStrip customer={customer} />
          <p className="secondary">ไฟล์ที่ส่งไปแล้วยังเข้ารหัสอยู่เหมือนเดิม เปิดกลับได้ทุกเมื่อ</p>
        </Modal>
      )}
    </section>
  );
}
