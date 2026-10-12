"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { logout } from "@/app/actions";
import Avatar from "@/components/Avatar";
import { useOutsideClose } from "@/components/useOutsideClose";
import type { User } from "@/lib/types";

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-polar dark:hover:bg-[#37464f] disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-2xl border-2 border-swan bg-[var(--card)] py-1 pr-2.5 pl-1 text-xs font-extrabold transition-colors dark:border-[#37464f]"
      >
        <Avatar userId={user.id} size="xl" />
        <span className="max-w-24 truncate">{user.displayName}</span>
        <span className="text-hare">▾</span>
      </button>

      {open && (
        <div className="duo-card absolute right-0 z-40 mt-2 w-56 p-2.5 shadow-xl">
          <div className="space-y-0.5">
            <Link href="/mine" className={item} onClick={() => setOpen(false)}>
              ✓ 我的卡片
            </Link>
            <Link href="/settings" className={item} onClick={() => setOpen(false)}>
              ⚙️ 设置
            </Link>
            <button
              disabled={pending}
              className={`${item} text-cardinal`}
              onClick={() => startTransition(() => logout())}
            >
              ⏻ 退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
