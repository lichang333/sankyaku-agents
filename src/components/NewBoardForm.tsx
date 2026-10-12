"use client";

import { useState, useTransition } from "react";
import { createBoardAction } from "@/app/actions";

export default function NewBoardForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    setError("");
    startTransition(async () => {
      const res = await createBoardAction({
        name: n,
        visibility: priv ? "private" : "group",
      });
      if (res?.error) setError(res.error);
    });
  };

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn3d bg-beetle px-4 py-2 text-sm text-white [--sh:#a568cc]"
      >
        ＋ 建一块板
      </button>
    );

  return (
    <div className="duo-card space-y-3 p-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        placeholder="板名，比如「装修」「上线前」"
        className="w-full rounded-xl border-2 border-swan bg-transparent px-3 py-2 text-sm font-bold outline-none focus:border-beetle dark:border-[#37464f]"
      />
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={priv}
          onChange={(e) => setPriv(e.target.checked)}
          className="h-4 w-4 accent-[#ce82ff]"
        />
        只有我看得见（私人板）
      </label>
      <p className="text-[11px] font-bold text-hare">
        新板自带「待办 / 进行中 / 完成」三列，进行中预设上限 3 张
      </p>
      {error && <p className="text-[11px] font-bold text-cardinal">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !name.trim()}
          onClick={submit}
          className="btn3d bg-beetle px-4 py-2 text-sm text-white [--sh:#a568cc]"
        >
          {pending ? "建中…" : "建好"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs font-bold text-hare">
          取消
        </button>
      </div>
    </div>
  );
}
