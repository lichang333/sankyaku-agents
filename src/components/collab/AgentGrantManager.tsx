"use client";

import { useState, useTransition } from "react";
import { grantAgentAction, revokeAgentGrantAction } from "@/app/actions-collab";
import type { AgentPublic } from "@/lib/collaboration";

export default function AgentGrantManager({
  channelId,
  eligibleAgents,
  isCreator,
}: {
  channelId: number;
  eligibleAgents: (AgentPublic & { granted: boolean; owned: boolean })[];
  isCreator: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggleGrant = (agentId: string, currentlyGranted: boolean) => {
    setError(null);
    setPendingAgentId(agentId);

    startTransition(async () => {
      const res = currentlyGranted
        ? await revokeAgentGrantAction(channelId, agentId)
        : await grantAgentAction(channelId, agentId);

      setPendingAgentId(null);
      if (res.error) {
        setError(res.error);
      }
    });
  };

  return (
    <div className="duo-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between border-b-2 border-swan pb-2.5 dark:border-[#37464f]">
        <h4 className="text-sm font-black">频道 Agent 授权</h4>
        {isCreator && (
          <span className="rounded-md bg-beetle/15 px-1.5 py-0.5 text-[10px] font-black text-beetle-dark dark:text-beetle">
            创建者权限
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[11px] font-bold text-hare">
        仅可将自己拥有的 Agent 授权进入频道；Agent 拥有者可随时取消自身授权，频道创建者可移除任意已授权 Agent。被授权的 Agent 及其拥有者需具有此频道关联看板的完整访问权限。
      </p>

      {error && (
        <div className="mt-2 rounded-lg border-2 border-cardinal/30 bg-cardinal/10 p-2 text-xs font-bold text-cardinal">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {eligibleAgents.length === 0 ? (
          <p className="py-2 text-center text-xs font-bold text-hare">
            你还没有可授权的 Agent。可在「Agents 管理」中注册。
          </p>
        ) : (
          eligibleAgents.map((a) => {
            const isActing = pendingAgentId === a.id;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-swan bg-[var(--card)] p-2.5 text-xs dark:border-[#37464f]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="truncate font-extrabold text-[var(--text)]">
                      {a.displayName}
                    </span>
                    <span className="rounded bg-[var(--track)] px-1.5 py-0.2 text-[10px] font-bold text-mid">
                      {a.provider}
                    </span>
                    {!a.owned && (
                      <span className="rounded bg-swan px-1.5 py-0.2 text-[10px] font-bold text-hare dark:bg-[#37464f]">
                        其他成员的 Agent
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-hare">
                    {a.granted ? (
                      <span className="font-bold text-feather-dark dark:text-feather">● 已授权参与</span>
                    ) : (
                      <span className="text-hare">○ 未授权</span>
                    )}
                  </div>
                </div>

                {!a.owned ? (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleToggleGrant(a.id, true)}
                    className="rounded-lg border border-cardinal/40 px-2.5 py-1 text-xs font-bold text-cardinal transition-colors hover:bg-cardinal/10 disabled:opacity-50"
                  >
                    {isActing ? "处理中..." : "移除"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleToggleGrant(a.id, a.granted)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
                      a.granted
                        ? "border border-cardinal/40 text-cardinal hover:bg-cardinal/10"
                        : "btn3d bg-beetle text-white [--sh:var(--color-beetle-dark)]"
                    }`}
                  >
                    {isActing
                      ? "处理中..."
                      : a.granted
                        ? "取消授权"
                        : "授权进入"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
