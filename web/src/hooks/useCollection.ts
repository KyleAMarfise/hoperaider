import { useEffect, useState } from "react";
import { onSnapshot, type Query } from "firebase/firestore";

export interface CollectionState<T> {
  docs: Array<T & { id: string }>;
  loading: boolean;
  error: Error | null;
}

// Subscribe to a Firestore query. IMPORTANT: pass a *stable* query (wrap the
// query(...) call in useMemo) so we don't re-subscribe on every render.
export function useCollection<T = Record<string, unknown>>(query: Query | null): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ docs: [], loading: true, error: null });

  useEffect(() => {
    if (!query) {
      setState({ docs: [], loading: false, error: null });
      return;
    }
    const unsub = onSnapshot(
      query,
      (snap) => {
        setState({
          docs: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })),
          loading: false,
          error: null
        });
      },
      (error) => setState((s) => ({ ...s, loading: false, error }))
    );
    return unsub;
  }, [query]);

  return state;
}
