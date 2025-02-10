import { z } from "zod";
import { createDreams } from "../../packages/core/src/core/v1/dreams";
import {
    action,
    input,
    output,
} from "../../packages/core/src/core/v1/utils";
import { DiscordClient } from "../../packages/core/src/core/v0/io/discord";
import { createGroq } from "@ai-sdk/groq";
import { InferMemoryFromHandler, LogLevel } from "../../packages/core/src/core/v1/types";
import { tavilySearch } from "../../packages/core/src/core/v1/actions/tavily";
import {
    createContextHandler,
    createMemoryStore,
    defaultContext,
    defaultContextRender,
    // getContextMemoryHandler,
} from "@daydreamsai/core/src/core/v1/memory";

import { Research } from "./deep-research/research";
import { formatXml } from "@daydreamsai/core/src/core/v1/xml";

const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY!,
});

const discord = new DiscordClient({
    discord_token: process.env.DISCORD_TOKEN!,
    discord_bot_name: process.env.DISCORD_BOT_NAME!,
}, LogLevel.DEBUG);


const contextHandler = createContextHandler(
    () => ({
        ...defaultContext(),
        researches: [] as Research[],
    }),
    (memory) => {
        return [
            ...defaultContextRender(memory),
            ...memory.researches.map((r) =>
                formatXml({
                    tag: "research",
                    params: { id: r.id },
                    content: JSON.stringify(r),
                })
            ),
        ];
    }
);

type Handler = typeof contextHandler;
type Memory = InferMemoryFromHandler<Handler>;

async function main() {
    const agent = createDreams<Memory, Handler>({
        logger: LogLevel.DEBUG,
        memory: createMemoryStore(),
        context: contextHandler,
        model: groq("deepseek-r1-distill-llama-70b"),
        inputs: {
            "discord:message": input({
                schema: z.object({
                    chat: z.object({ id: z.number() }),
                    user: z.object({ id: z.string() }),
                    text: z.string(),
                }),
                handler: (message, { memory }) => {

                    memory.inputs.push({
                        ref: "input",
                        type: "discord:message",
                        params: { user: message.user.id.toString() },
                        data: message.text,
                        timestamp: Date.now(),
                    });

                    return true;
                },
                subscribe(send) {
                    discord.startMessageStream((content) => {
                        if ('data' in content) {
                            send(`discord:${content.threadId}`, {
                                chat: {
                                    id: parseInt(content.threadId),
                                },
                                user: {
                                    id: content.threadId,
                                },
                                text: content.data && typeof content.data === 'object' && 'content' in content.data ? content.data.content as string : '',
                            });
                        }
                    });

                    return () => {
                        discord.stopMessageStream();
                    };
                },
            }),
        },

        events: {
            "agent:thought": z.object({}),
            "agent:output": z.object({}),
        },

        outputs: {
            "discord:message": output({
                schema: z.object({
                    channelId: z.string().describe("The Discord channel ID to send the message to"),
                    content: z.string().describe("The content of the message to send"),
                }),
                description: "Send a message to a Discord channel",
                handler: async (data, ctx) => {
                    const messageOutput = discord.createMessageOutput();

                    if (!messageOutput || !messageOutput.execute) {
                        throw new Error("Failed to create Discord message output");
                    }
                    const result = await messageOutput?.execute({
                        channelId: data.channelId,
                        content: data.content,
                    });
                    return !!result;
                },
            }),
        },

        actions: [
            action({ ...tavilySearch }),
        ],
    });

    console.log("Starting Daydreams Discord Bot...");
}

main().catch((err) => {
    console.log(err);
});
