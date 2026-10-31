import { useEffect, useRef } from 'react';

/** Async disk/permission callbacks may complete after their workspace is closed. */
export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return mounted;
}
