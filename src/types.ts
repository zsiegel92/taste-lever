import { z } from "zod";

const compiledPromptSchema = z.object({
  systemPrompt: z.string(),
  preExamplesPrompt: z.string(),
  postExamplesPreTestCasePrompt: z.string(),
  finalPrompt: z.string(),
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


export type CompiledPromptWithFewshotExamples<D, T> = {
	prompt: CompiledPrompt;
	examples: {
	  data: D;
	  target: T;
	}[];
  };
  