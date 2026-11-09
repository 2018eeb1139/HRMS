export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

export const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data, error: null })
export const fail = (error: string): ApiResponse<never> => ({ success: false, data: null, error })
