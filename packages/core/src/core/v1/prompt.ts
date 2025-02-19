import { ZodType } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import type { Node, ElementNode } from "./xml";
import { parse as parseXML } from "./xml";
import { render } from "./utils";
import type { TemplateVariables } from "./types";

export type Formatter<
  Variables extends Record<string, any> = Record<string, any>,
  Data = any,
> = (data: Data) => Record<keyof Variables, any>;

export type InferFormatter<TPrompt extends AnyPrompt> =
  TPrompt extends Prompt<infer Data, infer Variables>
    ? Formatter<Variables, Data>
    : never;

export type PromptVisitor<
  Output = any,
  Attributes extends Record<string, any> = Record<string, any>,
> = (
  output: Output,
  node: ElementNode<Attributes>,
  parse: () => Node[]
) => void;

export type GetVisitors<
  Output = any,
  T extends Record<string, Record<string, any>> = Record<
    string,
    Record<string, any>
  >,
> = {
  [K in keyof T]?: PromptVisitor<Output, T[K]>;
} & {
  [key: string]: PromptVisitor<Output, any>;
};

export type Prompt<
  Data = any,
  Variables extends Record<string, any> = Record<string, any>,
> = <TData extends Data>(
  data: TData,
  formatter?: Formatter<Variables, TData>
) => string;

export type AnyPrompt = Prompt<any, any>;

export type InferPromptVariables<TPrompt extends AnyPrompt> =
  TPrompt extends Prompt<any, infer Vars> ? Vars : never;

export type InferPromptData<TPrompt extends AnyPrompt> =
  TPrompt extends Prompt<infer Data> ? Data : never;

export type GeneratePromptConfig<
  TPrompt extends AnyPrompt | string = any,
  Variables extends Record<string, any> = any,
  Data = Record<string, any>,
  TFormatter extends Formatter<Variables, Data> = Formatter<Variables, Data>,
> = {
  template: TPrompt;
  variables: Variables;
  data: Data;
  formatter?: TFormatter;
};

export type InferGeneratePromptConfig<TPrompt extends AnyPrompt | string> =
  | (TPrompt extends Prompt<infer Data, infer Variables>
      ? GeneratePromptConfig<TPrompt, Variables, Data>
      : never)
  | (TPrompt extends string
      ? GeneratePromptConfig<TPrompt, TemplateVariables<TPrompt>>
      : never);

export type InferPromptComponents<TPrompt extends AnyPrompt | string> =
  TPrompt extends Prompt<any, infer Components> ? Components : never;

export function getZodJsonSchema(schema: ZodType<any>) {
  return zodToJsonSchema(schema as any, { name: "schema" }).definitions?.schema;
}

export function createPrompt<
  Data extends Record<string, any> = Record<string, any>,
  Template extends string = string,
  Variables extends TemplateVariables<Template> = TemplateVariables<Template>,
>(
  prompt: Template,
  formatter: Formatter<Variables, Data>
): Prompt<Data, Variables> {
  return (data, customFormatter) => {
    return render(
      prompt,
      customFormatter
        ? customFormatter(data)
        : formatter
          ? formatter(data)
          : data
    );
  };
}

export type Parser<Output> = (content: string) => Output;

export function createParser<
  Output = any,
  Components extends Record<string, Record<string, any>> = Record<
    string,
    Record<string, any>
  >,
  Visitors extends GetVisitors<Output, Components> = GetVisitors<
    Output,
    Components
  >,
>(getOutput: () => Output, visitors: Visitors): Parser<Output> {
  return (content) => {
    const state = getOutput();
    parseXML(content, (node, parse) => {
      if (node.type === "element" && node.name in visitors) {
        visitors[node.name](state, node as ElementNode<any>, parse);
      }
      return node;
    });

    return state;
  };
}
