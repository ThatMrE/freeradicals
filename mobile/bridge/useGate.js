import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createMobileGate } from './gateController.js';

/**
 * React hook over the shared gate. The mobile UI is a thin renderer of the same
 * snapshot object the extension's block screen renders — same fields, same
 * status strings, same countdown.
 */
export function useGate({ native } = {}) {
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createMobileGate({ native });
  const gate = gateRef.current;

  const [snapshot, setSnapshot] = useState(() => gate.snapshot());

  useEffect(() => {
    let alive = true;
    gate.load().then((snap) => { if (alive) setSnapshot(snap); });
    const off = gate.subscribe((snap) => { if (alive) setSnapshot(snap); });
    // The countdown is derived from the clock, so a plain interval is enough;
    // nothing is lost if the app is backgrounded and this stops ticking.
    const timer = setInterval(() => setSnapshot(gate.snapshot()), 1000);
    return () => { alive = false; off(); clearInterval(timer); };
  }, [gate]);

  const submitPost = useCallback(
    (text, platformId) => gate.submitPost({ text, platformId }),
    [gate],
  );

  return useMemo(
    () => ({
      snapshot,
      submitPost,
      notePublish: gate.notePublish,
      overrideProof: gate.overrideProof,
      lockNow: gate.lockNow,
      updateSettings: gate.updateSettings,
    }),
    [snapshot, submitPost, gate],
  );
}
