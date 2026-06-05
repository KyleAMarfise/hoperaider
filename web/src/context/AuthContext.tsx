import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { appSettings } from "../lib/config";

interface AuthState {
  user: User | null;
  uid: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInYahoo: () => Promise<void>;
  signInEmail: (email: string, password: string, create?: boolean) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const googleProvider = new GoogleAuthProvider();
const yahooProvider = new OAuthProvider("yahoo.com");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let generation = 0;
    const unsub = onAuthStateChanged(auth, async (u) => {
      const gen = ++generation;
      setUser(u);

      if (!u) {
        setIsAdmin(false);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      // Upsert the member directory record (best-effort).
      try {
        await setDoc(
          doc(db, "members", u.uid),
          { uid: u.uid, email: u.email ?? "", displayName: u.displayName ?? "", updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch {
        /* ignore */
      }

      // Resolve admin/owner: static allowlist OR admins/{uid} OR owners/{uid}.
      const inAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(u.uid);
      let hasAdminDoc = false;
      let hasOwnerDoc = false;
      try {
        hasAdminDoc = (await getDoc(doc(db, "admins", u.uid))).exists();
        hasOwnerDoc = (await getDoc(doc(db, "owners", u.uid))).exists();
      } catch {
        /* ignore */
      }
      if (gen !== generation) return; // a newer auth event superseded this one

      setIsOwner(hasOwnerDoc);
      setIsAdmin(inAllowlist || hasAdminDoc || hasOwnerDoc);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInYahoo = useCallback(async () => {
    await signInWithPopup(auth, yahooProvider);
  }, []);

  const signInEmail = useCallback(async (email: string, password: string, create = false) => {
    if (create) {
      await createUserWithEmailAndPassword(auth, email, password);
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      if (e?.code === "auth/user-not-found" || e?.code === "auth/invalid-credential") {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (c: any) {
          if (c?.code === "auth/email-already-in-use") throw { code: "auth/wrong-password" };
          throw c;
        }
      } else {
        throw e;
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value: AuthState = {
    user,
    uid: user?.uid ?? null,
    isAdmin,
    isOwner,
    loading,
    signInGoogle,
    signInYahoo,
    signInEmail,
    signOutUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
