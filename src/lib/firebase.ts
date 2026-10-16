import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/** Public Firebase web config (safe in client code; env vars override). */
export const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] ?? "AIzaSyBGx35APycc0KVp5xIH1QH-5jrPfjNhgKs",
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "findmeet-8cfda.firebaseapp.com",
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] ?? "findmeet-8cfda",
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "findmeet-8cfda.firebasestorage.app",
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "865517381931",
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] ?? "1:865517381931:web:154fe0fc94bd432e8fbd6e",
  measurementId: import.meta.env["VITE_FIREBASE_MEASUREMENT_ID"] ?? "G-WFR6V2K1JV",
};

let app: FirebaseApp | null = null;

export function getFirebaseAuth(): Auth {
  if (!app) app = getApps().find((a) => a.name === "otp") ?? initializeApp(firebaseConfig, "otp");
  return getAuth(app);
}
