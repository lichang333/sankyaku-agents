"use client";

import { useState, useTransition } from "react";
import { revokeAgentAction, rotateAgentTokenAction } from "@/app/actions-collab";
import { relTime } from "@/lib/dates";
import type { AgentPublic } from "@/lib/collaboration";

export default function AgentList({
  agents,
  onTokenIssued,
}: {
  agents: AgentPublic[];
  onTokenIssued: (token: string, agentName: string) => void;
}) {
  const [confirmRotateId, setConfirmRotateId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRotate = (agent: AgentPublic) => {
    setError(null);
    startTransition(async () => {
      const res = await rotateAgentTokenAction(agent.id);
      setConfirmRotateId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.token) {
        onTokenIssued(res.token, agent.displayName);
      }
    });
  };

  const handleRevoke = (agentId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await revokeAgentAction(agentId);
      setConfirmRevokeId(null);
      if (res.error) {
        setError(res.error);
      }
    });
  };

  const activeAgents = agents.filter((a) => !a.revoked);
  const revokedAgents = agents.filter((a) => a.revoked);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border-2 border-cardinal/30 bg-cardinal/10 p-3 text-xs font-bold text-cardinal">
          {error}
        </div>
      )}

      {/* 活跃的 Agent 列表 */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-extrabold text-mid">有效 Agent 列表 ({activeAgents.length})</h4>

        {activeAgents.length === 0 ? (
          <div className="duo-card p-6 text-center">
            <div className="text-2xl">🤖</div>
            <p className="mt-1 text-xs font-bold text-hare">
              当前暂无注册的有效 Agent。请点击下方按钮注册您的第一个 Agent。
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {activeAgents.map((agent) => {
              const isRotating = confirmRotateId === agent.id;
              const isRevoking = confirmRevokeId === agent.id;

              return (
                <div key={agent.id} className="duo-card flex flex-col justify-between p-3.5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="truncate text-sm font-black">{agent.displayName}</h4>
                      <span className="shrink-0 rounded bg-beetle/15 px-1.5 py-0.5 text-[10px] font-black text-beetle-dark dark:text-beetle">
                        {agent.provider}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-[11px] font-bold text-hare">
                      <span className="text-macaw-dark dark:text-macaw">● 已注册 / 待接入</span>
                      <span>·</span>
                      <span title={agent.createdAt}>{relTime(agent.createdAt)}</span>
                    </div>

                    <div className="mt-1 font-mono text-[10px] text-hare truncate">
                      ID: {agent.id}
                    </div>
                  </div>

                  {/* 操作区域 */}
                  <div className="mt-4 border-t border-swan pt-2.5 dark:border-[#37464f]">
                    {isRotating ? (
                      <div className="rounded-lg border-2 border-bee/40 bg-bee/10 p-2 text-xs font-bold">
                        <p className="text-bee-dark dark:text-bee">
                          确认重新生成 Token？原 Token 将立即失效，需在外部客户端配置新 Token。
                        </p>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setConfirmRotateId(null)}
                            className="rounded px-2 py-0.5 text-[11px] text-hare hover:text-mid"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRotate(agent)}
                            className="btn3d bg-bee px-2.5 py-0.5 text-[11px] text-black [--sh:var(--color-bee-dark)]"
                          >
                            {isPending ? "重置中..." : "确认重置"}
                          </button>
                        </div>
                      </div>
                    ) : isRevoking ? (
                      <div className="rounded-lg border-2 border-cardinal/40 bg-cardinal/10 p-2 text-xs font-bold">
                        <p className="text-cardinal">
                          确认注销该 Agent？注销后该 Token 立即永久失效，此 Agent 将退出所有频道且不可恢复。
                        </p>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setConfirmRevokeId(null)}
                            className="rounded px-2 py-0.5 text-[11px] text-hare hover:text-mid"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRevoke(agent.id)}
                            className="btn3d bg-cardinal px-2.5 py-0.5 text-[11px] text-white [--sh:var(--color-cardinal-dark)]"
                          >
                            {isPending ? "注销中..." : "确认注销"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRotateId(agent.id)}
                          className="rounded-lg border border-swan px-2 py-1 text-xs font-bold text-mid hover:border-bee hover:text-bee-dark dark:border-[#37464f]"
                        >
                          重置 Token
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(agent.id)}
                          className="rounded-lg border border-cardinal/30 px-2 py-1 text-xs font-bold text-cardinal hover:bg-cardinal/10"
                        >
                          注销 Agent
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 已注销的 Agent 列表 */}
      {revokedAgents.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-extrabold text-hare">已注销的 Agent ({revokedAgents.length})</h4>
          <div className="grid gap-2 sm:grid-cols-2 opacity-60">
            {revokedAgents.map((agent) => (
              <div
                key={agent.id}
                className="duo-card p-3 text-xs line-through"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold">{agent.displayName}</span>
                  <span className="rounded bg-cardinal/10 px-1.5 py-0.2 text-[10px] font-black text-cardinal">
                    已注销
                  </span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-hare">ID: {agent.id}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
