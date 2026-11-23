// Bip, the panel's robot: an original pixel-art character on a 28 by 28 grid,
// in the greens of Tráfego Com Pedro. Each mood is a pose with its own props
// (a magnifier, a notepad, a siren, a broom...). Every pixel is a 1-unit rect
// and every motion moves whole pixels in CSS steps, so the edges stay crisp.
// A system set to reduce motion stops all of it.

import type { Mood } from '../types'

// One letter per color. The first four greens are the brand palette.
const P: Record<string, string> = {
  o: '#143329', // outline (verde escuro)
  k: '#09230f', // face screen (verde mais escuro)
  b: '#dcecbf', // body (verde claro)
  g: '#7fba24', // eyes, ears, antenna, feet (verde)
  f: '#7fba24',
  s: '#b4d28a', // body shade
  h: '#f7fbef', // body highlight
  m: '#4d7a57', // antenna stalk
  d: '#24481c', // dim screen green
  G: '#c4f07c', // lit screen green
  w: '#ffffff',
  j: 'rgba(255,255,255,.85)',
  x: 'rgba(0,0,0,.4)', // floor shadow
  p: '#e8968e', // blush, tongue, eraser
  y: '#f5c542', // gold: sparkles, signs, straw
  r: '#f2b33d', // magnifier rim
  l: 'rgba(150,205,235,.35)', // magnifier glass
  n: '#8a5a2b', // wood
  z: '#e8f5d0', // Z, notes
  D: '#8fd3f4', // sweat drop
  S: '#9aa59c', // smoke, steam, metal
  R: '#e5534b', // siren, wrong mark
  Q: '#f6f5ee', // paper, mug
  q: '#93a39a', // paper edge
  L: '#3b5246', // ink
  Y: '#f5c542', // pencil
  W: '#f0d3a3', // pencil wood
  T: '#2e2e2e', // pencil tip, sign mark
  C: '#c8925a', // cardboard
  K: '#4a2c17', // box inside, coffee
  M: '#ece6d6', // moth
}

type Part = { x: number; y: number; rows: string[]; cls?: string }
const S = (x: number, y: number, rows: string[], cls?: string): Part => ({ x, y, rows, cls })

// Head, ears, antenna and body. Eyes, mouth, arms and props go on top per mood.
const BASE = [
  '.............oo.............',
  '............o..o............',
  '............o..o............',
  '.............oo.............',
  '.............mm.............',
  '.............mm.............',
  '.......oooooooooooooo.......',
  '......ohbbbbbbbbbbbbso......',
  '......obbkkkkkkkkkkbso......',
  '....ooobkkkkkkkkkkkksooo....',
  '....ogobkkkkkkkkkkkksogo....',
  '....ogobkkkkkkkkkkkksogo....',
  '....ogobkkkkkkkkkkkksogo....',
  '....ooobkkkkkkkkkkkksooo....',
  '......obbkkkkkkkkkkbso......',
  '......osssssssssssssso......',
  '.......oooooooooooooo.......',
  '.........ohbbbbbbso.........',
  '.........obbb..bbso.........',
  '.........obbb..bbso.........',
  '.........obbbbbbbso.........',
  '.........osssssssso.........',
  '..........oooooooo..........',
]

// Groups: `sh` shadow, `fa`/`fb` feet, `bd` body (bobs), `fx*` free effects
// that do not bob; any other name is a prop group inside the body.
const base = (): Part[] => [
  S(8, 25, ['xxxxxxxxxxxx'], 'sh'),
  S(9, 23, ['.fff', 'ffff'], 'fa'),
  S(15, 23, ['fff.', 'ffff'], 'fb'),
  S(0, 0, BASE),
  S(13, 1, ['gg', 'gg'], 'an'),
  S(13, 18, ['gg', 'gg'], 'ch'),
]
const armL = S(6, 17, ['.o.', 'obo', 'obo', 'obo', '.o.'])
const armR = S(19, 17, ['.o.', 'obo', 'obo', 'obo', '.o.'])
const foreR = S(19, 17, ['.obo..', 'obo...', '.o....'])
const handR = (cls?: string) => S(19, 14, ['...oo.', '..obbo', '..obbo'], cls)
const upL = S(3, 14, ['.oo...', 'obbo..', 'obbo..', '..obo.', '...obo', '....o.'])
const eyes = (y: number, dx = 0) => [S(10 + dx, y, ['wg', 'gg', 'gg'], 'ey'), S(16 + dx, y, ['wg', 'gg', 'gg'], 'ey')]
const happy = [S(10, 10, ['.g.', 'g.g']), S(15, 10, ['.g.', 'g.g'])]
const blush = (y: number) => [S(9, y, ['pp']), S(17, y, ['pp'])]
const smile = S(12, 13, ['g..g', '.gg.'])

