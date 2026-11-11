import { useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemory } from '../lib';
import { LOG_SOURCES } from '../mock';
import { useStore } from '../store';
import { FIELD_GROUPS, matchingRules, PLACEHOLDERS, resolveTemplate, ruleLabel, ruleReach, ruleWeight, TemplatePreview } from '../templates';
import { Field, ICON_SM, Pill, Segmented, Sheet, Tile, Toggle } from '../ui';
import type { Customer, Incident, Template, TemplateKind, TemplateRule } from '../types';

const KIND_LABEL: Record<TemplateKind, string> = { report: 'รายงาน', email: 'เมล' };

/* A case to preview with: one from this customer and log source when there is one. */
function sampleCase(incidents: Incident[], customer: Customer, logSource: string | null) {
  return incidents.find((i) => i.customerId === customer.id && (!logSource || i.logSource === logSource)) ?? incidents.find((i) => i.customerId === customer.id) ?? incidents[0];
}

/* The page reads left to right: pick a customer, see which template they get and why,
   and the result itself stays in view on the right. Rules live on the template they point to. */
export function TemplatesPage() {
  const { templates, rules, customers, incidents, removeRule, saveRule, removeTemplate, saveTemplate, toast } = useStore();
  const [kind, setKindState] = useMemory<TemplateKind>('templates:kind', 'report');
  const [customerId, setCustomerId] = useMemory('templates:test-customer', customers[0].id);
  const [sourceState, setSource] = useMemory('templates:test-source', customers[0].logSources[0]);
  /* A template picked from the list; none means the preview follows the chosen customer. */
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ template: Template; from: string | null } | null>(null);
  const [ruleDraft, setRuleDraft] = useState<TemplateRule | null>(null);

  const ofKind = templates.filter((t) => t.kind === kind).sort((a, b) => Number(b.builtIn) - Number(a.builtIn));
  const kindRules = rules.filter((r) => r.kind === kind).sort((a, b) => ruleWeight(b) - ruleWeight(a));
  const fallback = ofKind.find((t) => t.builtIn) as Template;
  const customer = customers.find((c) => c.id === customerId) ?? customers[0];
  const logSource = kind === 'report' ? (customer.logSources.includes(sourceState) ? sourceState : customer.logSources[0]) : null;
  const resolved = resolveTemplate(kind, customer, logSource, templates, rules, customers);
  const shown = ofKind.find((t) => t.id === picked) ?? resolved.template;
  const inc = sampleCase(incidents, customer, logSource);
  const report = kind === 'report' ? shown : resolveTemplate('report', customer, inc.logSource, templates, rules, customers).template;
  const uses = rules.filter((r) => r.templateId === shown.id).length;

  /* Who ends up with each template once every rule has had its say. */
  const reach = new Map<string, string[]>();
  for (const c of customers) {
    for (const source of kind === 'report' ? c.logSources : [null]) {
      const id = resolveTemplate(kind, c, source, templates, rules, customers).template.id;
      const codes = reach.get(id) ?? [];
      if (!codes.includes(c.code)) codes.push(c.code);
      reach.set(id, codes);
    }
  }

  const setKind = (next: TemplateKind) => {
    setKindState(next);
    setPicked(null);
  };
  const pickCustomer = (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setPicked(null);
  };
  const blankRule = (patch: Partial<TemplateRule>): TemplateRule => ({
    id: `rule-${Date.now()}`,
    kind,
    customerId: null,
    partner: null,
    logSource: null,
    templateId: ofKind.find((t) => !t.builtIn)?.id ?? fallback.id,
    ...patch,
  });
  const copyOf = (from: Template, name: string): Template => ({ ...from, id: `${kind === 'report' ? 'rpt' : 'mail'}-${Date.now()}`, name, builtIn: false, note: '' });
  const deleteRule = (rule: TemplateRule) => {
    removeRule(rule.id);
    toast(`ลบกติกา ${ruleLabel(rule, customers)} แล้ว`, () => saveRule(rule));
  };
  const deleteTemplate = (t: Template) => {
    removeTemplate(t.id);
    setPicked(null);
    toast(`ลบ ${t.name} แล้ว`, () => saveTemplate(t));
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Template</h1>
        <div className="page-tools">
          <Segmented
            label="ประเภท template"
            value={kind}
            onChange={setKind}
            options={[
              { id: 'report', label: 'รายงาน' },
              { id: 'email', label: 'เมล' },
            ]}
          />
          <button className="btn btn-primary btn-lg" onClick={() => setEditing({ template: copyOf(fallback, ''), from: fallback.id })}>
            <Plus {...ICON_SM} />
            สร้าง template
          </button>
        </div>
      </header>

      <div className="tpl">
        <div className="tpl-grid">
          <div className="tpl-main">
            <section className="panel tpl-who" aria-label="ลูกค้าได้ template ไหน">
              <CustomerPicker customers={customers} value={customer.id} onChange={pickCustomer} />
              {kind === 'report' && (
                <ChipRadio
                  label={`Log source ของ ${customer.code}`}
                  value={logSource ?? ''}
                  onChange={(source) => {
                    setSource(source);
                    setPicked(null);
                  }}
                  options={customer.logSources.map((source) => ({ id: source, label: source }))}
                />
              )}
              <Track
                kind={kind}
                customer={customer}
                logSource={logSource}
                onEditRule={setRuleDraft}
                onAddRule={(patch) => setRuleDraft(blankRule(patch))}
                onPick={(id) => setPicked(id)}
              />
            </section>

            <section className="panel panel-flush tpl-lib" aria-label={`template ${KIND_LABEL[kind]}`}>
              <div className="table-scroll">
                <table className="tbl tbl-static tbl-tpl">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>ใช้เมื่อ</th>
                      <th>ลูกค้าที่ได้</th>
                      <th aria-label="คำสั่ง" />
                    </tr>
                  </thead>
                  <tbody>
                    {ofKind.map((t) => {
                      const own = kindRules.filter((r) => r.templateId === t.id);
                      const codes = reach.get(t.id) ?? [];
                      const active = shown.id === t.id;
                      return (
                        <tr key={t.id} className={active ? 'is-active' : ''}>
                          <td>
                            <button className="tpl-pick" aria-pressed={active} onClick={() => setPicked(t.id)}>
                              <span className="tpl-pick-name">
                                {t.name}
                                {t.builtIn && <Pill tone="gray">ค่าเริ่มต้น</Pill>}
                              </span>
                              {t.note && (
                                <span className="sub" title={t.note}>
                                  {t.note}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="cell-wrap">
                            <span className="rule-chips">
                              {t.builtIn && <span className="chip chip-rest">อื่น ๆ ทั้งหมด</span>}
                              {own.map((rule) => (
                                <RuleChip key={rule.id} rule={rule} customers={customers} onEdit={() => setRuleDraft(rule)} onRemove={() => deleteRule(rule)} />
                              ))}
                              <button className="chip-add" aria-label={`เพิ่มกติกาให้ ${t.name}`} title="เพิ่มกติกา" onClick={() => setRuleDraft(blankRule({ templateId: t.id }))}>
                                <Plus {...ICON_SM} />
                              </button>
                            </span>
                          </td>
                          <td className="cell-wrap">
                            {codes.length ? (
                              <span className="reach">
                                {codes.map((code) => (
                                  <Tile key={code} code={code} size="sm" />
                                ))}
                              </span>
                            ) : (
                              <span className="muted" aria-label="ยังไม่มีลูกค้าได้">
                                –
                              </span>
                            )}
                          </td>
                          <td className="cell-right">
                            <button className="icon-btn" aria-label={`แก้ ${t.name}`} title="แก้ไข" onClick={() => setEditing({ template: t, from: null })}>
                              <Pencil {...ICON_SM} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="panel tpl-preview" aria-label="ตัวอย่างผลลัพธ์">
            <div className="tpl-preview-head">
              <div className="tpl-preview-title">
                <h2>{shown.name}</h2>
                {shown.id === resolved.template.id ? <Pill tone="green">{customer.code} ได้ตัวนี้</Pill> : <Pill tone="gray">ลองกับข้อมูลของ {customer.code}</Pill>}
              </div>
              <span className="row-tools">
                <button className="btn btn-sm" onClick={() => setEditing({ template: shown, from: null })}>
                  <Pencil {...ICON_SM} className="muted" />
                  แก้ไข
                </button>
                <button className="icon-btn" aria-label={`ทำสำเนา ${shown.name}`} title="ทำสำเนา" onClick={() => setEditing({ template: copyOf(shown, `${shown.name} สำเนา`), from: shown.id })}>
                  <Copy {...ICON_SM} />
                </button>
                {!shown.builtIn && (
                  <button
                    className="icon-btn"
                    aria-label={uses ? `ลบ ${shown.name} ไม่ได้ ยังมี ${uses} กติกาใช้อยู่` : `ลบ ${shown.name}`}
                    title={uses ? `ยังมี ${uses} กติกาใช้อยู่` : 'ลบ'}
                    disabled={uses > 0}
                    onClick={() => deleteTemplate(shown)}
                  >
                    <Trash2 {...ICON_SM} />
                  </button>
                )}
              </span>
            </div>
            <div className="tpl-preview-body">
              <div className="paper">
                <TemplatePreview mail={kind === 'email' ? shown : null} report={report} inc={inc} customer={customer} />
              </div>
            </div>
            <p className="sub tpl-preview-foot">
              ข้อมูลจากเคส <span className="mono">{inc.id}</span>
            </p>
          </aside>
        </div>
      </div>

      {editing && (
        <TemplateSheet
          key={editing.template.id}
          initial={editing.template}
          from={editing.from}
          isNew={!templates.some((t) => t.id === editing.template.id)}
          sampleId={customer.id}
          onClose={() => setEditing(null)}
          onSaved={(id) => setPicked(id)}
        />
      )}
      {ruleDraft && <RuleSheet key={ruleDraft.id} initial={ruleDraft} isNew={!rules.some((r) => r.id === ruleDraft.id)} onClose={() => setRuleDraft(null)} />}
    </div>
  );
}

/* ---------- Small pickers: chips instead of dropdowns, so every choice is in view ---------- */

function ChipRadio<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="pick-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} disabled={o.disabled} className={`pick-chip is-text ${o.id === value ? 'is-on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Customers as tiles, grouped by Partner because Partner is one of the things a rule can name.
   Past a handful, a search box narrows the list and the tiles scroll in place. */
function CustomerPicker({ customers, value, onChange, all }: { customers: Customer[]; value: string | null; onChange: (id: string | null) => void; all?: string }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = customers.filter((c) => !q || `${c.code} ${c.name}`.toLowerCase().includes(q));
  const partners = [...new Set(shown.map((c) => c.partner))];
  return (
    <div className="pick">
      {customers.length > 8 && (
        <label className="pick-search">
          <Search {...ICON_SM} />
          <span className="visually-hidden">ค้นหาลูกค้า</span>
          <input value={query} placeholder="ค้นหาลูกค้า" onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <div className="pick-groups" role="radiogroup" aria-label="ลูกค้า">
        {all && (
          <button role="radio" aria-checked={value === null} className={`pick-chip is-text ${value === null ? 'is-on' : ''}`} onClick={() => onChange(null)}>
            {all}
          </button>
        )}
        {partners.map((partner) => (
          <span className="pick-group" key={partner}>
            <span className="pick-group-label">Partner {partner}</span>
            {shown
              .filter((c) => c.partner === partner)
              .map((c) => (
                <button key={c.id} role="radio" aria-checked={value === c.id} className={`pick-chip ${value === c.id ? 'is-on' : ''}`} onClick={() => onChange(c.id)}>
                  <Tile code={c.code} size="sm" />
                  {c.name}
                </button>
              ))}
          </span>
        ))}
        {shown.length === 0 && <span className="muted">ไม่พบลูกค้า</span>}
      </div>
    </div>
  );
}

/* One rule as a chip on its template: click to change it, the x removes it. */
function RuleChip({ rule, customers, onEdit, onRemove }: { rule: TemplateRule; customers: Customer[]; onEdit: () => void; onRemove: () => void }) {
  const customer = customers.find((c) => c.id === rule.customerId);
  const label = ruleLabel(rule, customers);
  const parts: ReactNode[] = [];
  if (customer) parts.push(<Tile key="c" code={customer.code} size="sm" />);
  if (rule.partner) parts.push(<span key="p">Partner {rule.partner}</span>);
  if (rule.logSource) parts.push(<span key="s">{rule.logSource}</span>);
  return (
    <span className="chip chip-rule">
      <button className="chip-main" aria-label={`แก้กติกา ${label}`} title="แก้กติกา" onClick={onEdit}>
        {parts.flatMap((part, i) =>
          i === 0
            ? [part]
            : [
                <span key={`plus-${i}`} className="muted">
                  +
                </span>,
                part,
              ],
        )}
      </button>
      <button className="chip-x" aria-label={`ลบกติกา ${label}`} title="ลบกติกา" onClick={onRemove}>
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

/* ---------- Track: the order rules are tried in, drawn instead of explained ----------
   Left wins over right. The filled step is the one in use; a struck name was beaten by a step
   to its left; a dashed step has no rule yet and adds one when pressed. */

type Level = 'customer' | 'partner' | 'source';

function Track({
  kind,
  customer,
  logSource,
  onEditRule,
  onAddRule,
  onPick,
}: {
  kind: TemplateKind;
  customer: Customer;
  logSource: string | null;
  onEditRule: (rule: TemplateRule) => void;
  onAddRule: (patch: Partial<TemplateRule>) => void;
  onPick: (templateId: string) => void;
}) {
  const { templates, rules } = useStore();
  const matches = matchingRules(kind, customer, logSource, rules);
  const winner = matches[0] ?? null;
  const fallback = templates.find((t) => t.kind === kind && t.builtIn) as Template;
  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? id;
  const levelOf = (r: TemplateRule): Level => (r.customerId ? 'customer' : r.partner ? 'partner' : 'source');
  const steps: { level: Level; label: ReactNode; text: string; patch: Partial<TemplateRule> }[] = [
    {
      level: 'customer',
      label: (
        <>
          <Tile code={customer.code} size="sm" />
          ลูกค้า
        </>
      ),
      text: `ลูกค้า ${customer.code}`,
      patch: { customerId: customer.id },
    },
    { level: 'partner', label: `Partner ${customer.partner}`, text: `Partner ${customer.partner}`, patch: { partner: customer.partner } },
  ];
  if (kind === 'report' && logSource) steps.push({ level: 'source', label: logSource, text: `Log source ${logSource}`, patch: { logSource } });

  return (
    <ol className="track" aria-label="ลำดับที่ระบบเลือก template ซ้ายชนะขวา">
      {steps.map((step) => {
        const rule = matches.find((r) => levelOf(r) === step.level) ?? null;
        const state = !rule ? 'none' : rule === winner ? 'win' : 'skip';
        const says = state === 'win' ? 'ใช้ข้อนี้' : state === 'skip' ? 'ถูกข้าม' : 'ยังไม่มีกติกา กดเพื่อตั้ง';
        return (
          <li key={step.level} className={`track-step is-${state}`}>
            <button aria-label={`${step.text} ${rule ? nameOf(rule.templateId) : ''} ${says}`} onClick={() => (rule ? onEditRule(rule) : onAddRule(step.patch))}>
              <span className="track-level">{step.label}</span>
              <span className="track-tpl">
                {rule ? (
                  nameOf(rule.templateId)
                ) : (
                  <>
                    <Plus size={12} strokeWidth={2} />
                    ตั้งกติกา
                  </>
                )}
              </span>
              {state === 'win' && <Check {...ICON_SM} className="track-check" />}
            </button>
          </li>
        );
      })}
      <li className={`track-step ${winner ? 'is-idle' : 'is-win'}`}>
        <button aria-label={`อื่น ๆ ทั้งหมด ${fallback.name} ${winner ? 'ไม่ถูกใช้' : 'ใช้ข้อนี้'}`} onClick={() => onPick(fallback.id)}>
          <span className="track-level">อื่น ๆ ทั้งหมด</span>
          <span className="track-tpl">{fallback.name}</span>
          {!winner && <Check {...ICON_SM} className="track-check" />}
        </button>
      </li>
    </ol>
  );
}

/* ---------- Template editor: the form on the left, the result on the right, both always in view ---------- */

type TextKey = 'subject' | 'opening' | 'closing';

function TemplateSheet({
  initial,
  from,
  isNew,
  sampleId,
  onClose,
  onSaved,
}: {
  initial: Template;
  from: string | null;
  isNew: boolean;
  sampleId: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { templates, rules, customers, incidents, saveTemplate, removeTemplate, toast, me } = useStore();
  const [draft, setDraft] = useState(initial);
  const [base, setBase] = useState(from);
  const [named, setNamed] = useState(!isNew);
  const [target, setTarget] = useState<TextKey>('subject');
  const [sample, setSample] = useState(sampleId);
  const inputs = useRef<Partial<Record<TextKey, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const set = (patch: Partial<Template>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const clash = templates.some((t) => t.kind === draft.kind && t.id !== draft.id && t.name.trim() === draft.name.trim());
  const nameError = !draft.name.trim() ? 'ต้องมีชื่อ' : clash ? 'ชื่อนี้มีอยู่แล้ว' : null;
  const fieldError = draft.kind === 'report' && !draft.fields?.length ? 'เลือกอย่างน้อย 1 field' : null;
  const bases = templates.filter((t) => t.kind === draft.kind);
  const customer = customers.find((c) => c.id === sample) ?? customers[0];
  const samples = [customer, ...customers.filter((c) => c.id !== customer.id)].slice(0, 6).sort((a, b) => customers.indexOf(a) - customers.indexOf(b));
  const inc = sampleCase(incidents, customer, null);
  const report = draft.kind === 'report' ? draft : resolveTemplate('report', customer, inc.logSource, templates, rules, customers).template;

  const save = () => {
    const saved = { ...draft, name: draft.name.trim(), updatedAt: Date.now(), updatedBy: me.name };
    saveTemplate(saved);
    toast(isNew ? `สร้าง ${saved.name} แล้ว` : `บันทึก ${saved.name} แล้ว`, () => (isNew ? removeTemplate(saved.id) : saveTemplate(initial)));
    onSaved(saved.id);
    onClose();
  };
  /* Starting from another template copies what it says, never its name. */
  const startFrom = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBase(id);
    set({ heading: t.heading, fields: t.fields, subject: t.subject, opening: t.opening, includeReport: t.includeReport, closing: t.closing });
  };
  const toggleField = (key: string) => {
    const has = draft.fields?.includes(key);
    const order = FIELD_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    set({ fields: order.filter((k) => (k === key ? !has : draft.fields?.includes(k))) });
  };
  /* Case data goes in where the cursor is, in the box that was last typed in. */
  const insert = (key: string) => {
    const el = inputs.current[target];
    const value = draft[target] ?? '';
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    const token = `{{${key}}}`;
    set({ [target]: value.slice(0, at) + token + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const tokens = (key: TextKey) =>
    target === key && (
      <div className="ph-bar" role="group" aria-label="แทรกข้อมูลเคสตรงตำแหน่งเคอร์เซอร์">
        {PLACEHOLDERS.map((p) => (
          <button key={p.key} type="button" className="ph-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p.key)}>
            <Plus size={12} strokeWidth={2} />
            {p.label}
          </button>
        ))}
      </div>
    );

  return (
    <Sheet
      title={isNew ? `สร้าง template ${KIND_LABEL[draft.kind]}` : `แก้ ${initial.name}`}
      width={980}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary btn-lg" disabled={(!isNew && !dirty) || !!nameError || !!fieldError} onClick={save}>
            {isNew ? 'สร้าง template' : 'บันทึก'}
          </button>
          <button className="btn btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <div className="tpl-edit">
        <div className="form">
          {isNew && bases.length > 1 && (
            <Field label="เริ่มจาก">
              <ChipRadio label="เริ่มจาก template" value={base ?? ''} onChange={startFrom} options={bases.map((t) => ({ id: t.id, label: t.name }))} />
            </Field>
          )}
          <div className="form-2">
            <Field label="ชื่อ" hint={named && nameError ? <span className="text-bad">{nameError}</span> : undefined}>
              <input
                className="input"
                value={draft.name}
                autoFocus={isNew}
                onChange={(e) => {
                  set({ name: e.target.value });
                  setNamed(true);
                }}
                onBlur={() => setNamed(true)}
              />
            </Field>
            <Field label="ใช้ทำอะไร">
              <input className="input" value={draft.note} placeholder="ไม่บังคับ" onChange={(e) => set({ note: e.target.value })} />
            </Field>
          </div>

          {draft.kind === 'report' ? (
            <>
              <Field label="หัวรายงาน">
                <input className="input" value={draft.heading ?? ''} onChange={(e) => set({ heading: e.target.value })} />
              </Field>
              <Field label={`Field ในตาราง · ${draft.fields?.length ?? 0}`} hint={fieldError ? <span className="text-bad">{fieldError}</span> : undefined}>
                <div className="chipset">
                  <div className="chipset-group" role="group" aria-label="อยู่ในทุกรายงาน">
                    <span className="chipset-label">ทุกรายงาน</span>
                    {['Incident', 'Detect'].map((name) => (
                      <span key={name} className="tog-chip is-locked" title="อยู่ในทุกรายงาน">
                        <Lock size={12} strokeWidth={2} />
                        {name}
                      </span>
                    ))}
                  </div>
                  {FIELD_GROUPS.map((g) => (
                    <div className="chipset-group" role="group" aria-label={g.title} key={g.title}>
                      <span className="chipset-label">{g.title}</span>
                      {g.items.map((f) => {
                        const on = draft.fields?.includes(f.key) ?? false;
                        return (
                          <button key={f.key} type="button" aria-pressed={on} className={`tog-chip ${on ? 'is-on' : ''}`} onClick={() => toggleField(f.key)}>
                            {on && <Check size={12} strokeWidth={2.5} />}
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="หัวเรื่อง">
                <input
                  className="input"
                  ref={(el) => {
                    inputs.current.subject = el;
                  }}
                  value={draft.subject ?? ''}
                  onFocus={() => setTarget('subject')}
                  onChange={(e) => set({ subject: e.target.value })}
                />
              </Field>
              {tokens('subject')}
              <Field label="ข้อความเปิด">
                <textarea
                  className="input"
                  rows={3}
                  ref={(el) => {
                    inputs.current.opening = el;
                  }}
                  value={draft.opening ?? ''}
                  onFocus={() => setTarget('opening')}
                  onChange={(e) => set({ opening: e.target.value })}
                />
              </Field>
              {tokens('opening')}
              <div className="switch-row">
                <span>ตารางรายงาน</span>
                <Toggle checked={draft.includeReport ?? false} label="ใส่ตารางจาก template รายงานในเมล" onChange={(includeReport) => set({ includeReport })} />
              </div>
              <Field label="ข้อความปิดท้าย">
                <textarea
                  className="input"
                  rows={2}
                  ref={(el) => {
                    inputs.current.closing = el;
                  }}
                  value={draft.closing ?? ''}
                  onFocus={() => setTarget('closing')}
                  onChange={(e) => set({ closing: e.target.value })}
                />
              </Field>
              {tokens('closing')}
            </>
          )}
        </div>

        <div className="tpl-edit-preview" aria-live="polite">
          <div className="tpl-edit-preview-head">
            <span>ตัวอย่าง</span>
            <span className="sample-pick" role="radiogroup" aria-label="ลูกค้าที่ใช้เป็นตัวอย่าง">
              {samples.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === customer.id} aria-label={c.name} title={c.name} className={`tile tile-sm tile-btn ${c.id === customer.id ? 'is-on' : ''}`} onClick={() => setSample(c.id)}>
                  {c.code}
                </button>
              ))}
            </span>
          </div>
          <div className="paper">
            <TemplatePreview mail={draft.kind === 'email' ? draft : null} report={report} inc={inc} customer={customer} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Rule editor: who, then which template, then who it reaches ---------- */

function RuleSheet({ initial, isNew, onClose }: { initial: TemplateRule; isNew: boolean; onClose: () => void }) {
  const { templates, rules, customers, saveRule, removeRule, toast } = useStore();
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<TemplateRule>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const partners = [...new Set(customers.map((c) => c.partner))];
  const chosen = customers.find((c) => c.id === draft.customerId);
  const sources = chosen ? chosen.logSources : LOG_SOURCES;
  const options = templates.filter((t) => t.kind === draft.kind).sort((a, b) => Number(a.builtIn) - Number(b.builtIn));
  const empty = !draft.customerId && !draft.partner && !draft.logSource;
  const twin = rules.find((r) => r.id !== draft.id && r.kind === draft.kind && r.customerId === draft.customerId && r.partner === draft.partner && r.logSource === draft.logSource);
  const error = twin ? 'มีกติกาเงื่อนไขนี้อยู่แล้ว' : null;
  const reach = empty || error ? [] : ruleReach(draft, customers, templates, [...rules.filter((r) => r.id !== draft.id), draft]);
  /* One line per customer, with the log sources the rule decides for them. */
  const reached = customers
    .map((c) => ({ customer: c, sources: reach.filter((h) => h.customer.id === c.id).map((h) => h.logSource) }))
    .filter((r) => r.sources.length > 0);

  const save = () => {
    saveRule(draft);
    toast(isNew ? `เพิ่มกติกา ${ruleLabel(draft, customers)} แล้ว` : `บันทึกกติกา ${ruleLabel(draft, customers)} แล้ว`, () => (isNew ? removeRule(draft.id) : saveRule(initial)));
    onClose();
  };

  return (
    <Sheet
      title={isNew ? `เพิ่มกติกา${KIND_LABEL[draft.kind]}` : `แก้กติกา${KIND_LABEL[draft.kind]}`}
      width={600}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary btn-lg" disabled={(!isNew && !dirty) || empty || !!error} onClick={save}>
            {isNew ? 'เพิ่มกติกา' : 'บันทึก'}
          </button>
          <button className="btn btn-lg" onClick={onClose}>
            ยกเลิก
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="ลูกค้า">
          <CustomerPicker
            customers={customers}
            value={draft.customerId}
            all="ทุกลูกค้า"
            onChange={(customerId) => {
              const next = customers.find((c) => c.id === customerId);
              set({ customerId, partner: customerId ? null : draft.partner, logSource: next && draft.logSource && !next.logSources.includes(draft.logSource) ? null : draft.logSource });
            }}
          />
        </Field>
        <Field label="Partner">
          <ChipRadio
            label="Partner"
            value={chosen ? chosen.partner : (draft.partner ?? '')}
            onChange={(partner) => set({ partner: partner || null })}
            options={[{ id: '', label: 'ทุก Partner', disabled: !!chosen }, ...partners.map((p) => ({ id: p, label: p, disabled: !!chosen }))]}
          />
        </Field>
        {draft.kind === 'report' && (
          <Field label="Log source">
            <ChipRadio label="Log source" value={draft.logSource ?? ''} onChange={(logSource) => set({ logSource: logSource || null })} options={[{ id: '', label: 'ทุก Log source' }, ...sources.map((s) => ({ id: s, label: s }))]} />
          </Field>
        )}
        <Field label="ใช้ template">
          <ChipRadio label="ใช้ template" value={draft.templateId} onChange={(templateId) => set({ templateId })} options={options.map((t) => ({ id: t.id, label: t.name }))} />
        </Field>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="rule-effect" aria-live="polite">
            <span className="sub">มีผลกับ</span>
            {empty ? (
              <span className="secondary">เลือกลูกค้า Partner หรือ Log source อย่างน้อย 1 อย่าง</span>
            ) : reached.length ? (
              <ul>
                {reached.map(({ customer, sources: list }) => (
                  <li key={customer.id}>
                    <Tile code={customer.code} size="sm" />
                    {customer.name}
                    <span className="sub">{list.filter(Boolean).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="secondary">ยังไม่มีลูกค้าที่ได้กติกานี้</span>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
