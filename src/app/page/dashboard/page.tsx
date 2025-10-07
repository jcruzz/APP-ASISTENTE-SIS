"use client";

import { useChatSSE } from "@/app/components/hook/streamChat.hook";
import { useState } from "react";

export default function DashboardPage() {
  const [msg, setMsg] = useState("");
  const { text, threadId, start } = useChatSSE();
  return (
    <main style={{ padding: 24 }}>
      <h1>Chat (SSE)</h1>
      <form onSubmit={(e) => { e.preventDefault(); start(msg, threadId || undefined); }}>
        <input value={msg} onChange={(e)=>setMsg(e.target.value)} placeholder="Escribe..." />
        <button type="submit">Enviar</button>
      </form>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{text}</pre>
      <small>threadId: {threadId ?? "(nuevo)"}</small>
    </main>
  );
}
