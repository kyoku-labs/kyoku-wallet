// src/background/types.ts (or a suitable shared location)
import { SendResponse } from './helpers'; // Assuming SendResponse is defined in helpers.ts

export type BackgroundHandler<P = any, R = any> =
  (payload: P, respond: SendResponse) => Promise<R | void>;