import { useEffect, useState } from "react";
import { fetchWclParses, getCachedParses, wclConfigured, type WclParse } from "../lib/wcl";

interface WclState {
  loading: boolean;
  results: WclParse[] | null;
}

// Fetch (or read cached) WCL parses for a character. The cache lives at module level
// in lib/wcl, so a cache hit renders synchronously and StrictMode double-effects dedupe.
export function useWclParses(characterName?: string): WclState {
  const name = (characterName || "").trim();
  const [state, setState] = useState<WclState>(() => {
    if (!name || !wclConfigured()) return { loading: false, results: null };
    const cached = getCachedParses(name);
    return cached === undefined ? { loading: true, results: null } : { loading: false, results: cached };
  });

  useEffect(() => {
    if (!name || !wclConfigured()) {
      setState({ loading: false, results: null });
      return;
    }
    const cached = getCachedParses(name);
    if (cached !== undefined) {
      setState({ loading: false, results: cached });
      return;
    }
    let cancelled = false;
    setState({ loading: true, results: null });
    fetchWclParses(name).then((results) => {
      if (!cancelled) setState({ loading: false, results });
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return state;
}
