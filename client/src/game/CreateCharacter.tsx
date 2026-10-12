import { zodResolver } from '@hookform/resolvers/zod'
import {
  createCharacterSchema,
  type CreateCharacterInput,
  type CreationOptions,
} from '@pockie/shared'
import { useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { applyServerErrors } from '../routes/form-errors'
import { useCreateCharacter, useCreationOptions } from './api'
import { GameButton, Notice, Panel } from './skin'
import { outfitName, plainText } from './text'
import { sceneNameKey } from './world'

const GENDERS = [
  { value: 0, label: 'Male' },
  { value: 1, label: 'Female' },
] as const

const weaponClass = (n: number) => plainText(`lg_Common_RolePopsinger${n}`, 'Any weapon')

export function CreateCharacter() {
  const options = useCreationOptions()
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center p-4">
      {options.isPending && <Notice>Loading the creation options...</Notice>}
      {options.isError && <Notice tone="error">We could not load the creation options.</Notice>}
      {options.data && <CreationForm options={options.data} />}
    </div>
  )
}

function CreationForm({ options }: { options: CreationOptions }) {
  const create = useCreateCharacter()
  const navigate = useNavigate()
  const ids = useId()
  const firstOutfit = (gender: number) => options.outfits.find((o) => o.gender === gender)
  const form = useForm<CreateCharacterInput>({
    resolver: zodResolver(createCharacterSchema),
    defaultValues: {
      name: '',
      gender: 0,
      clothing: firstOutfit(0)?.clothing,
      nation: options.suggestedNation,
    },
  })
  const { errors, isSubmitting } = form.formState
  const values = useWatch({ control: form.control })

  /** Props for a radio of a numeric field (react-hook-form compares radio values as strings). */
  const radio = (field: 'gender' | 'clothing' | 'nation', value: number) => ({
    type: 'radio',
    name: `${ids}-${field}`,
    value: String(value),
    checked: values[field] === value,
    onChange: () => {
      form.setValue(field, value)
      if (field === 'gender') form.setValue('clothing', firstOutfit(value)?.clothing ?? 0)
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values)
      navigate('/play', { replace: true })
    } catch (error) {
      applyServerErrors(form.setError, error, ['name', 'gender', 'clothing', 'nation'])
    }
  })

  const nameError = errors.name?.message
  return (
    <Panel title="Create your ninja">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 font-game">
        {errors.root?.message && <Notice tone="error">{errors.root.message}</Notice>}

        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-name`} className="font-bold">
            Ninja name
          </label>
          <input
            id={`${ids}-name`}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={`${ids}-name-hint`}
            className="game-field min-h-9 px-3 text-base"
            {...form.register('name')}
          />
          <p id={`${ids}-name-hint`} className={nameError ? 'font-bold text-[#8a1610]' : 'text-xs'}>
            {nameError ?? '3 to 12 letters, numbers or underscores. Other players will see it.'}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">Gender</legend>
          <div className="flex gap-3">
            {GENDERS.map((g) => (
              <label key={g.value} className="flex items-center gap-2">
                <input {...radio('gender', g.value)} />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">Starting outfit</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.outfits
              .filter((o) => o.gender === values.gender)
              .map((outfit) => (
                <label
                  key={outfit.clothing}
                  className="flex cursor-pointer items-center gap-2 rounded border-2 border-wood-light bg-parchment px-2 py-2 has-checked:border-ember has-checked:bg-[#ffd98a] has-focus-visible:outline-3 has-focus-visible:outline-offset-1 has-focus-visible:outline-wood-deep"
                >
                  <input className="sr-only" {...radio('clothing', outfit.clothing)} />
                  <span>
                    <span className="block font-bold">{outfitName(outfit.clothing)}</span>
                    <span className="block text-xs">{weaponClass(outfit.weaponClass)}</span>
                  </span>
                </label>
              ))}
          </div>
          {errors.clothing?.message && <Notice tone="error">{errors.clothing.message}</Notice>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">Village</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.villages.map((village) => (
              <label
                key={village.nation}
                className="flex cursor-pointer items-center justify-between gap-2 rounded border-2 border-wood-light bg-parchment px-2 py-2 has-checked:border-ember has-checked:bg-[#ffd98a] has-focus-visible:outline-3 has-focus-visible:outline-offset-1 has-focus-visible:outline-wood-deep"
              >
                <input className="sr-only" {...radio('nation', village.nation)} />
                <span className="font-bold">
                  {plainText(sceneNameKey(village.sceneId), `Village ${village.nation + 1}`)}
                </span>
                {village.nation === options.suggestedNation && (
                  <span className="rounded bg-leaf px-1.5 text-xs font-bold text-white">
                    Suggested
                  </span>
                )}
              </label>
            ))}
          </div>
          <p className="text-xs">The suggested village has the fewest ninjas right now.</p>
          {errors.nation?.message && <Notice tone="error">{errors.nation.message}</Notice>}
        </fieldset>

        <GameButton type="submit" disabled={isSubmitting} className="self-end">
          {isSubmitting ? 'Creating...' : 'Create ninja'}
        </GameButton>
      </form>
    </Panel>
  )
}
