import { z } from "zod";
import {
  context,
  createContainer,
  createDreams,
  createMemoryStore,
  formatMsg,
  input,
  LogLevel,
  output,
} from "@daydreamsai/core/v1";
import { DiscordClient } from "@daydreamsai/core/io/discord";
import { createGroq } from "@ai-sdk/groq";
import { researchDeepActions } from "./deep-research/research";
import { tavily } from "@tavily/core";
import { Events, Message } from "discord.js";

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!,
});

const model = groq("deepseek-r1-distill-llama-70b");

const memory = createMemoryStore();

const container = createContainer()
  .singleton(tavily, () =>
    tavily({
      apiKey: process.env.TAVILY_API_KEY!,
    })
  )
  .singleton(
    "discord",
    () =>
      new DiscordClient(
        {
          discord_token: process.env.DISCORD_TOKEN!,
          discord_bot_name: process.env.DISCORD_BOT_NAME!,
        },
        LogLevel.DEBUG
      )
  );

container.resolve(tavily);

const discordChannelContext = context({
  type: "discord:channel",
  key: ({ channelId }) => channelId,
  schema: z.object({ channelId: z.string() }),
  async setup(args, agent) {
    const channel = await container
      .resolve<DiscordClient>("discord")
      .client.channels.fetch(args.channelId);

    if (!channel) throw new Error("Invalid channel");

    return { channel };
  },
});

const agent = createDreams({
  logger: LogLevel.DEBUG,
  memory,
  container,
  model,
  debugger: async (contextId, keys, data) => {
    const [type, id] = keys;
    await Bun.write(`./logs/${contextId}/${id}-${type}.md`, data);
  },
  inputs: {
    "discord:message": input({
      schema: z.object({
        chat: z.object({ id: z.string() }),
        user: z.object({ id: z.string(), name: z.string() }),
        text: z.string(),
      }),
      format: ({ user, text }) =>
        formatMsg({
          role: "user",
          user: user.name,
          content: text,
        }),
      subscribe(send, agent) {
        function listener(message: Message) {
          if (
            message.author.displayName ==
            container.resolve<DiscordClient>("discord").credentials
              .discord_bot_name
          ) {
            console.log(
              `Skipping message from ${container.resolve<DiscordClient>("discord").credentials.discord_bot_name}`
            );
            return;
          }
          send(
            discordChannelContext,
            { channelId: message.channelId },
            {
              chat: {
                id: message.channelId,
              },
              user: {
                id: message.member!.id,
                name: message.member!.displayName,
              },
              text: message.content,
            }
          );
        }

        const discord = agent.container.resolve<DiscordClient>("discord");

        discord.client.on(Events.MessageCreate, listener);
        return () => {
          discord.client.off(Events.MessageCreate, listener);
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
        channelId: z
          .string()
          .describe("The Discord channel ID to send the message to"),
        content: z.string().describe("The content of the message to send"),
      }),
      description: "Send a message to a Discord channel",
      format: ({ content }) =>
        formatMsg({
          role: "assistant",
          content,
        }),
      handler: async (data, ctx) => {
        const channel = await container
          .resolve<DiscordClient>("discord")
          .client.channels.fetch(data.channelId);
        if (channel && channel.isSendable()) {
          await container.resolve<DiscordClient>("discord").sendMessage(data);
          return {
            data,
            timestamp: Date.now(),
          };
        }
      },
    }),
  },

  actions: [...researchDeepActions],
});

console.log("Starting Daydreams Discord Bot...");

agent.start();

console.log("Daydreams Discord Bot started");
