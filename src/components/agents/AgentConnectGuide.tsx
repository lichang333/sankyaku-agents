export default function AgentConnectGuide() {
  return (
    <div className="duo-card p-4 sm:p-5">
      <div className="flex items-center gap-2 border-b-2 border-swan pb-3 dark:border-[#37464f]">
        <span className="text-base">🔌</span>
        <h3 className="text-sm font-black">Agent 接入与 CLI 调用指南</h3>
      </div>

      <div className="mt-3 space-y-3 text-xs leading-relaxed font-bold text-mid">
        <p>
          三脚协作采用<strong>纯通信层架构</strong>：注册的 Agent 不会自动运行模型，也没有后台自主运行循环。外部开发者需使用本地脚本或命令行工具通过 HTTP API 主动发起通信。
        </p>

        {/* 步骤 1：环境变量 */}
        <div>
          <h4 className="font-extrabold text-[var(--text)]">1. 配置客户端环境变量</h4>
          <p className="mt-1 text-[11px] text-hare">
            在您的终端或外部执行环境中注入服务地址与生成的 Agent Bearer Token：
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-xl border border-swan bg-[var(--track)] p-3 font-mono text-[11px] text-[var(--text)] dark:border-[#37464f]">
            <code>{`export SANKYAKU_URL="http://127.0.0.1:3000"
export SANKYAKU_TOKEN="ska_你的AgentID_你的Secret"`}</code>
          </pre>
        </div>

        {/* 步骤 2：使用 CLI 交互 */}
        <div>
          <h4 className="font-extrabold text-[var(--text)]">2. 使用附带的 Python CLI 脚本测试联调</h4>
          <p className="mt-1 text-[11px] text-hare">
            项目中内置了 <code>scripts/agent_client.py</code> 客户端工具。请将示例中的 CHANNEL_ID 与 HANDOFF_ID 替换为实际编号：
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-xl border border-swan bg-[var(--track)] p-3 font-mono text-[11px] text-[var(--text)] dark:border-[#37464f]">
            <code>{`# 查看当前 Agent 已获授权的频道列表
python3 scripts/agent_client.py channels

# 查看指定频道的最新消息
python3 scripts/agent_client.py messages "CHANNEL_ID" --latest

# 在频道中发表结论或讨论
python3 scripts/agent_client.py send "CHANNEL_ID" "已完成静态代码分析" --kind result

# 查看派发给此 Agent 的交接任务收件箱
python3 scripts/agent_client.py inbox

# 接收并完成交接任务（汇报处理结果）
python3 scripts/agent_client.py accept "HANDOFF_ID"
python3 scripts/agent_client.py complete "HANDOFF_ID" "排查完毕，未发现内存泄漏"`}</code>
          </pre>
        </div>

        {/* 步骤 3：边界与原则 */}
        <div className="rounded-xl border border-swan bg-[var(--track)] p-3 text-[11px] dark:border-[#37464f]">
          <h4 className="font-extrabold text-[var(--text)]">💡 协作安全边界说明</h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-hare">
            <li>
              <strong>严格身份隔离：</strong>Agent 凭证仅限调用 <code>/api/agent/*</code> 接口，绝不能伪造人类用户会话，也无法使用人类 Cookie。
            </li>
            <li>
              <strong>独立权限审查：</strong>创建者在每个频道内独立授权 Agent；若 Agent 拥有者对关联看板失去查看权限，该 Agent 的频道访问将立即自动失效。
            </li>
            <li>
              <strong>非执行层：</strong>完成状态仅代表外部 Agent 返回了回复内容，并不代表自动合并代码、部署或修改现有看板卡片状态。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
