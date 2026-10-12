import { zodResolver } from '@hookform/resolvers/zod'
import {
  createCharacterSchema,
  type CreateCharacterInput,
  type CreationOptions,
  type Nation,
  type OutfitBoost,
} from '@pockie/shared'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { gameCreateRole, type MapButtonArt } from '../generated/game-extra'
import { applyServerErrors } from '../routes/form-errors'
import { useCreateCharacter, useCreationOptions } from './api'
import { Notice, useFitScale } from './skin'
import { GameText, outfitName, plainText } from './text'

const SCREEN = gameCreateRole
/** TabSelect order of the village icons (tab1..tab5) as Character.nation values. */
const NATION_TABS: readonly Nation[] = [0, 3, 1, 4, 2]
/** CreatRoleBase.SetRoleSelectDes: the boosted stat and the two stats it affects. */
const BOOST_TEXT: Record<OutfitBoost, [string, string, string]> = {
  strength: ['lg_RoleInfo_Force', 'lg_RoleInfo_Attack', 'lg_RoleInfo_GridFile'],
  agility: ['lg_RoleInfo_Agile', 'lg_RoleInfo_Speed', 'lg_RoleInfo_Dodge'],
  stamina: ['lg_RoleInfo_Spirit', 'lg_RoleInfo_Hp', 'lg_RoleInfo_Sp'],
}
const LABEL = 'font-bold text-white [text-shadow:var(--shadow-game-text)]'
const CAPTION =
  'font-black text-[#fff6a6] [text-shadow:-1px_-1px_0_#5a2a00,1px_-1px_0_#5a2a00,-1px_1px_0_#5a2a00,1px_1px_0_#5a2a00]'

type Box = Pick<MapButtonArt, 'x' | 'y' | 'width' | 'height'>
const at = (art: Box): CSSProperties => ({
  left: art.x,
  top: art.y,
  width: art.width,
  height: art.height,
})

/** Text placed on the 1000x600 screen where the original drew it. */
function Placed({
  x,
  y,
  width,
  className = '',
  children,
}: {
  x: number
  y: number
  width?: number
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`absolute ${className}`} style={{ left: x, top: y, width }}>
      {children}
    </div>
  )
}

/**
 * Character creation as in CreatRoleBase.as (creatrolenew.swf): the original 1000x600 screen,
 * scaled to the window, with the village icons, the ten character portraits, the chosen outfit's
 * big picture, the name field and the Back / Random / Enter Game buttons. English text is drawn
 * where the original's text was.
 */
export function CreateCharacter() {
  const options = useCreationOptions()
  const scale = useFitScale(SCREEN.width, SCREEN.height)
  return (
    <div className="grid h-[100dvh] w-screen place-items-center overflow-hidden bg-black">
      <div
        className="relative overflow-hidden"
        style={{ width: SCREEN.width, height: SCREEN.height, zoom: scale }}
      >
        <img src={SCREEN.background.file} alt="" className="absolute inset-0 size-full" />
        {/* The original screen has no title; screen readers still get one. */}
        <h1 className="sr-only">Create your ninja</h1>
        {options.isPending && (
          <Placed x={400} y={290} className={LABEL}>
            Loading the creation options...
          </Placed>
        )}
        {options.isError && (
          <Placed x={350} y={280} width={300}>
            <Notice tone="error">We could not load the creation options.</Notice>
          </Placed>
        )}
        {options.data && <CreationForm options={options.data} />}
      </div>
    </div>
  )
}

