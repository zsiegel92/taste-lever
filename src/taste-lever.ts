import * as z from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import {
  type CompiledPromptWithFewshotExamples,
  type DataAndTargetSchema,
  type CompiledPrompt,
  assertIsConcreteZodSchema,
  compiledPromptSchema,
  type DataPointWithPredictionAndConfidence,
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

async function getExplanationForExample<D, T>({
  schema,
  inProcessPrompt,
  dataPoint,
}: {
  schema: DataAndTargetSchema<D, T>;
  inProcessPrompt: CompiledPromptWithFewshotExamples<D, T>;
  dataPoint: DataPoint<D, T>;
}): Promise<string> {
  const targetSchema = schema.shape.target;
  assertIsConcreteZodSchema(targetSchema);

  const { system, prompt } = preparePrompt(inProcessPrompt, dataPoint.data);

  const explanation = await generateText({
    model: openai.chat("gpt-4.1"),
    prompt: `
You are attempting to explain why a given example is classified poorly.

You will be shown a system prompt and a prompt (with few-shot examples) that attempted to classify an example. You will also be shown the ground-truth classification for that example.

Your job is to give a short explanation as to why the example was classified poorly. That explanation will be shown along with this example as a new few-shot example in the prompt for future classification tasks. Please make sure your explanation is useful!

# System prompt:

<system>
${system}
</system>

# Prompt for classification:

<prompt>
${prompt}
</prompt>

# Ground truth:

<ground-truth>
${JSON.stringify(dataPoint.target, null, 2)}
</ground-truth>
    `,
  });
  return explanation.text;
}

async function batchPromises<T>(
  getPromises: (() => Promise<T>)[],
  batchSize: number
): Promise<T[]> {
  const output: T[] = [];
  const nBatches = Math.ceil(getPromises.length / batchSize);
  for (let i = 0; i < getPromises.length; i += batchSize) {
    console.log(`Executing batch ${i / batchSize + 1} of ${nBatches}`);
    const batch = getPromises.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((p) => p()));
    output.push(...results);
  }
  return output;
}

async function runPromptOnOneDataPoint<D, T>({
  schema,
  example,
  getScoreFromTargetObject,
  compiledPromptWithExamples,
}: {
  schema: DataAndTargetSchema<D, T>;
  example: DataPoint<D, T>;
  getScoreFromTargetObject: (predicted: T) => number;
  compiledPromptWithExamples: CompiledPromptWithFewshotExamples<D, T>;
}): Promise<DataPointWithPredictionAndConfidence<D, T>> {
  const targetSchema = schema.shape.target;
  assertIsConcreteZodSchema(targetSchema);
  const { system, prompt } = preparePrompt(
    compiledPromptWithExamples,
    example.data
  );
  const result = await generateObject({
    model: openai.chat("gpt-4.1"),
    providerOptions: {
      openai: {
        logprobs: true,
      },
    },
    schema: targetSchema,
    output: "object",
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
            logProbObject.token === String(getScoreFromTargetObject(prediction))
        )?.logprob
      : null;
    confidence = logProbOfMaterialityToken
      ? Math.exp(logProbOfMaterialityToken)
      : null;
  } catch {}
  return {
    dataPoint: example,
    prediction,
    confidence: confidence ?? 1,
  };
}

async function runPromptOnData<D, T>({
  schema,
  trainOrTest,
  getScoreFromTargetObject,
  compiledPromptWithExamples,
  batchSize = 20,
}: {
  schema: DataAndTargetSchema<D, T>;
  trainOrTest: DataPoint<D, T>[];
  getScoreFromTargetObject: (predicted: T) => number;
  compiledPromptWithExamples: CompiledPromptWithFewshotExamples<D, T>;
  batchSize?: number;
}): Promise<DataPointWithPredictionAndConfidence<D, T>[]> {
  const targetSchema = schema.shape.target;
  assertIsConcreteZodSchema(targetSchema);
  const resultsWithConfidences: DataPointWithPredictionAndConfidence<D, T>[] =
    await batchPromises(
      trainOrTest.map((example) => {
        return () =>
          runPromptOnOneDataPoint({
            schema,
            example,
            getScoreFromTargetObject,
            compiledPromptWithExamples,
          });
      }),
      batchSize
    );
  return resultsWithConfidences;
}