const POSES: Record<Mood, () => Part[]> = {
  // Empty panel left alone: eyes shut, antenna dim, Zs float up.
  sleep: () => [...base(), armL, armR, S(10, 11, ['gg']), S(16, 11, ['gg']), ...blush(12), S(13, 14, ['gg']), S(21, 4, ['zzz', '.z.', 'zzz'], 'fxz1'), S(23, 1, ['zzzz', '..z.', '.z..', 'zzzz'], 'fxz2')],
  // A review starts: waves, sparkles blink.
  hello: () => [...base(), armL, foreR, handR('hd'), ...happy, ...blush(12), smile, S(24, 9, ['.y.', 'yyy', '.y.'], 'fxs1'), S(26, 14, ['y'], 'fxs2'), S(1, 12, ['y'], 'fxs2')],
  // Reading account data: looks up, the antenna sends signal, a loading bar for a mouth, feet march.
  fetch: () => [...base(), armL, armR, ...eyes(8), ...blush(12), S(10, 13, ['dddddddd']), S(10, 13, ['GG'], 'ld'), S(9, 0, ['.g', 'g.', 'g.', '.g'], 'sa'), S(17, 0, ['g.', '.g', '.g', 'g.'], 'sa'), S(6, 0, ['.g', 'g.', 'g.', '.g'], 'sb'), S(20, 0, ['g.', '.g', '.g', 'g.'], 'sb')],
  // Analyzing: a magnifier over one eye, the other squints; the lens circles.
  look: () => [...base(), armL, S(10, 10, ['gg']), S(9, 12, ['pp']), S(11, 13, ['gg']), foreR, S(13, 7, ['.rrrrr.', 'rjllllr', 'rlwgglr', 'rlggglr', 'rlggglr', 'rlllllr', '.rrrrr.'], 'lz'), S(19, 13, ['nn.', '.nn', '..n'], 'lz'), handR('lz')],
  // Claude reports findings: a notepad in TCP green, the pencil scribbles, lines appear.
  write: () => [...base(), armL, ...eyes(10), S(9, 13, ['pp']), S(17, 13, ['pp']), S(13, 13, ['gg']), S(14, 14, ['p']), S(7, 16, ['ggggggg', 'QQQQQQQ', 'QQQQQQQ', 'QQQQQQQ', 'QQQQQQQ', 'QQQQQQQ', 'qqqqqqq']), S(8, 18, ['LLLLL'], 'l1'), S(8, 20, ['LLLL'], 'l2'), S(14, 16, ['...pp', '..YY.', '.YY..', 'WW...', 'T....'], 'pc'), S(17, 17, ['bbo', 'bbo', 'oo.'], 'pc'), S(20, 17, ['o', 'o', 'o'])],
  // Review done: jumps with both arms up, confetti falls.
  done: () => [...base(), upL, foreR, handR(), ...happy, ...blush(12), S(12, 13, ['gggg', '.pp.']), S(3, 0, ['y'], 'fxc1'), S(14, 1, ['w'], 'fxc1'), S(24, 0, ['p'], 'fxc1'), S(8, 2, ['g'], 'fxc2'), S(20, 1, ['y'], 'fxc2'), S(1, 3, ['w'], 'fxc3'), S(17, 0, ['p'], 'fxc3'), S(26, 2, ['g'], 'fxc3')],
  // A call failed: X eyes, wobbly mouth, red antenna, sweat and smoke, a shake.
  oops: () => [...base(), armL, armR, S(9, 9, ['g.g', '.g.', 'g.g']), S(16, 9, ['g.g', '.g.', 'g.g']), S(11, 13, ['.g.g.g', 'g.g.g.']), S(13, 1, ['RR', 'RR'], 'an'), S(22, 4, ['.D', 'DD', 'DD'], 'fxd'), S(16, 0, ['.SS', 'SSS'], 'fxm1'), S(19, 1, ['SS'], 'fxm2')],
  // A call can change an account: siren on the antenna, a "!" sign, one arm up.
  alert: () => [...base(), upL, foreR, S(9, 9, ['ggg', 'gwg', 'ggg']), S(16, 9, ['ggg', 'gwg', 'ggg']), S(13, 13, ['gg', 'gg']), S(12, 0, ['.RR.', 'RjRR', 'RRRR', 'SSSS'], 'an'), S(8, 1, ['RRR'], 'sa'), S(17, 1, ['RRR'], 'sb'), S(21, 6, ['yyyyy', 'yyTyy', 'yyTyy', 'yyTyy', 'yyyyy', 'yyTyy', 'yyyyy'], 'hd'), S(23, 13, ['n', 'n'], 'hd'), handR('hd')],
  // Numbers that did not match: a clipboard with a check and an X, a raised brow, a "?".
  sus: () => [...base(), armL, armR, S(9, 11, ['gg']), S(9, 9, ['gg']), S(15, 10, ['wg', 'gg', 'gg'], 'ey'), S(15, 8, ['gg'], 'br'), S(11, 14, ['ggg']), S(0, 14, ['..SSS..', 'nnSSSnn', 'nQQQQQn', 'nQQQgQn', 'ngQgQQn', 'nQgQQQn', 'nQQQQQn', 'nQRQRQn', 'nQQRQQn', 'nQRQRQn', 'nnnnnnn']), S(19, 0, ['yyy', '..y', '.yy', '.y.', '...', '.y.'], 'fxq')],
  // A call came back with no rows: an open box, a moth flies out.
  empty: () => [...base(), armL, armR, ...eyes(10, 1), S(13, 14, ['gg']), S(19, 17, ['C......C', 'CC....CC', 'nKKKKKKn', 'nCCCCCCn', 'nCCCCCCn', 'nCCCCCCn', 'nnnnnnnn']), S(22, 14, ['M.M', '.M.'], 'fxmA'), S(22, 14, ['...', 'MMM'], 'fxmB')],
  // A step is done: thumbs up, a wink, a check lights up on the chest.
  step: () => [...base(), armL, foreR, S(10, 9, ['wg', 'gg', 'gg'], 'ey'), S(15, 10, ['.g.', 'g.g']), ...blush(12), smile, S(12, 18, ['kkkk', 'kkkk', 'kkkk']), S(12, 18, ['...G', 'G.G.', '.G..'], 'ck'), S(22, 10, ['..ooo.', '..obo.', 'ooobo.', 'obbbbo', 'obbbbo', 'obbbo.', '.ooo..'], 'th'), S(23, 6, ['.y.', 'yyy', '.y.'], 'fxs1')],
  // Paused: a coffee break, steam rises from a mug with the TCP green band.
  pause: () => [...base(), armL, armR, ...happy, ...blush(12), smile, S(22, 19, ['qKKq.', 'QQQQq', 'ggggq', 'QQQQ.']), S(22, 15, ['S.', '.S', 'S.'], 'fxst1'), S(24, 14, ['.S', 'S.', '.S'], 'fxst2')],
  // Panel cleared: sweeps with a broom, whistling.
  clean: () => [...base(), armL, foreR, ...happy, ...blush(12), S(13, 13, ['gg', 'gg']), S(24, 9, Array(11).fill('n'), 'bm'), S(22, 20, ['.nnn.', 'yyyyy', 'yyyyy', 'y.y.y'], 'bm'), S(23, 15, ['.oo.', 'obbo', 'obbo', '.oo.'], 'bm'), S(20, 22, ['S.', 'SS'], 'fxdu1'), S(27, 21, ['S', 'S'], 'fxdu2'), S(17, 1, ['.zz', '.z.', '.z.', 'zz.'], 'fxn')],
  // Sample data: a green graduation cap, a pointer, a chart that grows bar by bar.
  demo: () => [...base(), armL, foreR, ...eyes(8, 1), ...blush(12), S(12, 13, ['gggg', '.pp.'], 'sa'), S(12, 13, ['g..g', '.gg.'], 'sb'), S(6, 4, ['gggggggggggggggg']), S(8, 5, ['dddddddddddd']), S(21, 5, ['y', 'y', 'y']), S(22, 7, ['qqqqqq']), S(22, 5, ['GG', 'GG'], 'l1'), S(24, 3, ['GG', 'GG', 'GG', 'GG'], 'l2'), S(26, 1, ['GG', 'GG', 'GG', 'GG', 'GG', 'GG'], 'l3'), S(24, 8, ['...w', '..n.', '..n.', '.n..', '.n..', 'n...']), handR()],
}

