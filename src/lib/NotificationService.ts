import type { SupabaseClient } from "@supabase/supabase-js";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { playChatTone } from "@/lib/sounds";

const db = supabase as unknown as SupabaseClient;

export interface NotificationPrefs {
  chatEnabled: boolean;
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  previewEnabled: boolean;
  liveEnabled: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  chatEnabled: true,
  soundEnabled: true,
  vibrateEnabled: true,
  previewEnabled: true,
  liveEnabled: true,
};

const STORAGE_KEY = "findmit.notification_prefs";

/* --------------------------------- prefs ---------------------------------- */

export function loadPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeLocal(prefs: NotificationPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

/** Saves locally first (instant UI) and mirrors to the backend. */
export async function savePrefs(userId: string | null | undefined, prefs: NotificationPrefs) {
  writeLocal(prefs);
  if (!userId) return;
  await db
    .from("notification_prefs")
    .upsert(
      {
        user_id: userId,
        chat_enabled: prefs.chatEnabled,
        sound_enabled: prefs.soundEnabled,
        vibrate_enabled: prefs.vibrateEnabled,
        preview_enabled: prefs.previewEnabled,
        live_enabled: prefs.liveEnabled,
      },
      { onConflict: "user_id" },
    )
    .then(() => undefined, () => undefined);
}

/** Pulls saved preferences from the backend and caches them locally. */
export async function syncPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const { data } = await db
      .from("notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) {
      const local = loadPrefs();
      await savePrefs(userId, local);
      return local;
    }
    const prefs: NotificationPrefs = {
      chatEnabled: data['chat_enabled'] !== false,
      soundEnabled: data['sound_enabled'] !== false,
      vibrateEnabled: data['vibrate_enabled'] !== false,
      previewEnabled: data['preview_enabled'] !== false,
      liveEnabled: data['live_enabled'] !== false,
    };
    writeLocal(prefs);
    return prefs;
  } catch {
    return loadPrefs();
  }
}

/* ------------------------- permission & registration ----------------------- */

let registration: ServiceWorkerRegistration | null = null;
let fcmApp: FirebaseApp | null = null;
let fcmMessaging: Messaging | null = null;

