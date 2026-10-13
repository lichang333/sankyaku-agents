"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  CollabError,
  createAgent,
  createChannel,
  createHandoff,
  grantAgent,
  listMessages,
  postMessage,
  revokeAgent,
  revokeAgentGrant,
  rotateAgentToken,
  withdrawOwnAgentGrant,
  type AgentPublic,
  type ChannelPublic,
  type ChannelType,
  type HandoffPublic,
  type MessageKind,
  type MessagePublic,
  type Principal,
} from "@/lib/collaboration";

function isRedirectError(err: unknown): boolean {
  return !!(
    err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function handleCollabError(err: unknown): { error: string } {
  if (isRedirectError(err)) {
    throw err;
  }
  if (err instanceof CollabError) {
    return { error: err.message };
  }
  return { error: "操作失败，请重试" };
}

function isForm(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isOptionalId(value: unknown): boolean {
  return value == null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

/* ══════════════════════════════════════════════════════════
 * 频道操作
 * ══════════════════════════════════════════════════════════ */

export async function createChannelAction(form: {
  name: string;
  summary?: string;
  type: ChannelType;
  boardIds: number[];
}): Promise<{ ok?: boolean; channel?: ChannelPublic; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!isForm(form) || typeof form.name !== "string" ||
        (form.summary !== undefined && typeof form.summary !== "string")) {
      return { error: "无效的频道表单" };
    }
    const name = form.name.trim();
    if (!name) return { error: "请输入频道名称" };
    if (name.length > 200) return { error: "频道名称不能超过 200 个字符" };

    const type = form.type;
    if (!["project", "topic", "bridge"].includes(type)) {
      return { error: "无效的频道类型" };
    }

    if (!Array.isArray(form.boardIds) || form.boardIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      return { error: "无效的项目看板 ID" };
    }
    const boardIds = form.boardIds;
    if (type === "project" && boardIds.length !== 1) {
      return { error: "项目协作频道需恰好关联 1 个项目看板" };
    }
    if (type === "topic" && boardIds.length !== 0) {
      return { error: "议题讨论频道不可关联项目看板" };
    }
    if (type === "bridge" && (boardIds.length < 2 || boardIds.length > 10)) {
      return { error: "跨项目协同频道需关联 2 至 10 个项目看板" };
    }

    const channel = createChannel(principal, {
      name,
      summary: form.summary?.trim(),
      type,
      boardIds,
    });

    revalidatePath("/collab");
    return { ok: true, channel };
  } catch (err) {
    return handleCollabError(err);
  }
}

/* ══════════════════════════════════════════════════════════
 * 消息操作
 * ══════════════════════════════════════════════════════════ */

export async function postMessageAction(
  channelId: number,
  form: {
    text: string;
    kind?: MessageKind;
    replyToId?: number | null;
    cardId?: number | null;
  },
): Promise<{ ok?: boolean; message?: MessagePublic; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }

    if (!isForm(form) || typeof form.text !== "string" ||
        !isOptionalId(form.cardId) || !isOptionalId(form.replyToId)) {
      return { error: "无效的消息表单" };
    }
    const text = form.text.trim();
    if (!text) return { error: "请输入消息内容" };
    if (text.length > 12000) return { error: "消息长度不能超过 12,000 个字符" };

    const msg = postMessage(principal, channelId, {
      text,
      kind: form.kind,
      replyToId: form.replyToId ?? null,
      cardId: form.cardId ?? null,
    });

    revalidatePath(`/collab/${channelId}`);
    return { ok: true, message: msg };
  } catch (err) {
    return handleCollabError(err);
  }
}

export async function loadOlderMessagesAction(
  channelId: number,
  beforeId: number,
): Promise<{ ok?: boolean; messages?: MessagePublic[]; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }
    if (!Number.isSafeInteger(beforeId) || beforeId < 1) {
      return { error: "无效的消息游标" };
    }

    const messages = listMessages(principal, channelId, { before: beforeId, limit: 100 });
    return { ok: true, messages };
  } catch (err) {
    return handleCollabError(err);
  }
}

/* ══════════════════════════════════════════════════════════
 * 任务交接操作
 * ══════════════════════════════════════════════════════════ */

