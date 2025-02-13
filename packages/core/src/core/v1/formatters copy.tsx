import zodToJsonSchema from "zod-to-json-schema";
import type { Action, InputRef, Log, Output, OutputRef } from "./types";
import { formatXml } from "./xml";
import { formatValue } from "./utils";
import type { AnyContext, Context } from "./context";
import type { JSX } from "react";

/**
 * Formats an input reference into XML format
 * @param input - The input reference to format
 * @returns XML string representation of the input
 */
export function formatInput(input: InputRef) {
  return formatXml({
    tag: "input",
    params: { name: input.type, ...input.params },
    content:
      typeof input.data === "string" ? input.data : JSON.stringify(input.data),
  });
}

/**
 * Formats an output reference into XML format
 * @param output - The output reference to format
 * @returns XML string representation of the output
 */
export function formatOutput(output: OutputRef) {
  return formatXml({
    tag: "output",
    params: { name: output.type, ...output.params },
    content:
      typeof output.data === "string"
        ? output.data
        : JSON.stringify(output.data),
  });
}

/**
 * Formats an output interface definition into XML format
 * @param output - The output interface to format
 * @returns XML string representation of the output interface
 */
export function formatOutputInterface(output: Output) {
  return formatXml({
    tag: "output",
    params: { name: output.type },
    content: [
      output.description
        ? { tag: "instructions", content: output.description }
        : null,
      {
        tag: "schema",
        content: JSON.stringify(zodToJsonSchema(output.schema, "output")),
      },
    ].filter((c) => !!c),
  });
}

export function formatAction(action: Action<any, any, any>) {
  return formatXml({
    tag: "action",
    params: { name: action.name },
    content: [
      action.description
        ? {
            tag: "description",
            content: action.description,
          }
        : null,
      action.schema
        ? {
            tag: "schema",
            content: JSON.stringify(zodToJsonSchema(action.schema, "action")),
          }
        : null,
    ].filter((t) => !!t),
  });
}

type InferContextMemory<TContext extends AnyContext> =
  TContext extends Context<infer Memory> ? Memory : never;

type InferContextCtx<TContext extends AnyContext> =
  TContext extends Context<any, any, infer Ctx> ? Ctx : never;

function formatContext<TContext extends AnyContext>(
  handler: TContext,
  params: {
    args: TContext["args"];
    key: string;
    memory: InferContextMemory<TContext>;
    ctx: InferContextCtx<TContext>;
  }
) {
  return formatXml({
    tag: "context",
    params: { type: handler.type, key: params.key },
    content: [
      handler.description
        ? formatXml({ tag: "description", content: handler.description })
        : "",
      handler.instructions
        ? formatXml({
            tag: "instructions",
            content:
              typeof handler.instructions === "function"
                ? handler.instructions(
                    { args: params.args, key: params.key },
                    params.ctx
                  )
                : handler.instructions,
          })
        : "",
    ],
  });
}

interface ContextElement {
  type: string;
  key: string;
  children: React.ReactNode;
}

// Extend the JSX namespace
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // Add your custom elements here
      context: ContextElement;
      description: {};
      instructions: {};
      // You can add more custom elements as needed
    }
  }
}

function renderContext<TContext extends AnyContext>(
  handler: TContext,
  params: {
    args: TContext["args"];
    key: string;
    memory: InferContextMemory<TContext>;
    ctx: InferContextCtx<TContext>;
  }
) {
  return (
    <context type={handler.type} key={params.key}>
      {handler.description && <description>{handler.description}</description>}
      {handler.instructions && (
        <instructions>
          {typeof handler.instructions === "function"
            ? handler.instructions(
                { args: params.args, key: params.key },
                params.ctx
              )
            : handler.instructions}
        </instructions>
      )}
      {handler.render && handler.render(params.memory, params.ctx)}
    </context>
  );
}

export function formatContextLog(i: Log) {
  switch (i.ref) {
    case "input":
      return formatXml({
        tag: "msg",
        params: {
          ...i.params,
          role: "user",
        },
        content: formatValue(i.data),
      });
    case "output":
      return formatXml({
        tag: "msg",
        params: {
          ...i.params,
          role: "assistant",
        },
        content: formatValue(i.data),
      });
    case "thought":
      return formatXml({
        tag: "reflection",
        params: { role: "assistant" },
        content: i.content,
      });
    case "action_call":
      return formatXml({
        tag: "action_call",
        params: { id: i.id, name: i.name },
        content: JSON.stringify(i.data),
      });
    case "action_result":
      return formatXml({
        tag: "action_result",
        params: { name: i.name, callId: i.callId },
        content: JSON.stringify(i.data),
      });
    default:
      throw new Error("invalid context");
  }
}
