import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CasePanel } from './case/CasePanel';
import { hasOpenLayer, isTyping, navigate, replaceRoute, useRoute } from './lib';
import { CasesPage } from './pages/Cases';
import { CustomersPage } from './pages/Customers';
import { IocPage } from './pages/Ioc';
import { OverviewPage } from './pages/Overview';
import { WorkPage } from './pages/Work';
import { CommandPalette } from './palette';
import { Rail } from './rail';
import { useStore } from './store';
import { ICON, Toast } from './ui';

/* Addresses from the previous prototype keep working. */
const MOVED: Record<string, string> = { queue: 'work', incident: 'work', dashboard: 'sla' };

export function App() {
  const route = useRoute();
  const { role, setPaletteOpen } = useStore();
  const page = route[0] ?? 'work';
  const socOnly = page === 'customers' || page === 'ioc';

  useEffect(() => {
    if (MOVED[page]) replaceRoute(`/${MOVED[page]}${route[1] ? `/${route[1]}` : ''}`);
  }, [page, route]);

  useEffect(() => {
    if (role === 'customer' && socOnly) navigate('/work');
  }, [role, socOnly]);

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.code === 'Slash' && !isTyping(e) && !hasOpenLayer()) {
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
      <main className="main" id="main" tabIndex={-1}>
        {page === 'work' && <WorkPage caseId={route[1]} />}
        {page === 'cases' && <CasesPage />}
        {page === 'case' && route[1] && (
          <div className="case-page">
            <header className="page-head">
              <a className="back-link" href="#/cases">
                <ArrowLeft {...ICON} />
                เคสทั้งหมด
              </a>
            </header>
            <div className="case-page-body">
              <CasePanel key={route[1]} id={route[1]} />
            </div>
          </div>
        )}
        {page === 'sla' && <OverviewPage />}
        {page === 'customers' && role === 'soc' && <CustomersPage customerId={route[1]} />}
        {page === 'ioc' && role === 'soc' && <IocPage />}
      </main>
      <CommandPalette />
      <Toast />
    </div>
  );
}
