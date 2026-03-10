"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import type { UIMessage } from "ai";

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
}

function getMessageText(msg: UIMessage): string {
  for (const part of msg.parts) {
    if (part.type === "text") return part.text;
  }
  return "";
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          role={msg.role as "user" | "assistant"}
          content={getMessageText(msg)}
        />
      ))}
      {isLoading && messages.at(-1)?.role === "user" && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