function env(...names: string[]): string {
  for (const n of names) {
    const v = import.meta.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function vapidKey(): string {
  return env(
    "VITE_FIREBASE_VAPID_KEY",
    "VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY",
  );
}

interface FcmConfig {
  apiKey: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  [key: string]: string;
}

function fcmConfig(): FcmConfig | null {
  const appId = env("VITE_FIREBASE_APP_ID", "VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID");
  const apiKey = env(
    "VITE_FIREBASE_WEB_API_KEY",
    "VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY",
  );
  const projectId = env(
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID",
  );
  const messagingSenderId = appId.split(":")[1] ?? "";
  if (!apiKey || !projectId || !appId || !vapidKey() || !messagingSenderId) return null;
  return { apiKey, projectId, appId, messagingSenderId };
}

let serverConfigPromise: Promise<FcmConfig | null> | null = null;

/** Falls back to the server-held public Firebase config when env vars are incomplete. */
async function resolveFcmConfig(): Promise<FcmConfig | null> {
  const local = fcmConfig();
  if (local) return local;
  if (!vapidKey()) return null;
  serverConfigPromise ??= import("@/lib/fcm-config.functions")
    .then(({ getFcmWebConfig }) => getFcmWebConfig())
    .then((cfg) => {
      const messagingSenderId = cfg.appId.split(":")[1] ?? "";
      if (!cfg.apiKey || !cfg.projectId || !cfg.appId || !messagingSenderId) return null;
      return {
        apiKey: cfg.apiKey,
        projectId: cfg.projectId,
        appId: cfg.appId,
        messagingSenderId,
      };
    })
    .catch(() => null);
  return serverConfigPromise;
}


export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch {
    return null;
  }
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** True when Firebase web-push can be configured (env or server-held config). */
export function pushConfigured(): boolean {
  return Boolean(vapidKey());
}

/** In the Lovable preview iframe browsers silently refuse the permission prompt. */
export function needsOwnTab(): boolean {
  return typeof window !== "undefined" && window.top !== window.self;
}

export type PushResult = NotificationPermission | "unsupported" | "open-in-new-tab";

/** Push is the default mode: ask on login, register the worker, store the device. */
export async function enablePush(userId?: string | null): Promise<PushResult> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";

  // 1. Permission first — getToken() fails outright without it.
  let permission = Notification.permission;
  if (permission === "default") {
    if (needsOwnTab()) return "open-in-new-tab";
    try {
      permission = await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  if (permission !== "granted") return permission;

  // 2. Register the right worker and grab a device token.
  const config = await resolveFcmConfig();
  if (config) {
    const query = new URLSearchParams(config).toString();
    try {
      registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
      await navigator.serviceWorker.ready;
      fcmApp ??= initializeApp(config);
      fcmMessaging ??= getMessaging(fcmApp);
      if (await isSupported()) {
        const fcmToken = await getToken(fcmMessaging, {
          vapidKey: vapidKey(),
          serviceWorkerRegistration: registration,
        });
        if (fcmToken && userId) await saveDeviceToken(userId, fcmToken, "fcm");
      }
    } catch (err) {
      console.warn("FCM registration failed, using local notifications", err);
      registration = await registerServiceWorker();
    }
  } else {
    registration = await registerServiceWorker();
  }

  if (userId) await saveDeviceToken(userId, deviceToken(), "web");
  return permission;
}


/** Records this device so the backend can reach it with a push later. */
export async function saveDeviceToken(userId: string, token: string, platform: "fcm" | "web") {
  try {
    await db
      .from("push_subscriptions")
      .upsert({ user_id: userId, token, platform }, { onConflict: "user_id,token" });
  } catch {
    /* non-fatal */
  }
}

function deviceToken() {
  const key = "findmit.device_token";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

/* ------------------------------ showing them ------------------------------- */

interface ShowOptions {
  title: string;
  body: string;
  url: string;
  tag?: string;
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

async function show(opts: ShowOptions, prefs: NotificationPrefs) {
  if (permissionState() !== "granted") return;
  const options: NotificationOptions & { actions?: { action: string; title: string }[]; vibrate?: number[] } = {
    body: opts.body,
    icon: "/FindMit-Icon-Transparent-FINAL.png",
    badge: "/favicon.png",
    data: { url: opts.url, ...(opts.data ?? {}) },
  };
  if (opts.tag) options.tag = opts.tag;
  if (prefs.vibrateEnabled) options.vibrate = [120, 60, 120];
  if (opts.actions) options.actions = opts.actions;

  try {
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration()) ?? null;
    if (reg) {
      registration = reg;
      await reg.showNotification(opts.title, options);
    } else {
      new Notification(opts.title, options);
    }
  } catch {
    /* ignore */
  }
  if (prefs.soundEnabled) void playChatTone();
}

/** WhatsApp-style "New message from X: preview". */
export async function notifyChatMessage(params: {
  senderName: string;
  preview: string;
  conversationId?: string | null;
}) {
  const prefs = loadPrefs();
  if (!prefs.chatEnabled) return;
  await show(
    {
      title: `New message from ${params.senderName}`,
      body: prefs.previewEnabled ? params.preview : "You have a new message",
      url: params.conversationId ? `/chat?c=${params.conversationId}` : "/chat",
      tag: `chat-${params.conversationId ?? params.senderName}`,
    },
    prefs,
  );
}

/** Teacher went live — offer Join live or Skip class. */
export async function notifyLiveClass(params: {
  classId: string;
  topic: string;
  teacherName: string;
}) {
  const prefs = loadPrefs();
  if (!prefs.liveEnabled) return;
  await show(
    {
      title: `${params.teacherName} is live now`,
      body: prefs.previewEnabled ? params.topic : "A class just started",
      url: `/education/live/${params.classId}`,
      tag: `live-${params.classId}`,
      data: { classId: params.classId },
      actions: [
        { action: "join", title: "Join live" },
        { action: "skip", title: "Skip class" },
      ],
    },
    prefs,
  );
}

/* ------------------------------ skipped classes ---------------------------- */

export async function skipClass(userId: string, classId: string) {
  try {
    await db.from("skipped_live_classes").upsert(
      { user_id: userId, class_id: classId },
      { onConflict: "user_id,class_id" },
    );
  } catch {
    /* ignore */
  }
}

export async function fetchSkippedClassIds(userId: string): Promise<string[]> {
  try {
    const { data } = await db.from("skipped_live_classes").select("class_id").eq("user_id", userId);
    return ((data ?? []) as { class_id: string }[]).map((row) => row.class_id);
  } catch {
    return [];
  }
}
