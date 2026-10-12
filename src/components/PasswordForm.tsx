"use client";

import { useState, useTransition } from "react";
import { changePassword } from "@/app/actions";

export default function PasswordForm() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (newPw !== again) {
      setMsg({ error: "两次输入的新密码不一样" });
      return;
    }
    setMsg({});
    startTransition(async () => {
      const r = await changePassword(oldPw, newPw);
      if (r.error) {
        setMsg({ error: r.error });
        return;
      }
      setMsg({ ok: true });
      setOldPw("");
      setNewPw("");
      setAgain("");
    });
  };

  const field =
    "w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none focus:border-beetle dark:border-[#37464f]";

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* 浏览器识别账号用，避免把新密码存成别人的 */}
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <input
        type="password"
        className={field}
        placeholder="当前密码"
        autoComplete="current-password"
        value={oldPw}
        onChange={(e) => setOldPw(e.target.value)}
      />
      <input
        type="password"
        className={field}
        placeholder="新密码（至少 6 位）"
        autoComplete="new-password"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
      />
      <input
        type="password"
        className={field}
        placeholder="再输一次新密码"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
      />
      <button
        type="submit"
        disabled={pending || !oldPw || !newPw || !again}
        className="btn3d w-full bg-beetle px-4 py-2 text-sm text-white [--sh:#a568cc] disabled:opacity-50"
      >
        {pending ? "改密码中…" : "改密码"}
      </button>
      {msg.error && (
        <p className="text-[11px] font-bold text-cardinal">{msg.error}</p>
      )}
      {msg.ok && (
        <p className="text-[11px] font-bold text-feather">
          已改好 ✓ 这台设备不用重新登录，其他设备下次访问需要重登
        </p>
      )}
    </form>
  );
}
