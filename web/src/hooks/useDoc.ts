import { useEffect, useState } from "react";
import { onSnapshot, type DocumentReference } from "firebase/firestore";

export interface DocState<T> {
  data: (T & { id: string }) | null;
  loading: boolean;
  error: Error | null;
}

// Subscribe to a single Firestore document. Pass a *stable* ref (useMemo).
export function useDoc<T = Record<string, unknown>>(ref: DocumentReference | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null,
          loading: false,
          error: null
        });
      },
      (error) => setState((s) => ({ ...s, loading: false, error }))
    );
    return unsub;
  }, [ref]);

  return state;
}
