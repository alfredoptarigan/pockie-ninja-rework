import loadingBackground from '../assets/reborn/loading-bg.webp'

/**
 * Reborn's loading screen (site/loading-bg.png with the green bar that eases towards 97% over
 * 30 seconds), shared by the game load, scene travel, destination windows and battles.
 */
export function LoadingCurtain({ label, className }: { label: string; className: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading area"
      className={`pointer-events-auto cursor-progress overflow-hidden bg-black ${className}`}
    >
      <img
        src={loadingBackground}
        alt=""
        className="absolute top-1/2 left-1/2 max-h-full max-w-full -translate-1/2 object-contain opacity-85"
      />
      <div className="absolute bottom-[12%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <p className="mb-1 font-[Segoe_UI,Arial,sans-serif] text-[13px] tracking-[1px] text-[#e0dcc8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
          {label}
        </p>
        <div className="relative h-4 w-[min(360px,80vw)] overflow-hidden rounded-lg border border-[#5a5530] bg-[linear-gradient(180deg,#1a1a10_0%,#2a2818_50%,#1a1a10_100%)] shadow-[inset_0_1px_3px_rgba(0,0,0,0.7),0_0_6px_rgba(80,75,40,0.3)]">
          <div className="absolute inset-y-px left-px w-0 animate-[loading-fill_30s_cubic-bezier(0.1,0.6,0.2,1)_forwards] rounded-[7px] bg-[linear-gradient(180deg,#8cc63f_0%,#5a9e1a_40%,#4a8a14_60%,#3d7510_100%)] shadow-[0_0_8px_rgba(140,198,63,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] motion-reduce:w-[60%] motion-reduce:animate-none" />
          <div className="pointer-events-none absolute inset-x-0.5 top-0.5 h-[40%] rounded-t-md bg-[linear-gradient(180deg,rgba(255,255,255,0.15)_0%,transparent_100%)]" />
        </div>
      </div>
    </div>
  )
}

/** Loading curtain over the whole stage for scene travel and destination windows. */
export function AreaLoading({ label = 'Loading...' }: { label?: string }) {
  return <LoadingCurtain label={label} className="absolute inset-0 z-[100]" />
}
