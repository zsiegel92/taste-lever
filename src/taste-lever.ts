import * as z from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  type CompiledPromptWithFewshotExamples,
  type DataAndTargetSchema,
} from "./types";

// export class TasteLever<T extends z.ZodObject> {
//   constructor(
//     private schema: T,
//     options: {
//       dimensions: Dimension[]
//       getExamples: () => Promise<z.output<T>[]>;
//     }
//   ) {}

//   private parseData(data: unknown): z.output<T> {
//     return z.parse(this.schema, data);
//   }

//   async compile(): Promise<CompiledPrompt> {
//     // TODO: Implement
//     return {
//       systemPrompt: "You are a helpful assistant",
//       preExamplesPrompt: "",
//       postExamplesPreTestCasePrompt: "",
//       finalPrompt: "",
//     };
//   }

//   async save(): Promise<void> {
//     // TODO: Implement
//   }
// }

const responseSchema = z.object({
  response: z.object({
    body: z.object({
      choices: z.array(
        z.object({
          message: z.object({ content: z.string() }),
          logprobs: z.object({
            content: z.array(
              z.object({
                token: z.string(),
                logprob: z.number(),
              })
            ),
          }),
        })
      ),
    }),
  }),
});

export async function compile<D, T>({
  schema,
  train,
  test,
  getScoreFromTargetObject,
}: {
  schema: DataAndTargetSchema<D, T>;
  train: z.output<DataAndTargetSchema<D, T>>[];
  test: z.output<DataAndTargetSchema<D, T>>[];
  getScoreFromTargetObject: (predicted: T) => number;
  // lossFunction: (predicted: T, target: T) => number;
}): Promise<CompiledPromptWithFewshotExamples<D, T>> {
  // TODO: uniquify with sha hashing elements
  // TODO: separate out few-shot examples by finding high-confidence wrong examples
  console.log(schema);
  console.log(train);
  console.log(test);

  const targetSchema = schema.shape.target;
  const result = await generateObject({
    model: openai.chat("gpt-4.1"),
    providerOptions: {
      openai: {
        logprobs: true,
      },
    },
    schema: targetSchema,
    // schema: z.object({ ...targetSchema.shape }),
    // schema: z.object({x: z.number()}),
    prompt: "",
  });
  const prediction = targetSchema.parse(result.object);
  const resultBody = responseSchema.parse(result);
  let confidence: number | null = null;
  try {
    const resultBody = responseSchema.parse(result);
    const logProbs = resultBody.response.body.choices?.[0]?.logprobs.content;
    const logProbOfMaterialityToken = logProbs
      ? logProbs.find(
          (logProbObject) =>
            logProbObject.token === String(getScoreFromTargetObject(prediction))
        )?.logprob
      : null;
    confidence = logProbOfMaterialityToken
      ? Math.exp(logProbOfMaterialityToken)
      : null;
  } catch {}
  return {
    prompt: {
      systemPrompt: "",
      preExamplesPrompt: "",
      postExamplesPreTestCasePrompt: "",
      finalPrompt: "",
    },
    examples: [],
  };
}
