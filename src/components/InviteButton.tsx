"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/app/actions";

/** 生成一次性邀请链接；复制发给对方即可 */
export default function InviteButton() {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { code } = await createInvite();
            setLink(`${location.origin}/register?code=${code}`);
            setCopied(false);
          })
        }
        className="btn3d bg-feather px-4 py-2 text-sm text-white [--sh:#46a302] disabled:opacity-50"
      >
        {pending ? "生成中…" : "＋ 生成邀请链接"}
      </button>
      {link && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border-2 border-swan px-2 py-1.5 text-[11px] font-bold dark:border-[#37464f]">
            {link}
          </code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
            }}
            className="shrink-0 rounded-lg border-2 border-beetle px-2 py-1.5 text-[11px] font-bold text-beetle-dark dark:text-beetle"
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
        </div>
      )}
      <p className="text-[11px] font-bold text-hare">
        一码一人。对方打开链接自己设账号密码，进来就能看到所有全组板
      </p>
    </div>
  );
}
