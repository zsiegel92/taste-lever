import { readFile, writeFile } from "fs/promises";
import { recordSchema } from "./types";
import * as tl from "@/src/taste-lever";

async function getData() {
  const trainPath = "datasets/takeaways-train.json";
  const testPath = "datasets/takeaways-test.json";

  const [trainData, testData] = await Promise.all([
    readFile(trainPath, "utf-8"),
    readFile(testPath, "utf-8"),
  ]);
  const trainRecords = JSON.parse(trainData);
  const testRecords = JSON.parse(testData);
  const parsedTrainRecords = recordSchema.array().parse(trainRecords);
  const parsedTestRecords = recordSchema.array().parse(testRecords);
  return { train: parsedTrainRecords, test: parsedTestRecords };
}

// TODO: json load prompt from file
// TODO: json schema for prompt file in json form
async function main() {
  const { train, test } = await getData();
  const compiledPrompt = await tl.compile({
    schema: recordSchema,
    train,
    test,
    getScoreFromTargetObject: (predicted) => predicted.materialityRating,
    initialPrompt: null,
  });
  const compiledPromptPath = "test-results/compiled-prompt.json";
  await writeFile(compiledPromptPath, JSON.stringify(compiledPrompt, null, 2));
  console.log(`compiled prompt written to ${compiledPromptPath}`);
}

main();