/** A TabSelect tab as a radio: its normal, hover and selected art from the original clip. */
function TabRadio({
  art,
  name,
  checked,
  onChange,
  label,
  tip,
  glow = false,
}: {
  art: Record<'normal' | 'over' | 'selected', MapButtonArt>
  name: string
  checked: boolean
  onChange: () => void
  label: string
  /** Hover text, like TabSelect.tipAry. */
  tip?: string
  /**
   * Draw hover and selected as the normal art with an orange / yellow glow: the portraits' own
   * over and selected frames hold a nested clip (exported at its first frame) and a glow cut square.
   */
  glow?: boolean
}) {
  const box = art.selected
  const img = (state: keyof typeof art, className: string) => (
    <img
      src={art[state].file}
      alt=""
      draggable={false}
      className={`absolute max-w-none ${className}`}
      style={at({ ...art[state], x: art[state].x - box.x, y: art[state].y - box.y })}
    />
  )
  return (
    <label className="group absolute cursor-pointer" style={at(box)} title={tip}>
      <input
        type="radio"
        name={name}
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      {glow ? (
        img(
          'normal',
          'group-hover:[filter:drop-shadow(0_0_3px_#ff8a00)] peer-checked:[filter:drop-shadow(0_0_2px_#fff35a)_drop-shadow(0_0_4px_#ffd400)]',
        )
      ) : (
        <>
          {img('normal', 'group-hover:invisible peer-checked:invisible')}
          {img('over', 'invisible group-hover:visible peer-checked:invisible')}
          {img('selected', 'invisible peer-checked:visible')}
        </>
      )}
      <span className="pointer-events-none absolute -inset-0.5 rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-[#ffe27a]" />
    </label>
  )
}

/** One of the original orange buttons with an English caption over its text-free art. */
function ArtButton({
  art,
  type = 'button',
  disabled,
  onClick,
  className,
  children,
}: {
  art: Record<'up' | 'over' | 'down', MapButtonArt>
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  className: string
  children: ReactNode
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`absolute bg-(image:--up) bg-center bg-no-repeat hover:bg-(image:--over) focus-visible:outline-2 focus-visible:outline-[#ffe27a] active:bg-(image:--down) disabled:cursor-wait ${CAPTION} ${className}`}
      style={
        {
          ...at(art.over),
          '--up': `url(${art.up.file})`,
          '--over': `url(${art.over.file})`,
          '--down': `url(${art.down.file})`,
        } as CSSProperties
      }
    >
      {children}
    </button>
  )
}

