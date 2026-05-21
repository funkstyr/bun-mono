import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@bun-mono/core-ui/button";

type Props = {
  onSend: (text: string) => void;
  onTyping: () => void;
  disabled: boolean;
};

const MAX = 2000;

export function MessageInput({ onSend, onTyping, disabled }: Props): React.ReactElement {
  const [text, setText] = useState("");

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      setText(e.target.value);
      if (e.target.value.length > 0) onTyping();
    },
    [onTyping],
  );

  const handleSubmit = useCallback(
    (e: FormEvent): void => {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed.length === 0 || trimmed.length > MAX) return;
      onSend(trimmed);
      setText("");
    },
    [onSend, text],
  );

  return (
    <form onSubmit={handleSubmit} className="bg-background border-t px-4 py-2">
      <div className="flex gap-2">
        <textarea
          aria-label="Message"
          value={text}
          onChange={handleChange}
          disabled={disabled}
          rows={2}
          maxLength={MAX}
          placeholder={disabled ? "Connecting..." : "Type a message"}
          className="bg-background flex-1 resize-none rounded border px-2 py-1 text-sm"
        />

        <Button type="submit" disabled={disabled || text.trim().length === 0}>
          Send
        </Button>
      </div>

      <div className="text-muted-foreground mt-1 text-right text-xs">
        {text.length}/{MAX}
      </div>
    </form>
  );
}
