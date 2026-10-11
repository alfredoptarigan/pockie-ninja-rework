import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput, type LoginValues } from '@pockie/shared'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { AuthLayout, FormAlert } from '../components/AuthLayout'
import { TextField } from '../components/TextField'
import { Button } from '../components/ui'
import { useLogin, useMe } from '../lib/auth'
import { applyServerErrors } from './form-errors'

function redirectTarget(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from
  // Only same-site paths: never protocol-relative (//host) or backslash (/\host) URLs.
  return typeof from === 'string' && /^\/(?![/\\])/.test(from) ? from : '/play'
}

export function Login() {
  const me = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const target = redirectTarget(location.state)
  const form = useForm<LoginInput, unknown, LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '', rememberMe: false },
  })
  const { errors, isSubmitting } = form.formState

  if (me.data) return <Navigate to={target} replace />

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      navigate(target, { replace: true })
    } catch (error) {
      applyServerErrors(form.setError, error, ['login', 'password'])
    }
  })

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue your journey.">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormAlert message={errors.root?.message} />
        <TextField
          label="Username or email"
          autoComplete="username"
          error={errors.login?.message}
          {...form.register('login')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
          <input type="checkbox" className="size-5 accent-coral" {...form.register('rememberMe')} />
          Remember me for 30 days
        </label>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </Button>
        <p className="text-center text-sm">
          New here?{' '}
          <Link to="/register" className="font-semibold underline decoration-coral decoration-2">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
