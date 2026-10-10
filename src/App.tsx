import { useRoute } from './lib/router';
import { Toast } from './components/ui';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Wizard } from './pages/Wizard';
import { Join } from './pages/Join';
import { Shell } from './pages/app/Shell';

export function App() {
  const route = useRoute();
  const path = route.split('?')[0];
  let view;
  if (path.startsWith('/app')) view = <Shell page={path.split('/')[2] || 'home'} />;
  else if (path === '/signup' || path === '/login' || path === '/forgot') view = <Auth key={path} mode={path.slice(1) as 'signup' | 'login' | 'forgot'} />;
  else if (path === '/create') view = <Wizard />;
  else if (path === '/join') view = <Join />;
  else view = <Landing />;
  return <>{view}<Toast /></>;
}
