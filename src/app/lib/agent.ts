import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

export function llm() {
  return new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY!,
    streaming: true
  });
}

const timeTool = new DynamicStructuredTool({
  name: "current_time",
  description: "Devuelve la hora actual en ISO-8601.",
  schema: z.object({}),
  func: async () => new Date().toISOString(),
});

const calcTool = new DynamicStructuredTool({
  name: "calculator",
  description: "Evalúa expresiones aritméticas simples. Ej: (2+3*5)/2",
  schema: z.object({ expression: z.string() }),
  func: async (input: unknown) => {
    const { expression } = input as { expression: string };
    if (!/^[\d+\-*/().\s]+$/.test(expression)) throw new Error("Expresión no permitida");
     
    const value = Function(`"use strict"; return (${expression});`)();
    return String(value);
  },
});

export async function buildAgent(): Promise<{
  executor: AgentExecutor;
  tool_descriptions: string;
}> {
  const model = llm();
  const tools = [timeTool, calcTool];
  const tool_descriptions = tools.map(t => `- ${t.name}: ${t.description}`).join("\n");

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Eres un asistente útil. Puedes usar herramientas cuando sea necesario.",
        "Herramientas disponibles:",
        "{tool_descriptions}",
        "Cuando uses herramientas, explica brevemente el resultado.",
      ].join("\n"),
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIToolsAgent({
    llm: model,
    tools,
    prompt,
  });

  const executor = new AgentExecutor({ agent, tools });
  return { executor, tool_descriptions };
}
