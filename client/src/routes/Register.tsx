import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, type RegisterInput } from '@pockie/shared'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router'
import { AuthLayout, FormAlert } from '../components/AuthLayout'
import { TextField } from '../components/TextField'
import { Button } from '../components/ui'
import { useMe, useRegister } from '../lib/auth'
import { applyServerErrors } from './form-errors'

export function Register() {
  const me = useMe()
  const registerAccount = useRegister()
  const navigate = useNavigate()
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  if (me.data) return <Navigate to="/play" replace />

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await registerAccount.mutateAsync(values)
      navigate('/play')
    } catch (error) {
      applyServerErrors(form.setError, error, ['username', 'email', 'password'])
    }
  })

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Pick a ninja name. You can play once the gate opens."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormAlert message={errors.root?.message} />
        <TextField
          label="Username"
          autoComplete="username"
          hint="3 to 16 letters, numbers or underscores."
          error={errors.username?.message}
          {...form.register('username')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold underline decoration-coral decoration-2">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
