// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import HandoffSection from "@/components/collab/HandoffSection";
import ChannelChatView from "@/components/collab/ChannelChatView";
import AgentsView from "@/components/agents/AgentsView";
import { createAgentAction, createHandoffAction, loadOlderMessagesAction, rotateAgentTokenAction } from "@/app/actions-collab";
import type { AgentPublic, MessagePublic } from "@/lib/collaboration";

vi.mock("@/app/actions-collab", () => ({
  createAgentAction: vi.fn(), createHandoffAction: vi.fn(), loadOlderMessagesAction: vi.fn(),
  rotateAgentTokenAction: vi.fn(), revokeAgentAction: vi.fn(), postMessageAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let host: HTMLDivElement;
let root: Root;
const agent = (id: string): AgentPublic => ({ id, displayName: id, provider: "other", revoked: false, createdAt: "2026-10-12T00:00:00Z" });
const message = (id: number, cardId: number | null = null): MessagePublic => ({
  id, cardId, channelId: 1, authorKind: "agent", authorId: "a", authorDisplayName: "Agent A",
  text: `Message ${id}`, kind: "discussion", replyToId: null, createdAt: "2026-10-12T00:00:00Z",
});
async function render(node: ReactNode) { await act(async () => { root.render(node); }); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  expect(button, `button: ${text}`).toBeTruthy();
  await act(async () => { button!.click(); });
}
async function fill(selector: string, value: string) {
  const input = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  expect(input).toBeTruthy();
  const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  localStorage.clear(); sessionStorage.clear();
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

const handoffs = (agents: AgentPublic[]) => <HandoffSection channelId={1} handoffs={[]} grantedAgents={agents} cardTitles={{}} availableCards={[]} />;
const chat = (messages: MessagePublic[], cards: Record<number, string> = {}, channel = 1) => <ChannelChatView key={channel} channelId={channel} channelType="project" initialMessages={messages} cardTitles={cards} availableCards={[]} />;

describe("Collaboration interaction regressions", () => {
  it("submits to the first newly granted agent and then replaces a revoked selection", async () => {
    vi.mocked(createHandoffAction).mockResolvedValue({ ok: true });
    await render(handoffs([]));
    await render(handoffs([agent("a")]));
    await click("发起交接"); await fill("#handoff-brief", "Review please"); await click("提交交接");
    expect(createHandoffAction).toHaveBeenLastCalledWith(1, { toAgentId: "a", brief: "Review please", cardId: null });
    await click("发起交接"); await fill("#handoff-brief", "Continue review");
    await render(handoffs([agent("b")]));
    expect((host.querySelector("#target-agent") as HTMLSelectElement).value).toBe("b");
    await click("提交交接");
    expect(createHandoffAction).toHaveBeenLastCalledWith(1, { toAgentId: "b", brief: "Continue review", cardId: null });
  });

  it("fills a gap after more than 100 new messages arrive, without duplicate messages", async () => {
    await render(chat([message(1)]));
    await render(chat(Array.from({ length: 100 }, (_, i) => message(i + 102))));
    expect(host.querySelector("#msg-1")).toBeNull();
    vi.mocked(loadOlderMessagesAction).mockResolvedValueOnce({ messages: Array.from({ length: 100 }, (_, i) => message(i + 2)) });
    await click("加载更早");
    expect(loadOlderMessagesAction).toHaveBeenLastCalledWith(1, 102);
    vi.mocked(loadOlderMessagesAction).mockResolvedValueOnce({ messages: [message(1)] });
    await click("加载更早");
    expect(host.querySelectorAll('[id^="msg-"]')).toHaveLength(202); // 201 messages + composer kind select
    for (let id = 1; id <= 201; id++) expect(host.querySelectorAll(`#msg-${id}`)).toHaveLength(1);
    expect(host.textContent).not.toContain("加载更早的历史消息");
  });

  it("removes invalid card links on refresh and keeps the draft only in the same channel", async () => {
    await render(chat([message(1, 8)], { 8: "Visible card" }));
    expect(host.querySelector('a[href="/c/8"]')).toBeTruthy();
    await fill('textarea[aria-label="消息内容"]', "Unsaved draft");
    await render(chat([message(1, null)], {}));
    expect(host.querySelector('a[href="/c/8"]')).toBeNull();
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Unsaved draft");
    await render(chat([message(2)], {}, 2));
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect(host.querySelector("#msg-1")).toBeNull();
  });

  it("shows a newly issued or rotated token and clears it when dismissed", async () => {
    vi.mocked(createAgentAction).mockResolvedValue({ ok: true, agent: agent("a"), token: "ska_creation_fixture" });
    vi.mocked(rotateAgentTokenAction).mockResolvedValue({ ok: true, token: "ska_rotation_fixture" });
    await render(<AgentsView initialAgents={[]} />);
    await click("注册新 Agent"); await fill("#agent-name", "a"); await click("确定注册");
    expect(host.textContent).toContain("ska_creation_fixture");
    await click("我已经保存好了"); expect(host.textContent).not.toContain("ska_creation_fixture");
    await render(<AgentsView initialAgents={[agent("a")]} />);
    await click("重置 Token"); await click("确认重置"); expect(host.textContent).toContain("ska_rotation_fixture");
    await click("我已经保存好了"); expect(host.textContent).not.toContain("ska_rotation_fixture");
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
});
