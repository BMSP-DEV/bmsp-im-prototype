import { useEffect } from 'react';
import { navigate, useRoute } from './lib';
import { CustomersPage } from './pages/Customers';
import { DashboardPage } from './pages/Dashboard';
import { IncidentPage } from './pages/Incident';
import { IocPage } from './pages/Ioc';
import { QueuePage } from './pages/Queue';
import { Sidebar } from './shell';
import { useStore } from './store';
import { Toast } from './ui';

export function App() {
  const route = useRoute();
  const { collapsed, role } = useStore();
  const page = route[0] ?? 'queue';
  const socOnly = page === 'customers' || page === 'ioc';

  useEffect(() => {
    if (role === 'customer' && socOnly) navigate('/queue');
  }, [role, socOnly]);

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''}`}>
      <Sidebar page={page === 'incident' ? 'queue' : page} />
      <main className="main">
        {page === 'queue' && <QueuePage />}
        {page === 'incident' && route[1] && <IncidentPage key={route[1]} id={route[1]} />}
        {page === 'dashboard' && <DashboardPage />}
        {page === 'customers' && role === 'soc' && <CustomersPage customerId={route[1]} />}
        {page === 'ioc' && role === 'soc' && <IocPage />}
      </main>
      <Toast />
    </div>
  );
}
