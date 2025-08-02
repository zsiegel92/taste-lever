import { toZodSchema } from "@/src/types";

const schema = toZodSchema([
  {
    name: "relevance",
    description: "How relevant is the takeaway to the event?",
  },
] as const);

const validated = schema.parse({
  relevance: 1,
});

// const schema2 = toZodSchema<{relevance: number}>([
//   {
//     name: "relevance",
//     description: "How relevant is the takeaway to the event?",
//   },
// ]);

// const validated2 = schema2.parse({
//   relevance: 1,
// });
