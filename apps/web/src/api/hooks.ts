import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend } from './client'

export function useApiQuery<T>(
  key: readonly unknown[],
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => apiGet<T>(path),
    enabled: options?.enabled,
  })
}

export function useApiMutation<T>(
  path: string,
  method: 'POST' | 'PUT',
  invalidateKeys?: readonly unknown[][]
) {
  const queryClient = useQueryClient()
  return useMutation<T, Error, unknown>({
    mutationFn: (payload) => apiSend<T>(path, method, payload),
    onSuccess: () => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
    },
  })
}
