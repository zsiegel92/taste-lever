import * as z from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  type CompiledPromptWithFewshotExamples,
  type DataAndTargetSchema,
  type CompiledPrompt,
  assertIsConcreteZodSchema,
  compiledPromptSchema,
  type DataPointWithConfidence,
  type DataPoint,
} from "./types";

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

async function getBetterPrompt<D, T>({
  schema,
  initialPrompt = null,
  poorlyClassified,
}: {
  schema: DataAndTargetSchema<D, T>;
  initialPrompt: CompiledPromptWithFewshotExamples<D, T> | null;
  poorlyClassified: z.output<DataAndTargetSchema<D, T>>[];
}): Promise<CompiledPrompt> {
  const prompt = `Your job is to generate a prompt to classify examples according to a schema. The input schema is this:
<input-schema>
${z.toJSONSchema(schema.shape.data)}
</input-schema>

The target schema is this:
<target-schema>
${z.toJSONSchema(schema.shape.target)}
</target-schema>

Here are some examples that are currently classified poorly by the system::
<examples>
${JSON.stringify(poorlyClassified, null, 2)}
</examples>

Your goal is to generate a prompt consisting of these parts:
<prompt-schema>
${z.toJSONSchema(compiledPromptSchema)}
</prompt-schema>

${
  initialPrompt
    ? `Here is an initial prompt - your job is to change it as little as possible but in a way that improves it!:
<initial-prompt>
${JSON.stringify(initialPrompt.prompt, null, 2)}
</initial-prompt>
`
    : ""
}

${
  initialPrompt?.examples.length
    ? `The prompt will already include several few-shot examples.:
<examples>
${JSON.stringify(initialPrompt.examples, null, 2)}
</examples>
`
    : ""
}

Go!
    `;
  const result = await generateObject({
    model: openai.chat("gpt-4.1"),
    schema: compiledPromptSchema,
    prompt,
  });
  return result.object;
}

function preparePrompt<D, T>(
  prompt: CompiledPromptWithFewshotExamples<D, T>,
  input: D
) {
  return {
    system: prompt.prompt.systemPrompt,
    prompt: `
# Task:

${prompt.prompt.preExamplesPrompt}

# Examples:

<examples>
${prompt.examples
  .map(
    (e) => `
<example>
${JSON.stringify(e.data, null, 2)}
</example>
`
  )
  .join("\n")}
</examples>

# Additional Instructions:
${prompt.prompt.postExamplesPreTestCasePrompt}

# Test Case:

<test-case>
${JSON.stringify(input, null, 2)}
</test-case>

# Final Instructions:

${prompt.prompt.finalPrompt}
    `,
  };
}
export async function compile<D, T>({
  schema,
  train,
  test,
  getScoreFromTargetObject,
  initialPrompt = null,
}: {
  schema: DataAndTargetSchema<D, T>;
  train: DataPoint<D, T>[];
  test: DataPoint<D, T>[];
  getScoreFromTargetObject: (predicted: any) => number;
  initialPrompt: CompiledPromptWithFewshotExamples<D, T> | null;
  // lossFunction: (predicted: T, target: T) => number;
}): Promise<CompiledPromptWithFewshotExamples<D, T>> {
  // TODO: uniquify with sha hashing elements
  // TODO: separate out few-shot examples by finding high-confidence wrong examples
  console.log(schema);
  console.log(train);
  console.log(test);
  const targetSchema = schema.shape.target;
  assertIsConcreteZodSchema(targetSchema);
  const inProcessPrompt: CompiledPromptWithFewshotExamples<D, T> = {
    prompt:
      initialPrompt?.prompt ??
      (await getBetterPrompt({
        schema,
        initialPrompt,
        poorlyClassified: train.slice(0, 10),
      })),
    examples: initialPrompt?.examples ?? [],
  };

  const resultsWithConfidences: DataPointWithConfidence<D, T>[] = [];
  for (const example of train) {
    const { system, prompt } = preparePrompt(inProcessPrompt, example.data);
    const result = await generateObject({
      model: openai.chat("gpt-4.1"),
      providerOptions: {
        openai: {
          logprobs: true,
        },
      },
      schema: targetSchema,
      system,
      prompt,
    });
    const prediction = targetSchema.parse(result.object);
    let confidence: number | null = null;
    try {
      const resultBody = responseSchema.parse(result);
      const logProbs = resultBody.response.body.choices?.[0]?.logprobs.content;
      const logProbOfMaterialityToken = logProbs
        ? logProbs.find(
            (logProbObject) =>
              logProbObject.token ===
              String(getScoreFromTargetObject(prediction))
          )?.logprob
        : null;
      confidence = logProbOfMaterialityToken
        ? Math.exp(logProbOfMaterialityToken)
        : null;
    } catch {}
    console.log("Confidence:", confidence);
    resultsWithConfidences.push({
      dataPoint: example,
      confidence: confidence ?? 1,
    });
  }
  const mostWrongMostConfident = resultsWithConfidences
    .sort((a, b) => {
      const confidenceWeightedLossA =
        a.confidence *
        Math.abs(
          getScoreFromTargetObject(a.dataPoint.target) -
            getScoreFromTargetObject(b.dataPoint.target)
        );
      const confidenceWeightedLossB =
        b.confidence *
        Math.abs(
          getScoreFromTargetObject(b.dataPoint.target) -
            getScoreFromTargetObject(a.dataPoint.target)
        );
      return confidenceWeightedLossA - confidenceWeightedLossB;
    })
    .slice(0, 5);

  inProcessPrompt.examples.push(
    ...mostWrongMostConfident.map((d) => ({
      data: d.dataPoint.data,
      target:  d.dataPoint.target,
      explanation: "",
    }))
  );
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
