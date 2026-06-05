import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./config";

// Single Firebase init for the whole SPA (the old site re-initialised per page).
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Keep the session across reloads/routes so we don't re-auth on every navigation.
void setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app);
