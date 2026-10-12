"use client";

import { useState, useTransition } from "react";
import { login } from "@/app/actions";

export default function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    setError("");
    startTransition(async () => {
      const res = await login(uid.trim().toLowerCase(), password);
      if (res?.error) setError(res.error);
    });
  };

  const field =
    "w-full rounded-xl border-2 border-swan bg-transparent px-3 py-2.5 text-sm font-semibold placeholder:text-hare focus:border-beetle outline-none dark:border-[#37464f]";

  /*
   * 回车提交显式接一道，不只靠 <form> 的隐式提交：
   * 隐式提交在「默认按钮此刻恰好是 disabled」和某些输入法的回车上会静静地不触发，
   * 表现就是「按了回车没反应」——登录页是最不该出现这种事的地方。
   */
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!pending && password && uid.trim()) submit();
  };

  return (
    <form
      className="duo-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        placeholder="账号"
        autoComplete="username"
        value={uid}
        onChange={(e) => setUid(e.target.value)}
        onKeyDown={onEnter}
        className={field}
      />
      <input
        type="password"
        placeholder="密码"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={onEnter}
        className={field}
      />

      {error && <p className="text-xs font-bold text-cardinal">{error}</p>}

      <button
        type="submit"
        disabled={pending || !password || !uid.trim()}
        className="btn3d w-full bg-beetle py-3 text-sm text-white [--sh:#a568cc]"
      >
        {pending ? "登录中…" : "进板 →"}
      </button>
    </form>
  );
}
