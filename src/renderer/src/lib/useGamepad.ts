import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const REPEAT_MS = 180
const AXIS_THRESHOLD = 0.62

export function gamepadFocusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.closest('[aria-hidden="true"]')) return false
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

function isTextInput(element: HTMLElement | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

export function useGamepad({ onBack }: { onBack?: () => void } = {}): {
  connected: boolean
  count: number
} {
  const [connected, setConnected] = useState(false)
  const [count, setCount] = useState(0)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const lastPress = useRef(new Map<string, number>())
  const previous = useRef(new Map<number, boolean[]>())
  const frame = useRef(0)

  useEffect(() => {
    const refresh = (): void => {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
      setCount(pads.length)
      setConnected(pads.length > 0)
    }
    const onConnected = (): void => refresh()
    const onDisconnected = (): void => refresh()
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    refresh()

    const press = (key: string): boolean => {
      const now = performance.now()
      const last = lastPress.current.get(key) || 0
      if (now - last < REPEAT_MS) return false
      lastPress.current.set(key, now)
      return true
    }

    const move = (direction: 'next' | 'prev'): void => {
      const focusables = gamepadFocusables()
      const target = nextGamepadFocus(focusables, document.activeElement as HTMLElement | null, direction)
      target?.focus()
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
        const axisX = pad.axes[0] || 0
        const axisY = pad.axes[1] || 0

        if (pressed(12) || (axisY < -AXIS_THRESHOLD && press(`up-${pad.index}`))) move('prev')
        if (pressed(13) || (axisY > AXIS_THRESHOLD && press(`down-${pad.index}`))) move('next')
        if (pressed(14) || (axisX < -AXIS_THRESHOLD && press(`left-${pad.index}`))) move('prev')
        if (pressed(15) || (axisX > AXIS_THRESHOLD && press(`right-${pad.index}`))) move('next')
        if (pressed(0) && press(`a-${pad.index}`)) activate()
        if (pressed(1) && press(`b-${pad.index}`)) {
          const dialog = document.querySelector('[role="dialog"]')
          if (dialog) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          } else {
            onBackRef.current?.()
          }
        }
        previous.current.set(pad.index, buttons)
      }
      if (!pads.length) {
        previous.current.clear()
        lastPress.current.clear()
      }
    }
    frame.current = window.requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
      window.cancelAnimationFrame(frame.current)
    }
  }, [])

  return { connected, count }
}
