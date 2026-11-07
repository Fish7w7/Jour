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

export function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
    const mode = matchMedia("(display-mode: standalone)");
    setInstallPlatform(isAppleMobile() ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop");
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
    return () => {
      mode.removeEventListener("change", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      setOfflineState("unavailable");
      return;
    }

    const serviceWorker = navigator.serviceWorker;
    let mounted = true;
    let stopWatching: (() => void) | undefined;

    async function start() {
      const registration = await serviceWorker.getRegistration() ?? await serviceWorker.register("/sw.js");
      if (!mounted) return;

      let observedWorkers = new Set<ServiceWorker>();
      let lastCheck = 0;
      let checking = false;

      function syncRegistration() {
        const workers = new Set([registration.installing, registration.waiting]
          .filter((worker): worker is ServiceWorker => worker !== null));
        for (const worker of observedWorkers) if (!workers.has(worker)) worker.removeEventListener("statechange", syncRegistration);
        for (const worker of workers) if (!observedWorkers.has(worker)) worker.addEventListener("statechange", syncRegistration);
        observedWorkers = workers;

        setWaiting(readyUpdate(registration));
        if (registration.active?.state === "activated") {
          setRegistration(registration);
          setOfflineState("ready");
        } else if (!registration.active && workers.size === 0) {
          setOfflineState("unavailable");
        }
      }

      function onControllerChange() {
        syncRegistration();
        const attempt = activation.current;
        if (!attempt || serviceWorker.controller !== attempt.target) return;
        window.clearTimeout(attempt.timer);
        activation.current = null;
        try { localStorage.removeItem(updateDeferredKey); } catch { /* The update can still finish. */ }
        window.location.reload();
      }

      function checkForUpdate() {
        syncRegistration();
        const now = Date.now();
        if (!navigator.onLine || document.visibilityState !== "visible" || checking ||
            (now >= lastCheck && now - lastCheck < checkInterval)) return;
        lastCheck = now;
        checking = true;
        void registration.update().catch(() => {}).finally(() => {
          checking = false;
          if (mounted) syncRegistration();
        });
      }

      registration.addEventListener("updatefound", syncRegistration);
      serviceWorker.addEventListener("controllerchange", onControllerChange);
      window.addEventListener("online", checkForUpdate);
      window.addEventListener("focus", checkForUpdate);
      window.addEventListener("pageshow", checkForUpdate);
      document.addEventListener("visibilitychange", checkForUpdate);

      stopWatching = () => {
        registration.removeEventListener("updatefound", syncRegistration);
        for (const worker of observedWorkers) worker.removeEventListener("statechange", syncRegistration);
        serviceWorker.removeEventListener("controllerchange", onControllerChange);
        window.removeEventListener("online", checkForUpdate);
        window.removeEventListener("focus", checkForUpdate);
        window.removeEventListener("pageshow", checkForUpdate);
        document.removeEventListener("visibilitychange", checkForUpdate);
      };

      if (registration.active) checkForUpdate();
      else syncRegistration();

      void serviceWorker.ready.then((ready) => {
        if (!mounted) return;
        setRegistration(ready);
        setOfflineState("ready");
      });
    }

    void start().catch(() => { if (mounted) setOfflineState("unavailable"); });
    return () => {
      mounted = false;
      stopWatching?.();
      if (activation.current) {
        window.clearTimeout(activation.current.timer);
        activation.current = null;
      }
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
