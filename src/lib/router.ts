import { useEffect, useState } from 'react';

const read = () => location.hash.replace(/^#/, '') || '/';

export function useRoute() {
  const [r, setR] = useState(read);
  useEffect(() => {
    const f = () => { setR(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export const go = (path: string) => { if (read() !== path) location.hash = path; };
