import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const HOLD_DELAY = 320
const REPEAT_MS = 95
const AXIS_THRESHOLD = 0.58
export const GAMEPAD_FOCUS_CLASS = 'is-gamepad-focus'

export type GamepadDirection = 'up' | 'down' | 'left' | 'right'

export function clearGamepadFocus(): void {
  for (const element of document.querySelectorAll<HTMLElement>(`.${GAMEPAD_FOCUS_CLASS}`)) {
    element.classList.remove(GAMEPAD_FOCUS_CLASS)
  }
}

export function focusGamepadTarget(target: HTMLElement | null): void {
  clearGamepadFocus()
  if (!target) return
  target.classList.add(GAMEPAD_FOCUS_CLASS)
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function gamepadFocusables(scope?: ParentNode | null): HTMLElement[] {
  const root = scope || document
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.closest('[aria-hidden="true"]')) return false
    if (element.closest('[data-gamepad-skip="true"]')) return false
    if (element.closest('.titlebar')) return false
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null
  })
}

export function nextGamepadFocus(
  focusables: HTMLElement[],
  current: HTMLElement | null,
  direction: 'next' | 'prev'
): HTMLElement | null {
  if (!focusables.length) return null
  const index = current ? focusables.indexOf(current) : -1
  if (index < 0) return direction === 'next' ? focusables[0] : focusables[focusables.length - 1]
  const delta = direction === 'next' ? 1 : -1
  return focusables[(index + delta + focusables.length) % focusables.length]
}

interface Point {
  element: HTMLElement
  x: number
  y: number
  width: number
  height: number
}

function centerOf(element: HTMLElement): Point | null {
  const rect = element.getBoundingClientRect()
  if (!rect.width && !rect.height) return null
  return {
    element,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height
  }
}

function overlapAmount(a: Point, b: Point): number {
  const horizontal = Math.max(
    0,
    Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2)
  )
  const vertical = Math.max(
    0,
    Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2)
  )
  return Math.max(horizontal, vertical)
}

export function spatialGamepadFocus(
  focusables: HTMLElement[],
  current: HTMLElement | null,
  direction: GamepadDirection
): HTMLElement | null {
  if (!focusables.length) return null
  if (!current) return focusables[0]
  const origin = centerOf(current)
  if (!origin) return nextGamepadFocus(focusables, current, direction === 'up' || direction === 'left' ? 'prev' : 'next')

  let best: { element: HTMLElement; score: number } | null = null
  for (const element of focusables) {
    if (element === current) continue
    const candidate = centerOf(element)
    if (!candidate) continue

    const dx = candidate.x - origin.x
    const dy = candidate.y - origin.y
    const primary =
      direction === 'up'
        ? -dy
        : direction === 'down'
          ? dy
          : direction === 'left'
            ? -dx
            : dx
    if (primary <= 3) continue

    const secondary = direction === 'up' || direction === 'down' ? dx : dy
    let score = primary + Math.abs(secondary) * 2.4
    const overlap = overlapAmount(origin, candidate)
    if (overlap > 0) score -= 34
    if (Math.abs(secondary) < 10) score -= 28
    if (!best || score < best.score) best = { element, score }
  }

  return best?.element || null
}

function initialGamepadTarget(): HTMLElement | null {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
  const scope = dialog || document
  if (dialog) {
    return gamepadFocusables(dialog)[0] || null
  }
  const preferred =
    document.querySelector<HTMLElement>('.app-nav__tab.is-active') ||
    document.querySelector<HTMLElement>('.app-nav__tab') ||
    document.querySelector<HTMLElement>('.hero-play__actions button')
  return preferred || gamepadFocusables(scope)[0] || null
}

