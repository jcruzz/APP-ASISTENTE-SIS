import { NextResponse } from "next/server";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/app/lib/prisma";
import { buildAgent } from "@/app/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { threadId?: string; message: string };

function sse(
  controller: ReadableStreamDefaultController,
  evt: string,
  data: any
) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  controller.enqueue(`event: ${evt}\n`);
  controller.enqueue(`data: ${payload}\n\n`);
}

export async function POST(req: Request) {
  const { threadId, message } = (await req.json()) as Body;
  if (!message || typeof message !== "string") {
    return new NextResponse("message requerido", { status: 400 });
  }

  // 1) thread (crea si no existe)
  let thread = threadId
    ? await prisma.chatThread.findUnique({ where: { id: threadId } })
    : null;

  if (!thread) {
    thread = await prisma.chatThread.create({
      data: { title: "Nueva conversación" },
    });
  }
  const threadIdDb = thread.id;

  // 2) persistir mensaje del usuario
  await prisma.chatMessage.create({
    data: { threadId: threadIdDb, role: "user", content: message },
  });

  // 3) historial como mensajes LangChain
  const history = await prisma.chatMessage.findMany({
    where: { threadId: threadIdDb },
    orderBy: { createdAt: "asc" },
  });

  const chat_history = history.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );

  // 4) construir agente
  const { executor, tool_descriptions } = await buildAgent();

  // 5) stream SSE
const stream = new ReadableStream({
async start(controller) {
  let assistantBuffer = "";
  let closed = false;

  const safeEnqueue = (s: string) => {
    if (closed) return;
    try { controller.enqueue(s); } catch {}
  };

  // keep-alive con setTimeout (no setInterval)
  let pingTimer: NodeJS.Timeout | null = null;
  const schedulePing = () => {
    if (closed) return;
    pingTimer = setTimeout(() => {
      if (!closed) safeEnqueue(`: ping\n\n`);
      schedulePing();
    }, 15000);
  };
  schedulePing();

  // abort si el cliente cierra
  // @ts-ignore
  req?.signal?.addEventListener?.("abort", () => {
    if (pingTimer) clearTimeout(pingTimer);
    closed = true;
    try { controller.close(); } catch {}
  });

  // 0) sanity check de API key
  if (!process.env.OPENAI_API_KEY) {
    safeEnqueue(`event: error\n`);
    safeEnqueue(`data: ${JSON.stringify({ message: "Falta OPENAI_API_KEY en .env" })}\n\n`);
    if (pingTimer) clearTimeout(pingTimer);
    closed = true;
    try { controller.close(); } catch {}
    return;
  }

  try {
    // ---- INTENTO 1: agente con herramientas (streamEvents v2) ----
    const events = await executor.streamEvents(
      { input: message, chat_history, tool_descriptions },
      { version: "v2" }
    );

    for await (const e of events) {
      // 1) tokens LLM (algunos proveedores)
      if (e.event === "on_llm_stream") {
        const token = (e.data?.chunk?.content ?? "") as string;
        if (token) {
          assistantBuffer += token;
          safeEnqueue(`event: token\n`); safeEnqueue(`data: ${token}\n\n`);
        }
      }

      // 2) tokens chat (OpenAI chat)
      if (e.event === "on_chat_model_stream") {
        const chunk = e.data?.chunk;
        let token = "";
        if (typeof chunk?.content === "string") token = chunk.content;
        else if (Array.isArray(chunk?.content)) token = chunk.content.map((c: any) => c?.text ?? "").join("");
        if (token) {
          assistantBuffer += token;
          safeEnqueue(`event: token\n`); safeEnqueue(`data: ${token}\n\n`);
        }
      }

      // herramientas
      if (e.event === "on_tool_start") {
        safeEnqueue(`event: tool_start\n`);
        safeEnqueue(`data: ${JSON.stringify({ tool: e.name, input: e.data?.input })}\n\n`);
      }
      if (e.event === "on_tool_end") {
        safeEnqueue(`event: tool_output\n`);
        safeEnqueue(`data: ${JSON.stringify({ tool: e.name, output: e.data?.output })}\n\n`);
      }

      // captura salida final si no hubo tokens
      if (e.event === "on_chain_end" && e.data?.output && !assistantBuffer) {
        const out = e.data.output;
        const finalText = typeof out === "string" ? out : out?.output ?? out?.content ?? "";
        if (finalText) {
          // simula streaming
          const parts = String(finalText).match(/.{1,24}/g) ?? [String(finalText)];
          for (const p of parts) {
            safeEnqueue(`event: token\n`); safeEnqueue(`data: ${p}\n\n`);
            await new Promise(r => setTimeout(r, 10));
          }
          assistantBuffer = String(finalText);
        }
      }
    }
  } catch (err: any) {
    // ---- INTENTO 2: fallback a streaming directo del modelo (sin agente) ----
    // Esto ayuda a distinguir: ¿falla la red/OpenAI o el agente?
    console.error("streamEvents error:", err?.message, err?.stack);
    safeEnqueue(`event: warn\n`);
    safeEnqueue(`data: ${JSON.stringify({ message: "Fallo stream del agente, probando fallback directo", detail: err?.message })}\n\n`);

    try {
      const { ChatOpenAI } = await import("@langchain/openai");
      const model = new ChatOpenAI({
        model: "gpt-4o-mini",
        temperature: 0.2,
        apiKey: process.env.OPENAI_API_KEY!,
        streaming: true,
      });

      // stream “puro” del modelo
      const stream = await model.stream([["human", message]]);
      for await (const chunk of stream) {
        // chunk.content puede ser string o array de bloques
        let token = "";
        if (typeof (chunk as any)?.content === "string") token = (chunk as any).content;
        else if (Array.isArray((chunk as any)?.content)) token = (chunk as any).content.map((c: any) => c?.text ?? "").join("");

        if (token) {
          assistantBuffer += token;
          safeEnqueue(`event: token\n`); safeEnqueue(`data: ${token}\n\n`);
        }
      }
    } catch (fallbackErr: any) {
      console.error("fallback stream error:", fallbackErr?.message, fallbackErr?.stack);
      safeEnqueue(`event: error\n`);
      safeEnqueue(`data: ${JSON.stringify({ message: fallbackErr?.message || "Connection error (fallback)" })}\n\n`);
    }
  } finally {
    // persistir respuesta si la hubo
    if (assistantBuffer) {
      await prisma.chatMessage.create({
        data: { threadId: threadIdDb, role: "assistant", content: assistantBuffer },
      });
    }

    safeEnqueue(`event: done\n`);
    safeEnqueue(`data: ${JSON.stringify({ threadId: threadIdDb })}\n\n`);

    if (pingTimer) clearTimeout(pingTimer);
    closed = true;
    try { controller.close(); } catch {}
  }
}

});

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx
    },
  });
}
