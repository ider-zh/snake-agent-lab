import { lazy, Suspense, useEffect, useState } from 'react';
import { BrandPage } from './brand/BrandPage';
const Dashboard = lazy(() => import('./Dashboard'));
const isLab = () => /^#\/(lab|play|arena|lessons|batch|training|replay)(\/|$)/.test(location.hash);
export default function App() {
  const [lab, setLab] = useState(isLab);
  useEffect(() => {
    const change = () => { setLab(isLab()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return lab ? <Suspense fallback={<div className="brand-loading" role="status">SnakeLab · 正在打开实验室…</div>}><Dashboard/></Suspense> : <BrandPage/>;
}
