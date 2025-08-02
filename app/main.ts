import { readFile } from "fs/promises";
import { recordSchema } from "./types";
import * as tl from "@/src/taste-lever";

async function getData() {
  const trainPath =
    "datasets/contextual-takeaways-material-rating-set2-7127d3aa-e250-4300-886c-dd5227ccd23c.json";
  const testPath =
    "datasets/contextual-takeaways-material-rating-bbb5984e-eab9-4572-aa41-9a6397efde5a.json";

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

async function main() {
  const { train, test } = await getData();
  const compiledPrompt = await tl.compile({
    schema: recordSchema,
    train,
    test,
    getScoreFromTargetObject: (predicted)=> predicted.materialityRating,
    // lossFunction: (predicted, target) =>
      // Math.abs(predicted.materialityRating - target.materialityRating),
  });
  console.log(compiledPrompt);
}

main();
