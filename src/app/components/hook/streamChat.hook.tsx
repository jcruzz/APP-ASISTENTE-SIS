"use client";
import { useRef, useState } from "react";

export function useChatSSE() {
  const [text, setText] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const bufferRef = useRef<string>("");

  const start = async (message: string, tId?: string) => {
    setText("");

    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, threadId: tId ?? threadId ?? undefined }),
    });
    if (!res.ok || !res.body) throw new Error("No se pudo conectar al stream");

    const reader = res.body.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // acumula en un buffer y sólo procesa bloques completos "\n\n"
      bufferRef.current += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = bufferRef.current.indexOf("\n\n")) !== -1) {
        const block = bufferRef.current.slice(0, sepIndex);
        bufferRef.current = bufferRef.current.slice(sepIndex + 2);

        // parsea el bloque SSE
        const lines = block.split("\n");
        const evtLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));

        const evt = evtLine ? evtLine.slice("event:".length).trim() : "";
        // ¡NO .trim()! preserva espacios tal cual los mandó el servidor
        const dataRaw = dataLine ? dataLine.slice("data:".length) : "";

        if (evt === "token") {
          setText((prev) => prev + dataRaw); // conserva espacios iniciales
        } else if (evt === "done") {
          try {
            const payload = JSON.parse(dataRaw);
            if (payload?.threadId) setThreadId(payload.threadId);
          } catch {}
        } else if (evt === "thread") {
          try {
            const payload = JSON.parse(dataRaw);
            if (payload?.threadId) setThreadId(payload.threadId);
          } catch {}
        }
        // tool_start / tool_output -> opcional para logs
      }
    }
  };

  const stop = async () => {
    try { await readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
    bufferRef.current = "";
  };

  return { text, threadId, start, stop };
}