function average<T>(
  dataPoints: T[],
  getScoreFromOneDataPoint: (dataPoint: T) => number
) {
  const averageScore =
    dataPoints.reduce((acc, curr) => {
      const score = getScoreFromOneDataPoint(curr);
      return acc + score;
    }, 0) / dataPoints.length;
  return averageScore;
}

async function improvePromptAndExamples<D, T>({
  schema,
  train,
  getScoreFromTargetObject,
  initialPrompt = null,
}: {
  schema: DataAndTargetSchema<D, T>;
  train: DataPoint<D, T>[];
  getScoreFromTargetObject: (predicted: T) => number;
  initialPrompt: CompiledPromptWithFewshotExamples<D, T> | null;
}): Promise<CompiledPromptWithFewshotExamples<D, T>> {
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
  const resultsWithConfidences: DataPointWithPredictionAndConfidence<D, T>[] =
    await runPromptOnData({
      schema,
      trainOrTest: train,
      getScoreFromTargetObject,
      compiledPromptWithExamples: inProcessPrompt,
    });
  const mostWrongMostConfident = resultsWithConfidences
    .sort((a, b) => {
      const confidenceWeightedLossA =
        a.confidence *
        Math.abs(
          getScoreFromTargetObject(a.dataPoint.target) -
            getScoreFromTargetObject(a.prediction)
        );
      const confidenceWeightedLossB =
        b.confidence *
        Math.abs(
          getScoreFromTargetObject(b.dataPoint.target) -
            getScoreFromTargetObject(b.prediction)
        );
      return confidenceWeightedLossA - confidenceWeightedLossB;
    })
    .slice(0, 5);
  const newFewshotExamples = await Promise.all(
    mostWrongMostConfident.map(async ({ dataPoint }) => {
      const explanation = await getExplanationForExample({
        schema,
        inProcessPrompt,
        dataPoint: dataPoint,
      });
      return {
        data: dataPoint.data,
        target: targetSchema.parse(dataPoint.target),
        explanation: explanation,
      };
    })
  );
  inProcessPrompt.examples.push(...newFewshotExamples);
  return inProcessPrompt;
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
  getScoreFromTargetObject: (predicted: T) => number;
  initialPrompt: CompiledPromptWithFewshotExamples<D, T> | null;
}): Promise<CompiledPromptWithFewshotExamples<D, T>> {
  // TODO: uniquify with sha hashing elements
  const targetSchema = schema.shape.target;
  assertIsConcreteZodSchema(targetSchema);

  let averagePerformanceBefore = Number.POSITIVE_INFINITY;
  if (initialPrompt) {
    const performanceOnTestSetBefore = await runPromptOnData({
      schema,
      trainOrTest: test,
      getScoreFromTargetObject,
      compiledPromptWithExamples: initialPrompt,
    });
    averagePerformanceBefore = average(
      performanceOnTestSetBefore,
      (curr) =>
        curr.confidence *
        Math.abs(
          getScoreFromTargetObject(curr.dataPoint.target) -
            getScoreFromTargetObject(curr.prediction)
        )
    );
    console.log(`averagePerformanceBefore: ${averagePerformanceBefore}`);
  }
  const improvedPrompt = await improvePromptAndExamples({
    schema,
    train,
    getScoreFromTargetObject,
    initialPrompt,
  });
  const performanceOnTestSetAfter = await runPromptOnData({
    schema,
    trainOrTest: test,
    getScoreFromTargetObject,
    compiledPromptWithExamples: improvedPrompt,
  });
  const averagePerformanceAfter = average(
    performanceOnTestSetAfter,
    (curr) =>
      curr.confidence *
      Math.abs(
        getScoreFromTargetObject(curr.dataPoint.target) -
          getScoreFromTargetObject(curr.prediction)
      )
  );
  console.log(`averagePerformanceAfter: ${averagePerformanceAfter}`);
  console.log(
    `improvement: ${averagePerformanceAfter - averagePerformanceBefore}`
  );
  if (averagePerformanceAfter < averagePerformanceBefore) {
    return improvedPrompt;
  } else {
    return initialPrompt ?? improvedPrompt;
  }
}
