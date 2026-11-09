import type { ScreeningInput, ScreeningResult } from '@picode-hr/shared'

export const SCREENING = Symbol('SCREENING')

export interface ScreeningService {
  score(input: ScreeningInput): Promise<ScreeningResult>
}
