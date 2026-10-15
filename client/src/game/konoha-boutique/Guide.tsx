// The Konoha Boutique's Guide window (Reborn `ui__slot_machine_guide`, 620x520): Reborn's texts
// and the level table from the server's view.
import {
  BOUTIQUE_RULES as RULES,
  type BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique'
import { Dialog } from '../skin'

const SECTIONS: [string, string][] = [
  ['How to Play', 'Learn the basics of gameplay and get started.'],
  ['Multiplier & Lines', 'Increase multiplier and paylines to boost your winnings.'],
  ['Match Payouts', 'Match symbols across paylines to win prizes.'],
  ['Leveling Up', 'Gain experience to level up and unlock new features.'],
  ['Bonus Round', 'Match 3 bonus symbols to trigger a bonus round with extra rewards!'],
  ['Double Chance', 'Double your chance to win on the next spin!'],
  [
    'Free Coins',
    `Claim ${RULES.freeCoins} free coins every ${RULES.freeCoinsEveryMs / 60_000} minutes, up to ${RULES.freeCoinsPerDay} times per server day.`,
  ],
]

export function Guide({ view, onClose }: { view: BoutiqueView; onClose: () => void }) {
  return (
    <Dialog title="Guide" onClose={onClose} className="w-[630px]">
      <div className="flex flex-col gap-[8px] text-[12px] leading-[16px]">
        {SECTIONS.map(([title, text]) => (
          <section key={title}>
            <h3 className="font-bold text-[#a0522d]">{title}</h3>
            <p>{text}</p>
            {title === 'Multiplier & Lines' && (
              <>
                <p className="font-bold">Cost per Spin = Multiplier × Lines</p>
                <table className="mt-[4px] w-full text-center">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Max Multiplier</th>
                      <th>Max Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(view.levels).map(([level, [, multiplier, lines]]) => (
                      <tr key={level}>
                        <td>Lv.{level}</td>
                        <td>×{multiplier}</td>
                        <td>{lines}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {title === 'Match Payouts' && (
              <ul className="list-disc pl-5">
                {Object.entries(RULES.matchPayouts).map(([match, payout]) => (
                  <li key={match}>
                    {match} Match → ×{payout}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Dialog>
  )
}
