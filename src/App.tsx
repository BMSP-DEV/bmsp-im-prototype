import { useEffect } from 'react';
import { CasePanel } from './case/CasePanel';
import { hasOpenLayer, isTyping, lettersOff, navigate, replaceRoute, useRoute } from './lib';
import { CasesPage } from './pages/Cases';
import { CustomersPage } from './pages/Customers';
import { IocPage } from './pages/Ioc';
import { OverviewPage } from './pages/Overview';
import { TemplatesPage } from './pages/Templates';
import { WorkPage } from './pages/Work';
import { CommandPalette } from './palette';
import { Rail } from './rail';
import { useStore } from './store';
import { Topbar } from './topbar';
import { Toast } from './ui';

/* Addresses from the previous prototype keep working. */
const MOVED: Record<string, string> = { queue: 'work', incident: 'work', dashboard: 'sla' };

export function App() {
  const route = useRoute();
  const { role, setPaletteOpen, visible } = useStore();
  const page = route[0] ?? 'work';
  const socOnly = page === 'customers' || page === 'ioc' || page === 'templates';

  useEffect(() => {
    if (MOVED[page]) replaceRoute(`/${MOVED[page]}${route[1] ? `/${route[1]}` : ''}`);
  }, [page, route]);

  useEffect(() => {
    if (role === 'customer' && socOnly) navigate('/work');
  }, [role, socOnly]);

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [page]);

  /* Each browser tab names its page and case, so an analyst with many tabs open can tell them apart. */
  const caseId = page === 'case' || page === 'work' ? route[1] : undefined;
  const caseTitle = caseId ? visible.find((i) => i.id === caseId)?.title : undefined;
  useEffect(() => {
    const names: Record<string, string> = { work: 'งาน', cases: 'เคส', case: 'เคส', sla: 'SLA และ KPI', customers: 'ลูกค้า', templates: 'Template', ioc: 'IoC' };
    document.title = [caseId && caseTitle ? `${caseId} ${caseTitle}` : null, names[page] ?? 'งาน', 'IM2'].filter(Boolean).join(' · ');
  }, [page, caseId, caseTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.code === 'Slash' && !isTyping(e) && !hasOpenLayer() && !lettersOff()) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  return (
    <div className="app">
      <button className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        ข้ามไปเนื้อหาหลัก
      </button>
      <Rail page={page === 'case' ? 'cases' : page} />
      <div className="shell">
        <Topbar />
        <main className="main" id="main" tabIndex={-1}>
          {page === 'work' && <WorkPage caseId={route[1]} />}
          {page === 'cases' && <CasesPage />}
          {page === 'case' && route[1] && (
            <div className="case-page">
              <CasePanel key={route[1]} id={route[1]} mode="page" />
            </div>
          )}
          {page === 'sla' && <OverviewPage />}
          {page === 'customers' && role === 'soc' && <CustomersPage customerId={route[1]} />}
          {page === 'templates' && role === 'soc' && <TemplatesPage />}
          {page === 'ioc' && role === 'soc' && <IocPage />}
        </main>
      </div>
      <CommandPalette />
      <Toast />
    </div>
  );
}
