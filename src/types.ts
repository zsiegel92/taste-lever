import { z } from "zod";

export const compiledPromptSchema = z.object({
  systemPrompt: z.string().describe("The system prompt to use for the prompt."),
  preExamplesPrompt: z
    .string()
    .describe("The part of the prompt that precedes few-shot examples."),
  postExamplesPreTestCasePrompt: z
    .string()
    .describe(
      "The part of the prompt after the few-shot examples that precedes the test case."
    ),
  finalPrompt: z
    .string()
    .describe("The part of the prompt that follows the test case."),
});

export type CompiledPrompt = z.infer<typeof compiledPromptSchema>;

type ScoredDimensions = Record<string, number>;

export type Dimension<T extends ScoredDimensions> = {
  name: keyof T;
  description: string;
};

export function toZodSchema<
  const T extends readonly Dimension<Record<string, number>>[],
>(dimensions: T) {
  type Keys = T[number]["name"];
  type Schema = Record<Keys, z.ZodNumber>;

  const schemaEntries = dimensions.map(
    (dim) =>
      [dim.name, z.number().min(0).max(3).describe(dim.description)] as const
  );
  const schema = Object.fromEntries(schemaEntries) as Schema;

  return z.object(schema);
}

export function toDimensions<T extends ScoredDimensions>(
  schema: z.ZodObject<{ [K in keyof T]: z.ZodNumber }>
): Dimension<T>[] {
  return Object.entries(schema.shape).map(([name, zod]) => ({
    name: name as keyof T,
    description: zod.description ?? "",
  }));
}

export type DataAndTargetSchema<D, T> = z.ZodObject<{
  data: z.ZodType<D>;
  target: z.ZodType<T>;
}>;

export type DataPoint<D, T> = z.output<DataAndTargetSchema<D, T>>;

export type CompiledPromptWithFewshotExamples<D, T> = {
  prompt: CompiledPrompt;
  examples: {
    data: D;
    target: T;
    explanation: string;
  }[];
};

export type DataPointWithPredictionAndConfidence<D, T> = {
  dataPoint: DataPoint<D, T>;
  prediction: T
  confidence: number;
};

export function assertIsConcreteZodSchema(
  schema: unknown
): asserts schema is z.ZodTypeAny {
  if (!schema || typeof schema !== "object" || !("_def" in schema)) {
    throw new Error("Target schema must be a concrete Zod schema");
  }
}


export function getJsonSchemaForZodSchemaOfExamples<R>(
  schema: z.ZodType<R>,
) {
  const compiledPromptWithExamplesSchema = z.object({
    prompt: compiledPromptSchema,
    examples: z.array(schema),
    $schema: z.string().optional(),
  });
  return z.toJSONSchema(compiledPromptWithExamplesSchema);
}