import { useEffect, useState } from "react";
import { fetchArmoryData, getCachedArmory, type ArmoryData } from "../lib/armory";

interface ArmoryState {
  loading: boolean;
  data: ArmoryData | null;
}

// Fetch (or read cached) classic-armory item level for a character.
export function useArmory(characterName?: string): ArmoryState {
  const name = (characterName || "").trim();
  const [state, setState] = useState<ArmoryState>(() => {
    if (!name) return { loading: false, data: null };
    const cached = getCachedArmory(name);
    return cached === undefined ? { loading: true, data: null } : { loading: false, data: cached };
  });

  useEffect(() => {
    if (!name) {
      setState({ loading: false, data: null });
      return;
    }
    const cached = getCachedArmory(name);
    if (cached !== undefined) {
      setState({ loading: false, data: cached });
      return;
    }
    let cancelled = false;
    setState({ loading: true, data: null });
    fetchArmoryData(name).then((data) => {
      if (!cancelled) setState({ loading: false, data });
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return state;
}
