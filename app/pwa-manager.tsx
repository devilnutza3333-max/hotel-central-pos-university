"use client";

import { Download, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }, { once: true });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;

    const dismissed = window.sessionStorage.getItem("pwa-install-dismissed") === "1";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const safari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (!dismissed && ios && safari) {
      setShowIosGuide(true);
      setVisible(true);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!dismissed) setVisible(true);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    window.sessionStorage.setItem("pwa-install-dismissed", "1");
    setVisible(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setVisible(false);
  };

  if (!visible || (!installPrompt && !showIosGuide)) return null;

  return (
    <aside className="pwa-install-card" aria-label="ติดตั้งแอป PBRU POS">
      <span className="pwa-install-icon" aria-hidden="true">
        {showIosGuide ? <Share2 /> : <Download />}
      </span>
      <span>
        <strong>{showIosGuide ? "เพิ่ม POS ไปยังหน้าจอโฮม" : "ติดตั้ง PBRU POS บนเครื่องนี้"}</strong>
        <small>
          {showIosGuide
            ? "แตะปุ่มแชร์ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”"
            : "เปิดใช้งานได้สะดวกเหมือนแอปบนมือถือ"}
        </small>
      </span>
      {installPrompt ? <button type="button" onClick={install}>ติดตั้ง</button> : null}
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="ปิดคำแนะนำ">
        <X />
      </button>
    </aside>
  );
}
