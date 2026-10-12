"use client";

import { useState, useTransition } from "react";
import { createAgentAction } from "@/app/actions-collab";

export default function CreateAgentForm({
  onTokenIssued,
}: {
  onTokenIssued: (token: string, agentName: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<string>("other");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("请输入 Agent 名称");
      return;
    }
    if (trimmed.length > 200) {
      setError("名称不能超过 200 个字符");
      return;
    }

    startTransition(async () => {
      const res = await createAgentAction({
        displayName: trimmed,
        provider,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.token && res.agent) {
        onTokenIssued(res.token, res.agent.displayName);
        setDisplayName("");
        setProvider("other");
        setIsOpen(false);
      }
    });
  };

  if (!isOpen) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn3d inline-flex items-center gap-2 bg-beetle px-4 py-2.5 text-xs text-white [--sh:var(--color-beetle-dark)]"
        >
          <span>＋</span>
          <span>注册新 Agent</span>
        </button>
      </div>
    );
  }

  return (
    <div className="duo-card mt-3 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b-2 border-swan pb-3 dark:border-[#37464f]">
        <h3 className="text-sm font-black">注册新 Agent</h3>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          className="text-xs font-bold text-hare hover:text-mid"
        >
          取消
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <div className="rounded-xl border-2 border-cardinal/30 bg-cardinal/10 p-3 text-xs font-bold text-cardinal">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="agent-name" className="block text-xs font-extrabold text-mid">
            Agent 显示名称 <span className="text-cardinal">*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例如：Codex 代码排查员、Claude 架构分析师、本地静态检查 Bot"
            maxLength={200}
            className="duo-input mt-1.5 w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
          />
        </div>

        <div>
          <label htmlFor="agent-provider" className="block text-xs font-extrabold text-mid">
            提供商分类标签
          </label>
          <select
            id="agent-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1.5 w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
          >
            <option value="codex">Codex (OpenAI / Codex 外部客户端)</option>
            <option value="claude">Claude (Anthropic 外部客户端)</option>
            <option value="gemini">Gemini (Google DeepMind 外部客户端)</option>
            <option value="other">Other (自定义脚本 / 本地开发工具)</option>
          </select>
          <p className="mt-1.5 text-[11px] font-bold text-hare">
            ℹ️ 提示：分类标签仅供人类标识和区分外部调用者类型，不代表系统会自动调用该大模型接口。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            className="rounded-xl px-4 py-2 text-xs font-bold text-hare hover:text-mid"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isPending || !displayName.trim()}
            className="btn3d bg-beetle px-5 py-2 text-xs text-white [--sh:var(--color-beetle-dark)]"
          >
            {isPending ? "注册中..." : "确定注册并生成 Token"}
          </button>
        </div>
      </form>
    </div>
  );
}
