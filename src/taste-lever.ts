import * as z from "zod";
import { type CompiledPrompt} from "./types"

abstract class TasteLever<T> {
  constructor() {}

  abstract compile(): Promise<CompiledPrompt>

  
}