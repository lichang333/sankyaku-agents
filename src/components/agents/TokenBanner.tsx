"use client";

import { useState } from "react";

export default function TokenBanner({
  token,
  agentName,
  onDismiss,
}: {
  token: string;
  agentName: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 剪贴板不可用时的降级处理
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-feather/50 bg-feather/10 p-4 sm:p-5 text-xs font-bold text-[var(--text)] dark:border-feather/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🔑</span>
          <span className="text-sm font-black text-feather-dark dark:text-feather">
            新生成的 Agent 接入凭证 ({agentName})
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-bold text-hare hover:text-mid"
          title="关闭提示"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 rounded-xl border border-feather/30 bg-[var(--card)] p-3">
        <div className="text-[11px] font-bold text-hare">Bearer Token (仅显示一次)：</div>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <code className="select-all break-all font-mono text-xs font-black text-beetle-dark dark:text-beetle">
            {token}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="btn3d shrink-0 bg-feather px-3 py-1.5 text-xs text-white [--sh:var(--color-feather-dark)]"
          >
            {copied ? "✓ 已复制到剪贴板" : "复制 Token"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-hare">
        <p className="max-w-xl text-cardinal">
          此凭证仅显示一次，请保存到安全位置。关闭后可重新生成，旧凭证随即失效。
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-swan px-2.5 py-1 text-xs font-bold text-mid hover:bg-[var(--card)] dark:border-[#37464f]"
        >
          我已经保存好了
        </button>
      </div>
    </div>
  );
}
