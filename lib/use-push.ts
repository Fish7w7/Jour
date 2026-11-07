"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultPreferences, type Preferences } from "./schedule";
import { object, pushPlan } from "./notifications";
import { readPushSnapshot, setPushDevice, type PushDevice } from "./storage";
import { isAppleMobile, type usePwa } from "./use-pwa";

type Status = "loading" | "off" | "on" | "pending" | "revoking" | "expired";
type Config = { publicKey: string } | null;
type Pwa = ReturnType<typeof usePwa>;

async function api(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch("/api/push/" + path, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function auth(token: string) {
  return { Authorization: "Bearer " + token };
}

function subscriptionKey(key: string) {
  return Uint8Array.from(atob(key.replaceAll("-", "+").replaceAll("_", "/")), (letter) => letter.charCodeAt(0));
}

export function usePush({ online, installed, registration }: Pwa, preferences: Preferences, ready: boolean) {
  const [status, setStatus] = useState<Status>("loading");
  const [hasDevice, setHasDevice] = useState(false);
  const [config, setConfig] = useState<Config>();
  const [permission, setPermission] = useState<NotificationPermission>();
  const [support, setSupport] = useState<"checking" | "install" | "unsupported" | "supported">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const queue = useRef(Promise.resolve());
  const actionBusy = useRef(false);

  const enqueue = useCallback((action: () => Promise<void>) => {
    const run = async () => {
      if (navigator.locks) await navigator.locks.request("rotina-aprendiz-push", action);
      else await action();
    };
    const pending = queue.current.then(run);
    queue.current = pending.catch(() => {});
    return pending;
  }, []);

  const sync = useCallback(async () => {
    const { device, preferences, revision } = await readPushSnapshot();
    const currentPermission = typeof Notification === "undefined" ? undefined : Notification.permission;
    setPermission(currentPermission);
    setHasDevice(Boolean(device));
    if (!device) {
      setStatus((previous) => previous === "expired" ? previous : "off");
      return;
    }
    const wanted = device.wanted && currentPermission !== "denied";
    if (device.wanted && !wanted) await setPushDevice((current) => current?.token === device.token ? { ...device, wanted: false } : current);
    setStatus(wanted ? "pending" : "revoking");
    if (!navigator.onLine) return;
    if (!wanted) {
      const response = await api("device", { method: "DELETE", headers: auth(device.token) });
      if (!response.ok) return;
      const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
      await subscription?.unsubscribe().catch(() => {});
      await setPushDevice((current) => current?.token === device.token ? undefined : current);
      setHasDevice(false);
      setStatus("off");
      return;
    }
    if (currentPermission !== "granted" || !registration?.pushManager || !config) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setStatus("expired");
      return;
    }
    const response = await api("device", {
      method: "PUT",
      headers: { ...auth(device.token), "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), plan: pushPlan(preferences ?? defaultPreferences), revision }),
    });
    if (response.status === 410) {
      await subscription.unsubscribe().catch(() => {});
      await setPushDevice((current) => current?.token === device.token ? undefined : current);
      setHasDevice(false);
      setStatus("expired");
    } else if (response.ok) {
      setStatus("on");
    }
  }, [config, registration]);

  useEffect(() => {
    if (isAppleMobile() && !installed) setSupport("install");
    else if (!window.isSecureContext || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) setSupport("unsupported");
    else setSupport("supported");
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, [installed]);

  useEffect(() => {
    if (!online || support !== "supported") return;
    let active = true;
    async function load() {
      try {
        const response = await api("config");
        const data: unknown = response.ok ? await response.json() : null;
        if (!active) return;
        if (!object(data) || !data.available || typeof data.publicKey !== "string" || !/^[\w-]{87}$/.test(data.publicKey)) {
          setConfig(null);
          return;
        }
        const { publicKey } = data;
        setConfig((current) => current?.publicKey === publicKey ? current : { publicKey });
      } catch { if (active) setConfig(null); }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [online, support]);

  useEffect(() => {
    if (!ready) return;
    const refresh = () => { void enqueue(sync).catch(() => {}); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enqueue, sync, ready, online, preferences]);

  function act(action: () => Promise<void>) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setMessage("");
    void enqueue(action).catch(() => {
      setMessage("Não foi possível concluir. Verifique a conexão e tente novamente.");
    }).finally(() => {
      actionBusy.current = false;
      setBusy(false);
    });
  }

  const canEnable = ready && online && support === "supported" && Boolean(config && registration) &&
    permission !== "denied" && (status === "off" || status === "expired");
  const enable = () => {
    if (!canEnable || !registration || !config || actionBusy.current) return;
    // subscribe prompts for permission when necessary, inside the user's click on iPhone.
    const subscriptionRequest = registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: subscriptionKey(config.publicKey),
    }).then(() => true, () => false);
    act(async () => {
      const subscribed = await subscriptionRequest;
      setPermission(Notification.permission);
      if (!subscribed) {
        setMessage(Notification.permission === "denied" ? "A permissão foi bloqueada neste dispositivo."
          : "A inscrição não foi criada. Verifique a permissão e tente novamente.");
        return;
      }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      await setPushDevice((current) => current ?? { token, wanted: true });
      await sync();
    });
  };

  const disable = () => act(async () => {
    await setPushDevice((current): PushDevice | undefined => current ? { ...current, wanted: false } : undefined);
    await sync();
  });

  const sendTest = () => {
    if (!online || status !== "on") return;
    act(async () => {
      const { device } = await readPushSnapshot();
      if (!device?.wanted) return;
      const response = await api("test", { method: "POST", headers: auth(device.token) });
      if (response.status === 410) await sync();
      setMessage(response.ok ? "Teste aceito pelo serviço de envio." : response.status === 429
        ? "Aguarde um minuto antes de enviar outro teste." : "O serviço de envio recusou o teste.");
    });
  };

  return { status, hasDevice, support, permission, configured: Boolean(config), configLoading: config === undefined,
    busy, message, canEnable, enable, disable, sendTest, retry: () => act(sync) };
}
