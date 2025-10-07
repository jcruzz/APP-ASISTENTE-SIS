import { NextResponse } from "next/server";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/app/lib/prisma";
import { buildAgent } from "@/app/lib/agent";

export const runtime = "nodejs";

type Body = { threadId?: string; message: string };

export async function POST(req: Request) {
  const { threadId, message } = (await req.json()) as Body;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message requerido" }, { status: 400 });
  }

  let thread = threadId
    ? await prisma.chatThread.findUnique({ where: { id: threadId } })
    : null;

  if (!thread) {
    thread = await prisma.chatThread.create({ data: { title: "Nueva conversación" } });
  }
  const threadIdDb = thread.id;

  await prisma.chatMessage.create({
    data: { threadId: threadIdDb, role: "user", content: message },
  });

  const history = await prisma.chatMessage.findMany({
    where: { threadId: threadIdDb },
    orderBy: { createdAt: "asc" },
  });

  const chat_history = history.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );

  const { executor, tool_descriptions } = await buildAgent();

  const result = await executor.invoke({
    input: message,
    chat_history,
    tool_descriptions, // <-- ¡IMPORTANTE!
  });

  const output = String(result.output ?? "");

  await prisma.chatMessage.create({
    data: {
      threadId: threadIdDb,
      role: "assistant",
      content: output,
      meta: result?.intermediateSteps ? (result.intermediateSteps as object[]) : undefined,
    },
  });

  return NextResponse.json({
    threadId: threadIdDb,
    output,
    steps: result?.intermediateSteps ?? [],
  });
}