/** Every mood Bip can show, in the order a review goes through them. */
export const MOODS = Object.keys(POSES) as Mood[]

// Motion moves whole pixels with steps(), so nothing blurs between frames.
const CSS =
  '<style>' +
  '.bip .bd{animation:bob 1s steps(1) infinite}@keyframes bob{50%{transform:translateY(1px)}}' +
  '.bip .ey{transform-box:fill-box;transform-origin:center;animation:blink 4s linear infinite}@keyframes blink{0%,93%,100%{transform:scaleY(1)}94%,97%{transform:scaleY(.34)}}' +
  '.bip .an{animation:pulse 2s steps(1) infinite}@keyframes pulse{50%{opacity:.35}}@keyframes tw{50%{opacity:0}}' +
  '@keyframes zz{0%{transform:translateY(2px);opacity:0}25%{opacity:1}100%{transform:translateY(-2px);opacity:0}}' +
  '.sa{animation:sa 1s steps(1) infinite}.sb{animation:sb 1s steps(1) infinite}@keyframes sa{50%{opacity:0}}@keyframes sb{0%{opacity:0}50%{opacity:1}}' +
  '.hd{animation:wave .5s steps(1) infinite}@keyframes wave{50%{transform:translateX(1px)}}' +
  '.fxs1{animation:tw 1s steps(1) infinite}.fxs2{animation:tw 1s steps(1) infinite -.5s}' +
  '.st-sleep .bd{animation-duration:2s}.st-sleep .an{animation:none;opacity:.35}.fxz1,.fxz2{animation:zz 2s steps(4) infinite}.fxz2{animation-delay:-1s}' +
  '.st-fetch .bd,.st-fetch .an{animation-duration:.5s}.st-fetch .fa{animation:stp .5s steps(1) infinite}.st-fetch .fb{animation:stp .5s steps(1) infinite -.25s}@keyframes stp{50%{transform:translateY(-1px)}}' +
  '.ld{animation:ld 1s steps(4) infinite}@keyframes ld{to{transform:translateX(8px)}}' +
  '.st-look .lz{animation:scan 2s steps(1) infinite}@keyframes scan{25%{transform:translate(-1px,0)}50%{transform:translate(-1px,1px)}75%{transform:translate(0,1px)}}' +
  '.st-write .pc{animation:wr .5s steps(1) infinite}@keyframes wr{25%{transform:translate(-1px,0)}50%{transform:translate(0,1px)}75%{transform:translate(-1px,1px)}}' +
  '.l1,.l2,.l3{opacity:0;animation:l1 2s steps(1) infinite}.l2{animation-name:l2}.l3{animation-name:l3}' +
  '@keyframes l1{0%{opacity:0}25%{opacity:1}92%{opacity:0}}@keyframes l2{0%{opacity:0}45%{opacity:1}92%{opacity:0}}@keyframes l3{0%{opacity:0}65%{opacity:1}92%{opacity:0}}' +
  '.st-done .bd{animation:none}.st-done .all{animation:jump .5s steps(1) infinite}@keyframes jump{50%{transform:translateY(-2px)}}' +
  '.st-done .sh{transform-box:fill-box;transform-origin:center;animation:shr .5s steps(1) infinite}@keyframes shr{50%{transform:scaleX(.67)}}' +
  '.fxc1,.fxc2,.fxc3{animation:fall 2s steps(8) infinite}.fxc2{animation-delay:-.5s}.fxc3{animation-delay:-1s}@keyframes fall{0%{transform:translateY(-2px)}100%{transform:translateY(14px)}}' +
  '.st-oops .all{animation:shake 1s steps(1) infinite}@keyframes shake{10%{transform:translateX(-1px)}20%{transform:translateX(1px)}30%{transform:translateX(-1px)}40%{transform:translateX(0)}}' +
  '.st-oops .an,.st-alert .an{animation:pulse .5s steps(1) infinite}.fxd{animation:drop 1s steps(2) infinite}@keyframes drop{to{transform:translateY(2px)}}' +
  '.fxm1{animation:tw 1s steps(1) infinite}.fxm2{animation:tw 1s steps(1) infinite -.5s}' +
  '.br{animation:brw 2s steps(1) infinite}@keyframes brw{50%{transform:translateY(-1px)}}.fxq{animation:tw 1s steps(1) infinite}' +
  '.fxmA{animation:rise 2s steps(8) infinite,sa .5s steps(1) infinite}.fxmB{animation:rise 2s steps(8) infinite,sb .5s steps(1) infinite}@keyframes rise{to{transform:translateY(-8px)}}' +
  '.ck{animation:tw 1s steps(1) infinite}.st-step .th{animation:pump .5s steps(1) infinite}@keyframes pump{50%{transform:translateY(-1px)}}' +
  '.st-pause .bd{animation-duration:2s}.fxst1,.fxst2{animation:zz 2s steps(4) infinite}.fxst2{animation-delay:-1s}' +
  '.st-clean .bm{animation:swp .5s steps(1) infinite}@keyframes swp{50%{transform:translateX(-1px)}}' +
  '.fxdu1{animation:tw 1s steps(1) infinite}.fxdu2{animation:tw 1s steps(1) infinite -.5s}.fxn{animation:zz 2s steps(4) infinite}' +
  '@media (prefers-reduced-motion:reduce){.bip *{animation:none!important}.l1,.l2,.l3{opacity:1}}' +
  '</style>'