function isTextInput(element: HTMLElement | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

export function useGamepad({
  onBack,
  onTabSwitch
}: {
  onBack?: () => void
  onTabSwitch?: (delta: -1 | 1) => void
} = {}): { connected: boolean; count: number } {
  const [connected, setConnected] = useState(false)
  const [count, setCount] = useState(0)
  const onBackRef = useRef(onBack)
  const onTabSwitchRef = useRef(onTabSwitch)
  onBackRef.current = onBack
  onTabSwitchRef.current = onTabSwitch
  const previous = useRef(new Map<number, boolean[]>())
  const holdState = useRef(new Map<string, { started: number; last: number }>())
  const frame = useRef(0)

  useEffect(() => {
    const refresh = (): void => {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
      setCount(pads.length)
      setConnected(pads.length > 0)
      if (pads.length > 0) {
        if (!document.querySelector(`.${GAMEPAD_FOCUS_CLASS}`)) {
          focusGamepadTarget(initialGamepadTarget())
        }
      } else {
        clearGamepadFocus()
        holdState.current.clear()
      }
    }
    const onConnected = (): void => refresh()
    const onDisconnected = (): void => refresh()
    const onPointerDown = (): void => clearGamepadFocus()
    const onKeyboard = (): void => clearGamepadFocus()
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyboard)
    refresh()

    const observer = new MutationObserver(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
      if (!dialog) return
      if (dialog.contains(document.activeElement)) return
      focusGamepadTarget(initialGamepadTarget())
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const held = (key: string): boolean => {
      const now = performance.now()
      const state = holdState.current.get(key)
      if (!state) {
        holdState.current.set(key, { started: now, last: now })
        return true
      }
      if (now - state.started < HOLD_DELAY) return false
      if (now - state.last < REPEAT_MS) return false
      state.last = now
      return true
    }

    const releaseHolds = (prefix: string): void => {
      for (const key of holdState.current.keys()) {
        if (key.startsWith(prefix)) holdState.current.delete(key)
      }
    }

    const move = (direction: GamepadDirection): void => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
      const focusables = gamepadFocusables(dialog || document)
      if (!focusables.length) return
      const active = document.activeElement as HTMLElement | null
      const target = spatialGamepadFocus(focusables, active, direction)
      if (target) focusGamepadTarget(target)
    }

    const activate = (): void => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return
      if (isTextInput(active)) {
        active.focus()
        return
      }
      active.click()
    }

    const tick = (): void => {
      frame.current = window.requestAnimationFrame(tick)
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
      for (const pad of pads) {
        if (!pad) continue
        const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.5)
        const before = previous.current.get(pad.index) || []
        const pressed = (index: number): boolean => Boolean(buttons[index]) && !before[index]
        const dialog = document.querySelector('[role="dialog"]')

        let dx = 0
        let dy = 0
        if (buttons[14]) dx -= 1
        if (buttons[15]) dx += 1
        if (buttons[12]) dy -= 1
        if (buttons[13]) dy += 1
        if (!dx && !dy) {
          const axisX = pad.axes[0] || 0
          const axisY = pad.axes[1] || 0
          if (Math.abs(axisX) > AXIS_THRESHOLD) dx = axisX
          if (Math.abs(axisY) > AXIS_THRESHOLD) dy = axisY
        }

        let direction: GamepadDirection | null = null
        if (dx || dy) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            direction = dx < 0 ? 'left' : 'right'
          } else {
            direction = dy < 0 ? 'up' : 'down'
          }
        }
        if (direction) {
          const activeKey = `dir-${pad.index}-${direction}`
          for (const key of holdState.current.keys()) {
            if (key.startsWith(`dir-${pad.index}-`) && key !== activeKey) {
              holdState.current.delete(key)
            }
          }
          if (held(activeKey)) move(direction)
        } else {
          releaseHolds(`dir-${pad.index}-`)
        }

        if (pressed(0)) activate()
        if (pressed(1)) {
          releaseHolds(`dir-${pad.index}-`)
          if (dialog) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          } else {
            onBackRef.current?.()
          }
        }
        if (!dialog && pressed(4)) onTabSwitchRef.current?.(-1)
        if (!dialog && pressed(5)) onTabSwitchRef.current?.(1)
        previous.current.set(pad.index, buttons)
      }
      if (!pads.length) {
        previous.current.clear()
        holdState.current.clear()
      }
    }
    frame.current = window.requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyboard)
      window.cancelAnimationFrame(frame.current)
      observer.disconnect()
      clearGamepadFocus()
    }
  }, [])

  return { connected, count }
}
