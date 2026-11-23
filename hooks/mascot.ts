// Bip, the panel's robot: an original character drawn in flat shapes.
// The motion is slow and small: a gentle bob, a blink, a pulsing antenna,
// eyes that scan while it works and one short wave when a review is done.
// It is CSS, so a system set to reduce motion stops all of it.

import type { Mood } from '../types'
import { C } from './charts'

const BODY = '#2d3036'
const EDGE = '#4a5058'
const SCREEN = '#101215'

const STYLE =
  '<style>' +
  '.bob{animation:bob 3.2s ease-in-out infinite}' +
  '@keyframes bob{50%{transform:translateY(-1.2px)}}' +
  '.ant{animation:pulse 2.6s ease-in-out infinite}' +
  '.work .ant{animation-duration:1.1s}' +
  '@keyframes pulse{50%{opacity:.4}}' +
  '.eye{transform-box:fill-box;transform-origin:center;animation:blink 4.6s infinite}' +
  '@keyframes blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}' +
  '.scan{animation:scan 1.8s ease-in-out infinite}' +
  '@keyframes scan{0%,100%{transform:translateX(-1.4px)}50%{transform:translateX(1.4px)}}' +
  '.wave{transform-box:fill-box;transform-origin:50% 0;animation:wave .4s ease-in-out 4 alternate}' +
  '@keyframes wave{to{transform:rotate(-28deg)}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}' +
  '</style>'

const eyes = (mood: Mood): string => {
  if (mood === 'happy' || mood === 'done') {
    return (
      `<path d="M20.5 23.5 q2.5 -3.6 5 0" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M30.5 23.5 q2.5 -3.6 5 0" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linecap="round"/>`
    )
  }

  if (mood === 'oops') {
    return (
      `<rect x="21" y="21" width="4.5" height="2" rx="1" fill="${C.accent}"/>` +
      `<rect x="30.5" y="21" width="4.5" height="2" rx="1" fill="${C.accent}"/>`
    )
  }

  return (
    `<g class="${mood === 'work' ? 'scan' : ''}">` +
    `<rect class="eye" x="21.5" y="19" width="4" height="6" rx="2" fill="${C.accent}"/>` +
    `<rect class="eye" x="30.5" y="19" width="4" height="6" rx="2" fill="${C.accent}"/>` +
    `</g>`
  )
}

const mouth = (mood: Mood): string => {
  if (mood === 'oops') return `<circle cx="28" cy="28" r="1.4" fill="none" stroke="${C.accent}" stroke-width="1.2"/>`
  if (mood === 'work') return `<rect x="26" y="27.4" width="4" height="1.2" rx="0.6" fill="${C.accent}"/>`

  return `<path d="M25.5 27 q2.5 2.2 5 0" fill="none" stroke="${C.accent}" stroke-width="1.3" stroke-linecap="round"/>`
}

const arms = (mood: Mood): string =>
  `<rect x="14" y="39" width="4" height="9" rx="2" fill="${EDGE}"/>` +
  `<rect class="${mood === 'done' || mood === 'hello' ? 'wave' : ''}" x="38" y="39" width="4" height="9" rx="2" fill="${EDGE}"/>`

/** The robot as an SVG document, 56 by 56 CSS pixels. */
export const robot = (mood: Mood): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56" class="${mood}">` +
  STYLE +
  `<g class="bob">` +
  `<line x1="28" y1="10" x2="28" y2="5" stroke="${EDGE}" stroke-width="1.6"/>` +
  `<circle class="ant" cx="28" cy="4" r="2.3" fill="${mood === 'oops' ? C.warn : C.accent}"/>` +
  `<rect x="9" y="17" width="3" height="8" rx="1.5" fill="${EDGE}"/>` +
  `<rect x="44" y="17" width="3" height="8" rx="1.5" fill="${EDGE}"/>` +
  `<rect x="12" y="10" width="32" height="24" rx="7" fill="${BODY}" stroke="${EDGE}" stroke-width="1.2"/>` +
  `<rect x="16" y="14" width="24" height="16" rx="4.5" fill="${SCREEN}"/>` +
  eyes(mood) +
  mouth(mood) +
  arms(mood) +
  `<rect x="18" y="36" width="20" height="13" rx="4" fill="${BODY}" stroke="${EDGE}" stroke-width="1.2"/>` +
  (mood === 'done'
    ? `<path d="M24.5 42.5 l2.4 2.4 l4.6 -4.8" fill="none" stroke="${C.ok}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="28" cy="42.5" r="1.8" fill="${C.accent}"/>`) +
  `</g></svg>`

/** The robot for the terminal, which draws no SVG. */
export const robotText = (mood: Mood): string =>
  mood === 'happy' || mood === 'done' ? '[^_^]' : mood === 'oops' ? '[-_-]' : mood === 'work' ? '[o_o]' : '[•_•]'