export async function createHandoffAction(
  channelId: number,
  form: {
    toAgentId: string;
    brief: string;
    cardId?: number | null;
  },
): Promise<{ ok?: boolean; handoff?: HandoffPublic; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }

    if (!isForm(form) || typeof form.toAgentId !== "string" ||
        typeof form.brief !== "string" || !isOptionalId(form.cardId)) {
      return { error: "无效的交接表单" };
    }
    const toAgentId = form.toAgentId.trim();
    if (!toAgentId) return { error: "请选择接收此交接的 Agent" };

    const brief = form.brief?.trim();
    if (!brief) return { error: "请输入交接任务说明" };
    if (brief.length > 2000) return { error: "交接任务说明不能超过 2,000 个字符" };

    const handoff = createHandoff(principal, channelId, {
      toAgentId,
      brief,
      cardId: form.cardId ?? null,
    });

    revalidatePath(`/collab/${channelId}`);
    return { ok: true, handoff };
  } catch (err) {
    return handleCollabError(err);
  }
}

/* ══════════════════════════════════════════════════════════
 * 权限管理操作（仅授权自己的 Agent；创建者或拥有者可移除）
 * ══════════════════════════════════════════════════════════ */

export async function grantAgentAction(
  channelId: number,
  agentId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }
    if (typeof agentId !== "string" || !agentId.trim()) return { error: "无效的 Agent ID" };

    grantAgent(principal, channelId, agentId.trim());
    revalidatePath(`/collab/${channelId}`);
    return { ok: true };
  } catch (err) {
    return handleCollabError(err);
  }
}

export async function revokeAgentGrantAction(
  channelId: number,
  agentId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }
    if (typeof agentId !== "string" || !agentId.trim()) return { error: "无效的 Agent ID" };

    revokeAgentGrant(principal, channelId, agentId.trim());
    revalidatePath(`/collab/${channelId}`);
    return { ok: true };
  } catch (err) {
    return handleCollabError(err);
  }
}

/** 拥有者在 Agents 页面撤回自己 Agent 的频道授权（含已失效的授权）。 */
export async function withdrawAgentGrantAction(
  agentId: string,
  channelId: number,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (typeof agentId !== "string" || !agentId.trim()) return { error: "无效的 Agent ID" };
    if (!Number.isSafeInteger(channelId) || channelId < 1) {
      return { error: "无效的频道 ID" };
    }

    withdrawOwnAgentGrant(principal, agentId.trim(), channelId);
    revalidatePath("/agents");
    revalidatePath(`/collab/${channelId}`);
    return { ok: true };
  } catch (err) {
    return handleCollabError(err);
  }
}

/* ══════════════════════════════════════════════════════════
 * Agent 注册与凭证操作
 * ══════════════════════════════════════════════════════════ */

export async function createAgentAction(form: {
  displayName: string;
  provider?: string;
}): Promise<{ ok?: boolean; agent?: AgentPublic; token?: string; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (!isForm(form) || typeof form.displayName !== "string" ||
        (form.provider !== undefined && typeof form.provider !== "string")) {
      return { error: "无效的 Agent 表单" };
    }
    const displayName = form.displayName.trim();
    if (!displayName) return { error: "请输入 Agent 显示名称" };
    if (displayName.length > 200) return { error: "名称不能超过 200 个字符" };

    const provider = form.provider?.trim().toLowerCase() || "other";
    if (!["codex", "claude", "gemini", "other"].includes(provider)) {
      return { error: "请选择有效的提供商分类标签" };
    }

    const { agent, token } = createAgent(principal, { displayName, provider });
    revalidatePath("/agents");
    return { ok: true, agent, token };
  } catch (err) {
    return handleCollabError(err);
  }
}

export async function rotateAgentTokenAction(
  agentId: string,
): Promise<{ ok?: boolean; token?: string; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (typeof agentId !== "string" || !agentId.trim()) return { error: "无效的 Agent ID" };

    const { token } = rotateAgentToken(principal, agentId.trim());
    revalidatePath("/agents");
    return { ok: true, token };
  } catch (err) {
    return handleCollabError(err);
  }
}

export async function revokeAgentAction(
  agentId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const principal: Principal = { kind: "human", id: user.id };

    if (typeof agentId !== "string" || !agentId.trim()) return { error: "无效的 Agent ID" };

    revokeAgent(principal, agentId.trim());
    revalidatePath("/agents");
    return { ok: true };
  } catch (err) {
    return handleCollabError(err);
  }
}