function CreationForm({ options }: { options: CreationOptions }) {
  const create = useCreateCharacter()
  const navigate = useNavigate()
  const ids = useId()
  // CreatRoleBase.InitUI selects tab 1 (the first creatrole row) and the least-populated village.
  const first = options.outfits[0]
  const form = useForm<CreateCharacterInput>({
    resolver: zodResolver(createCharacterSchema),
    defaultValues: {
      name: '',
      gender: first?.gender ?? 0,
      clothing: first?.clothing,
      nation: options.suggestedNation,
    },
  })
  const { errors, isSubmitting } = form.formState
  const values = useWatch({ control: form.control })
  const outfit = options.outfits.find((o) => o.clothing === values.clothing)

  /** The gender always follows the outfit (Binary_CreatRole Sex). */
  const chooseOutfit = (index: number) => {
    const chosen = options.outfits[index]
    if (!chosen) return
    form.setValue('clothing', chosen.clothing)
    form.setValue('gender', chosen.gender)
  }
  // CreatRoleBase.onRest: a random character and a random village.
  const random = () => {
    chooseOutfit(Math.floor(Math.random() * options.outfits.length))
    form.setValue('nation', NATION_TABS[Math.floor(Math.random() * NATION_TABS.length)]!)
  }

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await create.mutateAsync(input)
      navigate('/play', { replace: true })
    } catch (error) {
      applyServerErrors(form.setError, error, ['name', 'gender', 'clothing', 'nation'])
    }
  })

  const nameError = errors.name?.message
  const otherError = errors.root?.message ?? errors.clothing?.message ?? errors.nation?.message
  const nation: Nation = (values.nation as Nation | undefined) ?? options.suggestedNation
  const nationName = (n: number) => plainText(`lg_Common_Nation_${n}`, 'Village')
  const boost = outfit && BOOST_TEXT[outfit.boost].map((key) => plainText(key))
  const picture = outfit && SCREEN.outfits[String(outfit.clothing)]

  return (
    <form noValidate onSubmit={onSubmit} className="absolute inset-0 font-game">
      {picture && (
        <img
          src={picture.file}
          alt=""
          className="pointer-events-none absolute max-w-none [filter:drop-shadow(0_0_3px_#ffa800)_drop-shadow(0_0_2px_#ffa800)]"
          style={at(picture)}
        />
      )}
      {outfit && (
        <Placed
          x={600}
          y={40}
          width={300}
          className={`text-center text-[26px] leading-none ${CAPTION}`}
        >
          {outfitName(outfit.clothing)}
        </Placed>
      )}

      <div role="radiogroup" aria-labelledby={`${ids}-village`}>
        <Placed x={20} y={38} className={`text-[16px] ${LABEL}`}>
          <span id={`${ids}-village`}>Step 1: Choose Village</span>
        </Placed>
        {NATION_TABS.map((n, i) => (
          <TabRadio
            key={n}
            art={SCREEN.nations[String(i + 1)]!}
            name={`${ids}-nation`}
            checked={nation === n}
            onChange={() => form.setValue('nation', n)}
            label={`${nationName(n)}${n === options.suggestedNation ? ' (fewest ninjas)' : ''}`}
            tip={plainText(`lg_Tip_LoginNation_${i}`)}
          />
        ))}
        {/* The chosen village by name (Txt_Nation of the older creation screen). */}
        <Placed x={72} y={118} width={285} className={`text-[12px] ${LABEL}`}>
          <span className="text-[#ffe27a]">{nationName(nation)}</span>
          {nation === options.suggestedNation && ' (fewest ninjas)'}
        </Placed>
      </div>

      <div role="radiogroup" aria-labelledby={`${ids}-character`}>
        <Placed x={19} y={153} className={`text-[16px] ${LABEL}`}>
          <span id={`${ids}-character`}>Step 2: Choose Character</span>
        </Placed>
        {options.outfits.map((o, i) => {
          const art = SCREEN.roles[String(i + 1)]
          return (
            art && (
              <TabRadio
                key={o.clothing}
                art={art}
                name={`${ids}-outfit`}
                checked={values.clothing === o.clothing}
                onChange={() => chooseOutfit(i)}
                label={outfitName(o.clothing)}
                glow
              />
            )
          )
        })}
      </div>

      {boost && outfit && (
        <Placed x={78} y={355} width={272} className="text-[12px] leading-snug text-white">
          <p>
            <GameText k="lg_CreatRolePanel_SelectRole" args={boost} tone="dark" />
          </p>
          <p className="text-[#c8c8c8]">
            Weapon: {plainText(`lg_Common_RolePopsinger${outfit.weaponClass}`, 'Any weapon')}
          </p>
        </Placed>
      )}
      <Placed x={70} y={420} width={290} className={`text-[13px] leading-snug ${LABEL}`}>
        Many characters in the game, such as Uzumaki Naruto, Uchiha Sasuke and Kurosaki Ichigo.
      </Placed>

      <Placed x={550} y={423} className={`text-[16px] ${LABEL}`}>
        Step 3: Enter Name
      </Placed>
      <label
        htmlFor={`${ids}-name`}
        className={`absolute text-[12px] ${LABEL} font-normal`}
        style={{ left: 620, top: 460 }}
      >
        Character Name
      </label>
      <input
        id={`${ids}-name`}
        autoComplete="off"
        maxLength={12}
        aria-invalid={nameError ? true : undefined}
        aria-describedby={`${ids}-name-hint`}
        className="absolute bg-transparent px-1 text-[13px] text-[#2a1a08] outline-none focus-visible:outline-2 focus-visible:outline-[#ffe27a]"
        style={{ left: 723.5, top: 459, width: 143, height: 18 }}
        {...form.register('name')}
      />
      <p
        id={`${ids}-name-hint`}
        className={`absolute text-center text-[12px] ${nameError ? 'font-bold text-[#ff8a7a]' : 'text-white'}`}
        style={{ left: 612, top: 489, width: 282 }}
      >
        {nameError ?? '3 to 12 letters, numbers or underscores'}
      </p>
      {otherError && (
        <Placed x={612} y={395} width={282}>
          <Notice tone="error">{otherError}</Notice>
        </Placed>
      )}

      <Placed x={551} y={551} className={`text-[16px] ${LABEL}`}>
        Step 4:
      </Placed>
      <ArtButton art={SCREEN.back} onClick={() => navigate('/')} className="text-[15px]">
        Back
      </ArtButton>
      <ArtButton art={SCREEN.random} onClick={random} className="text-[15px]">
        Random
      </ArtButton>
      <ArtButton art={SCREEN.enter} type="submit" disabled={isSubmitting} className="text-[20px]">
        {isSubmitting ? 'Entering...' : 'Enter Game'}
      </ArtButton>
    </form>
  )
}
