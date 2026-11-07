"use client";

import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & { prompt(): Promise<{ outcome: string }> };
type InstallPlatform = "ios" | "android" | "desktop";
const installDismissedKey = "rotina-aprendiz:install-invite-dismissed";
const updateDeferredKey = "rotina-aprendiz:update-deferred-until";
const checkInterval = 15 * 60_000;
const deferInterval = 24 * 60 * 60_000;
const activationTimeout = 15_000;

function readyUpdate(registration?: ServiceWorkerRegistration) {
  const worker = registration?.waiting;
  return registration?.active && worker?.state === "installed" ? worker : null;
}

export function usePwa() {
  const [online, setOnline] = useState(true);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [deferredUntil, setDeferredUntil] = useState(0);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const activation = useRef<{ target: ServiceWorker; timer: number }>(null);
  const [installed, setInstalled] = useState(false);
  const [installAccepted, setInstallAccepted] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>();
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const [offlineState, setOfflineState] = useState<"checking" | "ready" | "unavailable">("checking");
  const [prompt, setPrompt] = useState<InstallPrompt>();
  useEffect(() => {
    if (!deferredUntil) return;
    const timer = window.setTimeout(() => setDeferredUntil(0), Math.max(0, deferredUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deferredUntil]);

  useEffect(() => {
    let active = true;
    let stopWatching = () => {};
    const mode = matchMedia("(display-mode: standalone)");
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setInstallPlatform(ios ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop");
    try {
      setInviteDismissed(localStorage.getItem(installDismissedKey) === "1");
      const until = Number(localStorage.getItem(updateDeferredKey));
      if (until > Date.now() && until <= Date.now() + deferInterval) {
        setDeferredUntil(until);
      }
    } catch {
      // Dismissal still works for this session if storage is unavailable.
    }
    const update = () => {
      setOnline(navigator.onLine);
      setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => { setInstallAccepted(true); setPrompt(undefined); };
    update();
    mode.addEventListener("change", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const serviceWorker = navigator.serviceWorker;
      void serviceWorker.getRegistration().then((existing) => existing ?? serviceWorker.register("/sw.js")).then((worker) => {
        if (!active) return;
        let observed = new Set<ServiceWorker>();
        let lastCheck = 0;
        let checking = false;
        const check = () => {
          const workers = new Set([worker.installing, worker.waiting].filter((entry): entry is ServiceWorker => entry !== null));
          for (const entry of observed) if (!workers.has(entry)) entry.removeEventListener("statechange", check);
          for (const entry of workers) if (!observed.has(entry)) entry.addEventListener("statechange", check);
          observed = workers;
          setWaiting(readyUpdate(worker));
          if (worker.active?.state === "activated") {
            setRegistration(worker);
            setOfflineState("ready");
          } else if (!worker.active && !worker.installing && !worker.waiting) {
            setOfflineState("unavailable");
          }
        };
        const onControllerChange = () => {
          check();
          const attempt = activation.current;
          if (!attempt || serviceWorker.controller !== attempt.target) return;
          window.clearTimeout(attempt.timer);
          activation.current = null;
          try { localStorage.removeItem(updateDeferredKey); } catch { /* The update can still finish. */ }
          window.location.reload();
        };
        const checkOnline = () => {
          check();
          const now = Date.now();
          if (!navigator.onLine || document.visibilityState !== "visible" || checking ||
              (now >= lastCheck && now - lastCheck < checkInterval)) return;
          lastCheck = now;
          checking = true;
          void worker.update().catch(() => {}).finally(() => {
            checking = false;
            if (active) check();
          });
        };
        worker.addEventListener("updatefound", check);
        serviceWorker.addEventListener("controllerchange", onControllerChange);
        window.addEventListener("online", checkOnline);
        window.addEventListener("focus", checkOnline);
        window.addEventListener("pageshow", checkOnline);
        document.addEventListener("visibilitychange", checkOnline);
        check();
        if (worker.active) checkOnline();
        stopWatching = () => {
          worker.removeEventListener("updatefound", check);
          for (const entry of observed) entry.removeEventListener("statechange", check);
          serviceWorker.removeEventListener("controllerchange", onControllerChange);
          window.removeEventListener("online", checkOnline);
          window.removeEventListener("focus", checkOnline);
          window.removeEventListener("pageshow", checkOnline);
          document.removeEventListener("visibilitychange", checkOnline);
        };
        void navigator.serviceWorker.ready.then((ready) => {
          if (!active) return;
          setRegistration(ready);
          setOfflineState("ready");
        });
        if (!worker.active && !worker.installing && !worker.waiting) setOfflineState("unavailable");
      }).catch(() => { if (active) setOfflineState("unavailable"); });
    } else {
      setOfflineState("unavailable");
    }
    return () => {
      active = false;
      stopWatching();
      if (activation.current) {
        window.clearTimeout(activation.current.timer);
        activation.current = null;
      }
      mode.removeEventListener("change", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function applyUpdate() {
    if (activation.current) return;
    const target = readyUpdate(registration);
    if (!target) {
      setWaiting(null);
      setUpdateError("");
      return;
    }
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    setUpdateError("");
    setApplyingUpdate(true);
    const fail = () => {
      if (activation.current) window.clearTimeout(activation.current.timer);
      activation.current = null;
      const next = readyUpdate(registration);
      setWaiting(next);
      setApplyingUpdate(false);
      setUpdateError(next ? "Não foi possível atualizar. Tente novamente." :
        "Feche e reabra o aplicativo para carregar a versão disponível.");
    };
    activation.current = { target, timer: window.setTimeout(fail, activationTimeout) };
    try { target.postMessage("apply-update"); } catch { fail(); }
  }

  function deferUpdate() {
    const until = Date.now() + deferInterval;
    setDeferredUntil(until);
    try { localStorage.setItem(updateDeferredKey, String(until)); } catch { /* Keep the in-memory preference. */ }
  }

  return {
    online, registration, offlineState, installed, installAccepted, installPlatform, updateAvailable: Boolean(waiting),
    showUpdateCard: (Boolean(waiting) || applyingUpdate) && !deferredUntil,
    applyingUpdate, updateError, deferUpdate,
    showInstallInvite: !installed && !installAccepted && !inviteDismissed &&
      (installPlatform === "ios" || installPlatform === "android" || Boolean(prompt)),
    dismissInstallInvite: () => {
      setInviteDismissed(true);
      try { localStorage.setItem(installDismissedKey, "1"); } catch { /* Keep the in-memory preference. */ }
    },
    onUpdate: waiting && online ? applyUpdate : undefined,
    onInstall: prompt ? async () => {
      setPrompt(undefined);
      try {
        const { outcome } = await prompt.prompt();
        if (outcome === "accepted") setInstallAccepted(true);
      } catch {
        // The guide shows the manual steps after the prompt is consumed.
      }
    } : undefined,
  };
}
