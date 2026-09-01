import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { getChatModel } from "@/features/ai/utils/model";
import {
  loadChatMessages,
  saveChatMessages,
} from "@/features/ai/actions/chat-store";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  stepCountIs,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { requireUser } from "@/features/auth/action/require-user";
import { z } from "zod";
import { TinyFish } from "@tiny-fish/sdk";

async function webSearch(query: string) {
  const client = new TinyFish();
  const response = await client.search.query({ query });
  return response.results;
}

export async function POST(req: Request) {
  await auth.protect();

  const { message, id }: { message: UIMessage; id: string } = await req.json();

  if (!message || !id) {
    return new Response("Missing message or conversation id", { status: 400 });
  }

  const user = await requireUser();

  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  const previousMessages = await loadChatMessages(id);

  const alreadySaved = previousMessages.some(
    (storedMessage) => storedMessage.id === message.id,
  );

  const messages = alreadySaved
    ? previousMessages
    : [...previousMessages, message];

  if (!alreadySaved) {
    await saveChatMessages(id, [message]);
  }

  const result = streamText({
    model: getChatModel(conversation.model),
    system: conversation.systemPrompt ?? "You are ChadGpt, a helpful assistant",
    messages: await convertToModelMessages(messages),
    tools: {
      webSearch: tool({
        description: "Searches the web for information based on query.",
        inputSchema: z.object({
          query: z.string().min(1),
        }),
        execute: async ({ query }) => {
          try {
            return await webSearch(query);
          } catch (error) {
            console.error("web search failed:", error);

            return {
                error: error instanceof Error
                ? error.message
                : "Unknown web search error",
            };
          }
        },
      }),
    },

    stopWhen: stepCountIs(5),
  });

  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onEnd: async ({ messages: finalMessages }) => {
        try {
          await saveChatMessages(id, finalMessages, { updateTitle: false });
        } catch (error) {
          console.error(error);
        }
      },
    }),
  });
}
