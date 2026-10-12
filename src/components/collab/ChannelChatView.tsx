"use client";

import { useState } from "react";
import MessageComposer, { type CardOption, type ReplyingMessage } from "./MessageComposer";
import MessageList from "./MessageList";
import type { ChannelType, MessagePublic } from "@/lib/collaboration";

export default function ChannelChatView({
  channelId,
  channelType,
  initialMessages,
  cardTitles,
  availableCards,
}: {
  channelId: number;
  channelType: ChannelType;
  initialMessages: MessagePublic[];
  cardTitles: Record<number, string>;
  availableCards: CardOption[];
}) {
  const [replyingTo, setReplyingTo] = useState<ReplyingMessage | null>(null);

  return (
    <div className="space-y-3">
      {/* 消息历史列表 */}
      <MessageList
        channelId={channelId}
        initialMessages={initialMessages}
        cardTitles={cardTitles}
        onSelectReply={(msg) => setReplyingTo(msg)}
      />

      {/* 消息发送栏 */}
      <MessageComposer
        channelId={channelId}
        channelType={channelType}
        availableCards={availableCards}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
