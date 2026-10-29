(() => {
  const header = document.querySelector('[data-header]')
  const toggle = document.querySelector('[data-menu-toggle]')
  const nav = document.getElementById('site-nav')
  const body = document.body

  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear())
  })

  const setMenu = (open) => {
    if (!toggle || !nav) return
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单')
    nav.classList.toggle('is-open', open)
    body.classList.toggle('menu-open', open)
  }

  toggle?.addEventListener('click', () => {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true')
  })

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false))
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false)
  })

  document.addEventListener('click', (event) => {
    if (!nav?.classList.contains('is-open')) return
    if (!nav.contains(event.target) && !toggle?.contains(event.target)) setMenu(false)
  })

  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 12)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const revealNodes = document.querySelectorAll('.reveal')
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealNodes.forEach((node) => node.classList.add('is-visible'))
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const delay = Number(entry.target.getAttribute('data-delay') || 0)
          window.setTimeout(() => entry.target.classList.add('is-visible'), delay)
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    )
    revealNodes.forEach((node) => observer.observe(node))
  }

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || ''
      const original = button.textContent
      try {
        await copyText(value)
        button.textContent = '已复制'
      } catch {
        button.textContent = '复制失败'
      }
      window.setTimeout(() => {
        button.textContent = original
      }, 1800)
    })
  })
})()
