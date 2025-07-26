import { TasteLever } from "@/src/taste-lever"
import { type CompiledPrompt } from "@/src/types"
class MyTasteLever extends TasteLever<z.ZodObject<{
  name: z.ZodString,
  age: z.ZodNumber,
  email: z.ZodString,
}>> {
  async compile(): Promise<CompiledPrompt> {
    return {
      systemPrompt: "You are a helpful assistant",
    }
  }
}
import { CompiledPrompt } from "../src/types"
