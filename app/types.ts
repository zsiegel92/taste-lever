import * as z from "zod";
import type { DataAndTargetSchema } from "@/src/types";

const dataSchema = z.object({
  type: z.enum([
    "end_market_commentary",
    "geo_commentary",
    "guidance",
    "kpi_commentary",
    "other",
    "product_commentary",
    "qa_session_highlights",
    "segment_commentary",
  ]),
  takeaway: z.string(),
  quotedText: z.string(),
  priorContext: z.string().nullable(),
  calendarEventId: z.string(),
  importanceScore: z.number().min(1).max(3),
});

const targetSchema = z.object({
  materialityRating: z.number().min(1).max(3),
});

type Data = z.infer<typeof dataSchema>;
type Target = z.infer<typeof targetSchema>;

export const recordSchema: DataAndTargetSchema<Data, Target> = z.object({
  data: dataSchema,
  target: targetSchema,
});
