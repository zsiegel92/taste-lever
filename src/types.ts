import { z } from "zod";


const compiledPromptSchema = z.object({
	systemPrompt: z.string(),
	preExamplesPrompt: z.string(),
	postExamplesPreTestCasePrompt: z.string(),
	finalPrompt: z.string(),
})

export type CompiledPrompt = z.infer<typeof compiledPromptSchema>