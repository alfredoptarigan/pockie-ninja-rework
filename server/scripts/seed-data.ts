// English site copy, drafted from the original 2011 game data (scenes, quests, systems).
// Seeded by scripts/seed.ts; edit here and re-run `pnpm db:seed`.
import type { PostKind } from '@pockie/shared'

interface SeedPost {
  kind: PostKind
  slug: string
  title: string
  summary: string
  body: string
  publishedAt: string
}

export const seedPosts: SeedPost[] = [
  {
    kind: 'news',
    slug: 'welcome-back-ninja',
    title: 'Welcome back, ninja',
    summary:
      'Pockie Ninja Remastered brings the 2011 chibi ninja RPG back to modern browsers, fully in English.',
    body: 'Pockie Ninja was a tiny browser game with a huge heart: chibi heroes, turn-based battles that played out on their own, and a village full of people who needed your help. When Flash went dark, so did the game. Pockie Ninja Remastered is our attempt to bring it back: no plugins, no half-translated menus, and every quest rewritten in clear English. Create your account today so your name is ready when the gates open.',
    publishedAt: '2026-10-10T09:00:00Z',
  },
  {
    kind: 'update',
    slug: 'dev-log-1-rebuilding-a-flash-classic',
    title: 'Dev log #1: rebuilding a Flash classic',
    summary:
      'How we are moving 12 fps Flash movie clips into a modern HTML5 client without losing their charm.',
    body: 'The original client was a Flash application that played every character as a movie clip at 12 frames per second. We are exporting those animations frame by frame and rebuilding the client in HTML5, so the game runs in any modern browser on desktop and laptop. The battle timing, the bounce of a critical hit and the little dust puff on a dodge all come from the original data. This website is the first piece: accounts, news and the story so far.',
    publishedAt: '2026-10-08T09:00:00Z',
  },
  {
    kind: 'news',
    slug: 'account-registration-is-open',
    title: 'Account registration is open',
    summary: 'Claim your ninja name now. Usernames are first come, first served.',
    body: 'You can now register an account on this site. Pick a username between 3 and 16 characters (letters, numbers and underscores). Usernames are unique regardless of capital letters, so Naruto and NARUTO count as the same name. Your account will be the key to the game client when it arrives.',
    publishedAt: '2026-10-05T09:00:00Z',
  },
  {
    kind: 'event',
    slug: 'event-preview-the-sushi-feast',
    title: 'Event preview: The Sushi Feast',
    summary:
      'The Fire Village banquet is short on wasabi sushi rolls, and the Sushi Monsters of the Smelting Mountains will not share.',
    body: 'Every new ninja remembers their first errand: the Fire Village is throwing a banquet and the kitchen has run out of wasabi sushi rolls. The only supply belongs to the Sushi Monsters roaming the Smelting Mountains. The Sushi Feast will be our first live event once the game client opens, with a banquet table that fills up as the whole server brings rolls home.',
    publishedAt: '2026-10-03T09:00:00Z',
  },
  {
    kind: 'update',
    slug: 'every-line-translated',
    title: 'Every line, translated',
    summary:
      'Thousands of quests, item tooltips and NPC lines are being rewritten in natural English.',
    body: 'The 2011 release shipped with more than 2,400 quests and thousands of item descriptions. Many of them were never translated, and the ones that were often read like a puzzle. We are rewriting all of it by hand, keeping names and jokes intact where we can and making quest goals clear: where to go, who to talk to and what to bring back.',
    publishedAt: '2026-09-28T09:00:00Z',
  },
  {
    kind: 'event',
    slug: 'event-preview-tailed-beast-hunt',
    title: 'Event preview: Tailed Beast Hunt',
    summary: 'Nine tailed beasts, one strength ranking. Bring friends.',
    body: 'The nine tailed beasts were among the hardest fights in the original game, and their strength ranking was a point of pride for every clan of friends. The Tailed Beast Hunt returns as a recurring event after launch, with the original ranking board and rewards rebalanced for the remastered level curve.',
    publishedAt: '2026-09-20T09:00:00Z',
  },
  {
    kind: 'news',
    slug: 'why-we-are-remastering-pockie-ninja',
    title: 'Why we are remastering Pockie Ninja',
    summary: 'A short note on what we keep, what we fix and what stays exactly the same.',
    body: 'We keep the things that made the game special: auto-battles you plan rather than click through, outfits that change your skills, a home with a garden, and a long road from the Fire Village to the Abandoned Evernight City. We fix the things that aged badly: Flash, broken translations and grind that existed only to sell boosts. And we keep the level cap at 90, just like the original.',
    publishedAt: '2026-09-15T09:00:00Z',
  },
  {
    kind: 'update',
    slug: 'dev-log-0-digging-up-the-archives',
    title: 'Dev log #0: digging up the archives',
    summary: 'We restored a full 2011 server backup and got the original game running again.',
    body: 'Before writing a single line of new code, we restored a complete backup of the original game and played it again, end to end. It gave us the real numbers: 92 outfits, 339 skills, 360 monster groups and a level table that tops out at 90. Every system in the remaster starts from that data, not from memory.',
    publishedAt: '2026-09-10T09:00:00Z',
  },
]

