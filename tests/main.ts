import { TasteLever } from "@/src/taste-lever";
import { type CompiledPrompt } from "@/src/types";
import { z } from "zod";

const inputSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  eventName: z.string(),
  takeaway: z.string(),
  quotedText: z.string(),
  takeawayType: z.enum([
    "segment_commentary",
    "guidance",
    "qa_session_highlights",
    "product_commentary",
    "kpi_commentary",
    "other",
  ]),
});

class MyTasteLever extends TasteLever {
  async compile(): Promise<CompiledPrompt> {
    return {
      systemPrompt: "You are a helpful assistant",
    };
  }
}