/** The robot as an SVG document on a 28 by 28 pixel grid. Draw it at 28 or 56 so every pixel stays square. */
export const robot = (mood: Mood): string => {
  // A mood saved by an older version falls back to the wave.
  const st: Mood = Object.prototype.hasOwnProperty.call(POSES, mood) ? mood : 'hello'
  const groups = new Map<string, string[]>()

  for (const p of POSES[st]()) {
    const cls = p.cls ?? 'bd'
    const rects = groups.get(cls) ?? []
    groups.set(cls, rects)

    p.rows.forEach((row, dy) => {
      let x = 0
      while (x < row.length) {
        const ch = row[x] ?? '.'
        const color = P[ch]
        if (ch === '.' || color === undefined) {
          x++
          continue
        }
        // One rect per run of the same color.
        let n = 1
        while (row[x + n] === ch) n++
        rects.push(`<rect x="${p.x + x}" y="${p.y + dy}" width="${n}" height="1" fill="${color}"/>`)
        x += n
      }
    })
  }

  const group = (cls: string) => (groups.has(cls) ? `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>` : '')
  const outer = new Set(['sh', 'fa', 'fb', 'bd'])
  const names = [...groups.keys()]
  const props = names.filter(c => !outer.has(c) && !c.startsWith('fx')).map(group).join('')
  const effects = names.filter(c => c.startsWith('fx')).map(group).join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="56" height="56" shape-rendering="crispEdges" class="bip st-${st}">` +
    CSS +
    group('sh') +
    `<g class="all">${group('fa')}${group('fb')}<g class="bd">${(groups.get('bd') ?? []).join('')}${props}</g></g>` +
    effects +
    `</svg>`
  )
}

const FACES: Record<Mood, string> = {
  sleep: '[-_-]z',
  hello: '[^_^]/',
  fetch: '[o_o]..',
  look: '[o_O]',
  write: '[._.]_',
  done: '\\[^o^]/',
  oops: '[x_x]',
  alert: '[O_O]!',
  sus: '[-_o]?',
  empty: '[o_o]?',
  step: '[^_-]b',
  pause: '[^_^]c',
  clean: '[^o^]~',
  demo: '[^o^]>',
}

/** The robot for the terminal, which draws no SVG. */
export const robotText = (mood: Mood): string => FACES[mood] ?? FACES.hello