export const seedLore = [
  {
    position: 1,
    title: 'The Five Seals',
    body: 'Long ago, a demon army poured out of the dark and was driven back only at great cost. Its generals could not be destroyed, so the ninja of old bound them behind seals of fire, wind, earth, water and light, and built villages beside each one to keep watch. Generations passed. The villages grew, the stories faded, and the seals were mostly forgotten. Until now.',
  },
  {
    position: 2,
    title: 'The Fire Village',
    body: 'Every journey starts at the Fire Village, where the old village chief still tells the history of the seals to anyone who will listen. Beyond its gates lie the Smelting Mountains, the Eventide Barrens and the Fiery Ridge. A genin scout sent out to gather news has gone missing, travelling merchants are being robbed on the roads, and something has made the fire seal flicker.',
  },
  {
    position: 3,
    title: 'Wind and Earth',
    body: 'The Wind Village sits above Verdant Alley and the Slowflower River, where the air never stops moving. The Earth Village guards Peaked Whetstone and the Thundering Steps that climb into the clouds. Its masters keep an ancient scroll called Immovable Mountain, but the Earth Demon General has already stirred, and the villagers who live closest to the seal are starting to change.',
  },
  {
    position: 4,
    title: 'Angel City and Demon City',
    body: 'Past the villages stand two great cities that have watched each other for centuries: shining Angel City and the walled Demon City. Their markets are the busiest in the land, their arenas the loudest, and their spies are everywhere. Further on, Dragontame Valley hides caves where young ninja go to earn a mount that will not throw them off.',
  },
  {
    position: 5,
    title: 'The Endless Night',
    body: 'At the edge of the map lie the Abandoned Evernight City, Soulshatter Valley and the Plains of Despair, where the last seal is failing. The heroes who reach it will need every outfit, technique and friend they have gathered on the way, because the generals behind the seals remember who locked them in.',
  },
]

export const seedFaq = [
  {
    position: 1,
    question: 'What is Pockie Ninja Remastered?',
    answer:
      'A fan remaster of Pockie Ninja (also known as Ninja Kita), the 2011 browser RPG with chibi heroes and automatic turn-based battles. It is rebuilt for modern browsers and fully in English.',
  },
  {
    position: 2,
    question: 'When can I play?',
    answer:
      'The game client is still in development. You can create an account now; the Play page will open the game as soon as it is ready, and news posts on this page will tell you when.',
  },
  {
    position: 3,
    question: 'Do I need Flash or a download?',
    answer: 'No. The remaster runs in any modern desktop browser without plugins or downloads.',
  },
  {
    position: 4,
    question: 'Is it free to play?',
    answer:
      'Yes. There are no paid boosts planned, and grind that only existed to sell items is being removed.',
  },
  {
    position: 5,
    question: 'Can I recover my account from the 2011 game?',
    answer:
      'No. The original servers and their player data are gone, so everyone starts fresh with a new account here.',
  },
  {
    position: 6,
    question: 'Which characters can I play?',
    answer:
      'You create your own ninja and change their look and skills with outfits. The original game had 92 outfits, from Naruto Uzumaki and Sasuke Uchiha to Ichigo Kurosaki and Rukia Kuchiki, and they are all coming back.',
  },
  {
    position: 7,
    question: 'Can I play on my phone?',
    answer:
      'This website works on phones. The game itself is designed for desktop and laptop screens first; mobile support may follow later.',
  },
  {
    position: 8,
    question: 'How is my account protected?',
    answer:
      'Passwords are stored only as strong one-way hashes, sessions use secure cookies that scripts cannot read, and login attempts are rate limited.',
  },
]
