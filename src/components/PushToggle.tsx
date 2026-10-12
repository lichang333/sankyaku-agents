"use client";

import { useEffect, useState } from "react";

/**
 * 开关本机的推送通知。订阅是「设备级」的——手机和电脑各订一次。
 * iPhone 上必须先把网页「添加到主屏幕」，Safari 才允许网页推送。
 */
export default function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<"loading" | "on" | "off" | "unsupported">(
    "loading"
  );
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setMsg("");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setMsg("浏览器没给通知权限——去站点设置里打开「通知」再试");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub),
    });
    if (!res.ok) {
      setMsg("订阅没存上，稍后再试");
      return;
    }
    setState("on");
    setMsg("这台设备已订阅 ✓");
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, {
        method: "DELETE",
      });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("已退订这台设备");
  };

  if (state === "unsupported")
    return (
      <p className="text-[11px] font-bold text-hare">
        这个浏览器不支持网页推送。iPhone 请先把本站「添加到主屏幕」，
        再从主屏图标打开来开启。
      </p>
    );

  return (
    <div className="space-y-2">
      <button
        disabled={state === "loading"}
        onClick={state === "on" ? disable : enable}
        className={`btn3d px-4 py-2 text-sm font-extrabold disabled:opacity-50 ${
          state === "on"
            ? "bg-polar text-mid dark:bg-[#37464f] dark:text-[#f1f7fb] dark:[--sh:#26343c]"
            : "bg-feather text-white [--sh:#46a302]"
        }`}
      >
        {state === "loading"
          ? "检查中…"
          : state === "on"
            ? "关闭本机推送"
            : "🔔 开启本机推送"}
      </button>
      {msg && <p className="text-[11px] font-bold text-feather">{msg}</p>}
      <p className="text-[11px] font-bold text-hare">
        只推三种：卡片派给你、你的卡有人留言、早上八点今天到期的卡。手机和电脑要各开一次。
      </p>
    </div>
  );
}
