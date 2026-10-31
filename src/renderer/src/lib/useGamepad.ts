import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-gamepad-focusable="true"]'
].join(',')

const TABLIST = '[role="tablist"], [data-gamepad-tablist]'
const TAB = '[role="tab"], [data-gamepad-tab]'
const HOLD_DELAY = 320
const REPEAT_MS = 95
const AXIS_THRESHOLD = 0.58
const SCROLL_AXIS_THRESHOLD = 0.34
export const GAMEPAD_FOCUS_CLASS = 'is-gamepad-focus'

export type GamepadDirection = 'up' | 'down' | 'left' | 'right'

export function clearGamepadFocus(): void {
  for (const element of document.querySelectorAll<HTMLElement>(`.${GAMEPAD_FOCUS_CLASS}`)) {
    element.classList.remove(GAMEPAD_FOCUS_CLASS)
  }
}

function isVisible(element: HTMLElement): boolean {
  if (
    element.closest(
      '[aria-hidden="true"], [inert], [data-gamepad-skip="true"], .titlebar'
    )
  ) {
    return false
  }
  if (
    element instanceof HTMLInputElement &&
    (element.type === 'hidden' || element.disabled)
  ) {
    return false
  }
  if (
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.disabled
  ) {
    return false
  }
  if (element.getAttribute('aria-disabled') === 'true') return false
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0
}

export function activeGamepadDialog(): HTMLElement | null {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
    (dialog) => {
      if (
        dialog.closest(
          '[aria-hidden="true"], [inert], [data-gamepad-skip="true"], .titlebar'
        )
      ) {
        return false
      }
      const style = window.getComputedStyle(dialog)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = dialog.getBoundingClientRect()
      // Opening overlays animate from opacity: 0. Treat the dialog as active
      // as soon as it is laid out, so B never falls through to page navigation.
      return rect.width > 0 && rect.height > 0 && dialog.getClientRects().length > 0
    }
  )
  return dialogs[dialogs.length - 1] || null
}

