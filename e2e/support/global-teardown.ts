/** Stops the API this run started. See `api-process.ts` for why the run owns it. */
import { stopApi } from './api-process.js'

export default async (): Promise<void> => {
  await stopApi()
}
