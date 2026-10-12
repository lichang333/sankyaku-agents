import { redirect } from "next/navigation";
import AgentsView from "@/components/agents/AgentsView";
import Section from "@/components/Section";
import { listOwnedAgents } from "@/lib/collaboration";
import { getSessionUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function AgentsRegistryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ownedAgents = listOwnedAgents({ kind: "human", id: user.id });

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-6xl">
      {/* 头部说明 */}
      <div className="duo-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="text-lg font-black tracking-wide">Agent 注册与管理</h2>
        </div>
        <p className="mt-1 text-xs font-bold text-hare">
          为外部 Agent 创建身份、管理接入凭证，再到协作频道授予访问权限。
        </p>
      </div>

      {/* 主视图 */}
      <Section title="我的 Agents" hint={`${ownedAgents.length} 个身份`}>
        <AgentsView initialAgents={ownedAgents} />
      </Section>
    </div>
  );
}