export function focusGamepadTarget(target: HTMLElement | null): void {
  clearGamepadFocus()
  if (!target || !target.isConnected) return
  // Custom cards can opt in with [data-gamepad-focusable]. Give them a
  // programmatic tab stop so .focus() also works for non-button elements.
  if (target.tabIndex < 0) target.setAttribute('tabindex', '-1')
  target.classList.add(GAMEPAD_FOCUS_CLASS)
  target.focus({ preventScroll: true })
  if (document.activeElement !== target) return
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function gamepadFocusables(scope?: ParentNode | null): HTMLElement[] {
  const root = scope || document
  const seen = new Set<HTMLElement>()
  const result: HTMLElement[] = []
  for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (seen.has(element)) continue
    seen.add(element)
    if (isVisible(element)) result.push(element)
  }
  return result
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

export function gamepadTabs(tablist: HTMLElement): HTMLElement[] {
  return [...tablist.querySelectorAll<HTMLElement>(TAB)].filter(
    (tab) => isVisible(tab) && !(tab instanceof HTMLButtonElement && tab.disabled)
  )
}

export function gamepadTablist(scope?: ParentNode | null): HTMLElement | null {
  const root = scope || document
  const lists = [...root.querySelectorAll<HTMLElement>(TABLIST)].filter(
    (list) => isVisible(list) && gamepadTabs(list).length > 0
  )
  if (!lists.length) return null
  const focused = document.activeElement
  const current =
    focused instanceof HTMLElement ? focused.closest<HTMLElement>(TABLIST) : null
  if (current && lists.includes(current)) return current
  const selected = lists.find((list) =>
    gamepadTabs(list).some(
      (tab) =>
        tab.getAttribute('aria-selected') === 'true' ||
        tab.getAttribute('aria-pressed') === 'true' ||
        tab.classList.contains('is-active') ||
        tab.classList.contains('is-selected')
    )
  )
  return selected || lists[0]
}

/**
 * LB/RB switch the nearest tab group. Dialog scope is mandatory here: a modal
 * must never cycle a tab behind its own overlay.
 */
export function cycleGamepadTab(scope: ParentNode | null | undefined, delta: -1 | 1): boolean {
  const tablist = gamepadTablist(scope)
  if (!tablist) return false
  const tabs = gamepadTabs(tablist)
  if (!tabs.length) return false
  const index = tabs.findIndex(
    (tab) =>
      tab.getAttribute('aria-selected') === 'true' ||
      tab.getAttribute('aria-pressed') === 'true' ||
      tab.classList.contains('is-active') ||
      tab.classList.contains('is-selected')
  )
  const baseIndex = index >= 0 ? index : delta > 0 ? -1 : 0
  const next = tabs[(baseIndex + delta + tabs.length) % tabs.length]
  if (!next) return false
  next.click()
  focusGamepadTarget(next)
  return true
}

export function stepRangeValue(
  value: number,
  min: number,
  max: number,
  step: number,
  delta: -1 | 1
): number {
  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : safeMin
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1
  const base = Number.isFinite(value) ? Math.min(safeMax, Math.max(safeMin, value)) : safeMin
  const next = Math.min(safeMax, Math.max(safeMin, base + safeStep * delta))
  return Number(next.toFixed(6))
}

export function adjustRangeInput(input: HTMLInputElement, delta: -1 | 1): boolean {
  if (input.type !== 'range') return false
  const current = Number(input.value)
  const next = stepRangeValue(
    current,
    Number(input.min || '0'),
    Number(input.max || '100'),
    Number(input.step || '1'),
    delta
  )
  if (next === current) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, String(next))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function nextEnabledOptionIndex(
  options: Array<{ disabled?: boolean }>,
  current: number,
  delta: -1 | 1
): number {
  if (!options.length) return -1
  for (let step = 1; step <= options.length; step += 1) {
    const index = (current + delta * step + options.length * 2) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

export function cycleSelectOption(select: HTMLSelectElement, delta: -1 | 1): boolean {
  const options = [...select.options]
  if (options.length < 2) return false
  const current = select.selectedIndex >= 0 ? select.selectedIndex : delta > 0 ? -1 : options.length
  const index = nextEnabledOptionIndex(options, current, delta)
  if (index < 0 || index === select.selectedIndex) return false
  select.selectedIndex = index
  select.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function initialGamepadTarget(): HTMLElement | null {
  const dialog = activeGamepadDialog()
  if (dialog) {
    const body = dialog.querySelector<HTMLElement>('.modal__body')
    return (
      (body ? gamepadFocusables(body)[0] : null) ||
      gamepadFocusables(dialog)[0] ||
      null
    )
  }
  const preferred =
    document.querySelector<HTMLElement>('.app-nav__tab.is-active') ||
    document.querySelector<HTMLElement>('.app-nav__tab') ||
    document.querySelector<HTMLElement>('.hero-play__actions button')
  return preferred || gamepadFocusables(document.querySelector('.main-scroll'))[0] || null
}

function focusAdjacentTab(current: HTMLElement, direction: GamepadDirection): boolean {
  if (direction !== 'left' && direction !== 'right') return false
  const tablist = current.closest<HTMLElement>(TABLIST)
  if (!tablist) return false
  const tabs = gamepadTabs(tablist)
  const index = tabs.indexOf(current)
  if (index < 0 || tabs.length < 2) return false
  const next = tabs[(index + (direction === 'right' ? 1 : -1) + tabs.length) % tabs.length]
  focusGamepadTarget(next)
  return true
}

function isTextInput(element: HTMLElement | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(
    element.type
  )
}

function scrollContainer(): HTMLElement | null {
  const dialog = activeGamepadDialog()
  if (dialog) {
    return dialog.querySelector<HTMLElement>('.modal__body') || dialog
  }
  return document.getElementById('main-content') || document.scrollingElement as HTMLElement | null
}

export function useGamepad({
  onBack,
  onTabSwitch,
  onPageSwitch
}: {
  onBack?: () => void
  onTabSwitch?: (delta: -1 | 1) => void
  onPageSwitch?: (delta: -1 | 1) => void
} = {}): { connected: boolean; count: number } {
  const [connected, setConnected] = useState(false)
  const [count, setCount] = useState(0)
  const onBackRef = useRef(onBack)
  const onTabSwitchRef = useRef(onTabSwitch)
  const onPageSwitchRef = useRef(onPageSwitch)
  onBackRef.current = onBack
  onTabSwitchRef.current = onTabSwitch
  onPageSwitchRef.current = onPageSwitch
  const previous = useRef(new Map<number, boolean[]>())
  const holdState = useRef(new Map<string, { started: number; last: number }>())
  const frame = useRef(0)

  useEffect(() => {
    let connectedNow = false
    let trackedDialog: HTMLElement | null = null
    let restoreFocus: HTMLElement | null = null
    let activationTarget: HTMLElement | null = null
    let activationAt = 0

    const syncDialog = (): void => {
      const dialog = activeGamepadDialog()
      if (dialog) {
        if (dialog !== trackedDialog) {
          trackedDialog = dialog
          const active = document.activeElement
          const freshActivation =
            activationTarget?.isConnected &&
            performance.now() - activationAt < 2000 &&
            !dialog.contains(activationTarget)
              ? activationTarget
              : null
          restoreFocus =
            freshActivation ||
            (active instanceof HTMLElement && !dialog.contains(active) ? active : null)
          activationTarget = null
          if (connectedNow) focusGamepadTarget(initialGamepadTarget())
          return
        }
        if (!dialog.contains(document.activeElement)) {
          if (connectedNow) focusGamepadTarget(initialGamepadTarget())
        }
        return
      }
      if (trackedDialog) {
        trackedDialog = null
        const target =
          restoreFocus?.isConnected
            ? restoreFocus
            : document.querySelector<HTMLElement>('.app-nav__tab.is-active')
        restoreFocus = null
        if (connectedNow) focusGamepadTarget(target)
      }
    }

    const refresh = (): void => {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
      connectedNow = pads.length > 0
      setCount(pads.length)
      setConnected(connectedNow)
      if (pads.length > 0) {
        if (!document.querySelector(`.${GAMEPAD_FOCUS_CLASS}`)) {
          focusGamepadTarget(initialGamepadTarget())
        }
        syncDialog()
      } else {
        clearGamepadFocus()
        holdState.current.clear()
      }
    }
    const onConnected = (): void => refresh()
    const onDisconnected = (): void => refresh()
    const onPointerDown = (): void => clearGamepadFocus()
    const onKeyboard = (event: KeyboardEvent): void => {
      // B dispatches a synthetic Escape to close the topmost dialog. That
      // keyboard event must not clear the controller focus ring as if a real
      // keyboard had taken over.
      if (!event.isTrusted) return
      clearGamepadFocus()
    }
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyboard)
    refresh()

    const observer = new MutationObserver(() => syncDialog())
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
      const dialog = activeGamepadDialog()
      const active = document.activeElement as HTMLElement | null
      if (active instanceof HTMLInputElement && active.type === 'range' && (direction === 'left' || direction === 'right')) {
        if (adjustRangeInput(active, direction === 'right' ? 1 : -1)) return
      }
      if (active instanceof HTMLSelectElement && (direction === 'left' || direction === 'right')) {
        if (cycleSelectOption(active, direction === 'right' ? 1 : -1)) return
      }
      if (active && focusAdjacentTab(active, direction)) return
      const focusables = gamepadFocusables(dialog || document)
      if (!focusables.length) return
      const target = spatialGamepadFocus(focusables, active, direction)
      if (target) focusGamepadTarget(target)
    }

    const activate = (): void => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return
      if (active instanceof HTMLInputElement && active.type === 'range') {
        adjustRangeInput(active, 1)
        return
      }
      if (active instanceof HTMLSelectElement) {
        cycleSelectOption(active, 1)
        return
      }
      if (isTextInput(active)) {
        active.focus()
        return
      }
      activationTarget = active
      activationAt = performance.now()
      active.click()
    }

    const tick = (): void => {
      frame.current = window.requestAnimationFrame(tick)
      if (trackedDialog || document.querySelector('[role="dialog"]')) syncDialog()
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []
      for (const pad of pads) {
        if (!pad) continue
        const buttons = (pad.buttons || []).map(
          (button) => button.pressed || button.value > 0.5
        )
        const before = previous.current.get(pad.index) || []
        const pressed = (index: number): boolean =>
          Boolean(buttons[index]) && !before[index]
        const dialog = activeGamepadDialog()

        let dx = 0
        let dy = 0
        if (buttons[14]) dx -= 1
        if (buttons[15]) dx += 1
        if (buttons[12]) dy -= 1
        if (buttons[13]) dy += 1
        const axes = pad.axes || []
        if (!dx && !dy) {
          const axisX = axes[0] || 0
          const axisY = axes[1] || 0
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
          if (dialog || document.querySelector('[role="dialog"]')) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true
              })
            )
          } else {
            onBackRef.current?.()
          }
        }
        if (!dialog && pressed(4)) {
          if (!cycleGamepadTab(document, -1)) onTabSwitchRef.current?.(-1)
        }
        if (!dialog && pressed(5)) {
          if (!cycleGamepadTab(document, 1)) onTabSwitchRef.current?.(1)
        }
        if (dialog && pressed(4)) cycleGamepadTab(dialog, -1)
        if (dialog && pressed(5)) cycleGamepadTab(dialog, 1)
        if (!dialog && pressed(6)) onPageSwitchRef.current?.(-1)
        if (!dialog && pressed(7)) onPageSwitchRef.current?.(1)
        if (pressed(9)) focusGamepadTarget(initialGamepadTarget())

        // Right stick scrolls the active reading surface. D-pad focus is still
        // the primary navigation; this only makes long pages comfortable.
        const scrollX = axes[2] || 0
        const scrollY = axes[3] || 0
        if (
          Math.abs(scrollX) > SCROLL_AXIS_THRESHOLD ||
          Math.abs(scrollY) > SCROLL_AXIS_THRESHOLD
        ) {
          scrollContainer()?.scrollBy({
            left: scrollX * 14,
            top: scrollY * 14,
            behavior: 'auto'
          })
        }
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
