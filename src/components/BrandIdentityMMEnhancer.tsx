import { useEffect } from 'react'

const NEW_LOGO = '/logo-am.svg'

export function BrandIdentityMMEnhancer() {
  useEffect(() => {
    function applyBrandImages() {
      document.title = 'TESOURARIA AM NOVO | Controle de Despesas e Receitas'

      const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
      for (const image of images) {
        const src = image.getAttribute('src') ?? ''
        const isBrandImage = src.includes('logo-fm') || src.includes('logo-mm') || src.includes('logo-am') || Boolean(image.closest('.auth-brand-panel, .brand-logo-only, .mobile-header-brand'))
        if (!isBrandImage) continue

        if (src !== NEW_LOGO) image.setAttribute('src', NEW_LOGO)
        if (image.alt !== 'AM') image.alt = 'AM'
      }
    }

    applyBrandImages()

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(applyBrandImages)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return null
}
