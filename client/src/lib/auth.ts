import type { LoginInput, PublicUser, RegisterInput } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'

const meKey = ['me'] as const

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return (await api<{ user: PublicUser }>('/api/auth/me')).user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

function useSetUser() {
  const queryClient = useQueryClient()
  return ({ user }: { user: PublicUser }) => {
    queryClient.setQueryData(meKey, user)
    queryClient.removeQueries({ queryKey: ['game'] })
    void queryClient.invalidateQueries({ queryKey: ['status'] })
  }
}

export function useLogin() {
  const onSuccess = useSetUser()
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: PublicUser }>('/api/auth/login', { method: 'POST', body: input }),
    onSuccess,
  })
}

export function useRegister() {
  const onSuccess = useSetUser()
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<{ user: PublicUser }>('/api/auth/register', { method: 'POST', body: input }),
    onSuccess,
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(meKey, null)
      // Game state belongs to the account that just left.
      queryClient.removeQueries({ queryKey: ['game'] })
      void queryClient.invalidateQueries({ queryKey: ['status'] })
    },
  })
}
