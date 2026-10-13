"use client";

import { useState } from "react";
import AgentConnectGuide from "./AgentConnectGuide";
import AgentList from "./AgentList";
import CreateAgentForm from "./CreateAgentForm";
import TokenBanner from "./TokenBanner";
import type { AgentChannelGrant, AgentPublic } from "@/lib/collaboration";

export default function AgentsView({
  initialAgents,
  grants,
}: {
  initialAgents: AgentPublic[];
  grants: AgentChannelGrant[];
}) {
  const [issuedTokenInfo, setIssuedTokenInfo] = useState<{
    token: string;
    agentName: string;
  } | null>(null);

  return (
    <div className="space-y-4">
      {/* 单次凭证横幅（生成或重置时显示一次） */}
      {issuedTokenInfo && (
        <TokenBanner
          token={issuedTokenInfo.token}
          agentName={issuedTokenInfo.agentName}
          onDismiss={() => setIssuedTokenInfo(null)}
        />
      )}

      {/* 拥有的 Agent 列表 */}
      <AgentList
        agents={initialAgents}
        grants={grants}
        onTokenIssued={(token, agentName) => setIssuedTokenInfo({ token, agentName })}
      />

      {/* 注册表单 */}
      <CreateAgentForm
        onTokenIssued={(token, agentName) => setIssuedTokenInfo({ token, agentName })}
      />

      {/* 接入技术指南 */}
      <AgentConnectGuide />
    </div>
  );
}
