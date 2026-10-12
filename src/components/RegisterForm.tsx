"use client";

import { useState, useTransition } from "react";
import { registerWithInvite } from "@/app/actions";

export default function RegisterForm({ code }: { code: string }) {
  const [form, setForm] = useState({
    code,
    uid: "",
    displayName: "",
    password: "",
    again: "",
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const field =
    "w-full rounded-xl border-2 border-swan bg-transparent px-3 py-2.5 text-sm font-semibold placeholder:text-hare dark:border-[#37464f]";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (form.password !== form.again) {
      setError("两次输入的密码不一样");
      return;
    }
    setError("");
    startTransition(async () => {
      const r = await registerWithInvite(form);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="duo-card space-y-3 p-5">
      <input
        placeholder="邀请码"
        value={form.code}
        onChange={set("code")}
        className={field}
      />
      <input
        placeholder="账号（小写字母/数字/下划线）"
        value={form.uid}
        onChange={set("uid")}
        className={field}
      />
      <input
        placeholder="显示名（页面上展示的名字）"
        value={form.displayName}
        onChange={set("displayName")}
        className={field}
      />
      <input
        type="password"
        placeholder="密码（至少 6 位）"
        value={form.password}
        onChange={set("password")}
        autoComplete="new-password"
        className={field}
      />
      <input
        type="password"
        placeholder="再输一次密码"
        value={form.again}
        onChange={set("again")}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="new-password"
        className={field}
      />
      {error && <p className="text-xs font-bold text-cardinal">{error}</p>}
      <button
        onClick={submit}
        disabled={
          pending ||
          !form.code.trim() ||
          !form.uid.trim() ||
          !form.displayName.trim() ||
          !form.password ||
          !form.again
        }
        className="btn3d w-full bg-feather py-3 text-sm text-white [--sh:#46a302]"
      >
        {pending ? "注册中…" : "加入 →"}
      </button>
    </div>
  );
}
