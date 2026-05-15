import { useCallback, useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { Streamdown } from "streamdown";

import { Button } from "@bun-mono/core-ui/button";
import { Input } from "@bun-mono/core-ui/input";
import { env } from "@bun-mono/env/web";

export const Route = createFileRoute("/ai")({
  component: RouteComponent,
});

function RouteComponent() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${env.VITE_SERVER_URL}/ai`,
    }),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      sendMessage({ text });
      setInput("");
    },
    [input, sendMessage],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
    [],
  );

  return (
    <div className="mx-auto grid w-full grid-rows-[1fr_auto] overflow-hidden p-4">
      <div className="space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground mt-8 text-center">
            Ask me anything to get started!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg p-3 ${
                message.role === "user" ? "bg-primary/10 ml-8" : "bg-secondary/20 mr-8"
              }`}
            >
              <p className="mb-1 text-sm font-semibold">
                {message.role === "user" ? "You" : "AI Assistant"}
              </p>
              {message.parts?.map((part) => {
                if (part.type === "text") {
                  return (
                    <Streamdown
                      key={`${message.id}-${part.text.slice(0, 32)}`}
                      isAnimating={status === "streaming" && message.role === "assistant"}
                    >
                      {part.text}
                    </Streamdown>
                  );
                }
                return null;
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2 border-t pt-2">
        <Input
          name="prompt"
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" size="icon">
          <Send size={18} />
        </Button>
      </form>
    </div>
  );
}
