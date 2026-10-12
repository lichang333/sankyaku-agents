"use client";

import { useState, useTransition } from "react";
import { setAvatar } from "@/app/actions";
import Mascot from "@/components/Mascot";
import { AVATARS } from "@/lib/types";

export default function AvatarPicker({
  current,
  takenBy,
}: {
  current: string;
  /** 头像 key → 已占用它的成员名（不含自己） */
  takenBy: Record<string, string>;
}) {
  const [sel, setSel] = useState(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const pick = (key: string) => {
    const owner = takenBy[key];
    if (owner) {
      setError(`这个头像是 ${owner} 的专属，换一个吧`);
      return;
    }
    setError("");
    setSel(key);
    startTransition(async () => {
      const res = await setAvatar(key);
      if (res?.error) {
        setError(res.error);
        setSel(current);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {AVATARS.map((a) => {
          const active = sel === a.key;
          const owner = takenBy[a.key];
          return (
            <button
              key={a.key}
              disabled={pending || !!owner}
              onClick={() => pick(a.key)}
              title={owner ? `${owner} 的专属头像` : a.label}
              className={`relative flex flex-col items-center gap-0.5 rounded-2xl border-2 py-2 transition-colors ${
                active
                  ? "border-beetle bg-beetle/15"
                  : owner
                    ? "border-swan opacity-40 dark:border-[#37464f]"
                    : "border-swan dark:border-[#37464f]"
              }`}
            >
              <Mascot className="h-10 w-10" variant={a.key} />
              <span
                className={`text-[10px] font-bold ${
                  active ? "text-beetle-dark dark:text-beetle" : "text-hare"
                }`}
              >
                {a.label}
              </span>
              {/* 已被占用：标出是谁的，不只是变灰 */}
              {owner && (
                <span className="absolute inset-x-1 bottom-1 truncate rounded bg-[var(--card)]/85 text-[9px] font-black text-hare">
                  {owner}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[11px] font-bold text-cardinal">{error}</p>}
      <p className="text-[11px] font-bold text-hare">
        卡片上只放得下一个小小的头像，谁负责这张卡全靠它认——所以一人一款不重合
      </p>
    </div>
  );
}
