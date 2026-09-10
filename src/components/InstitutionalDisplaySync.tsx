import { useEffect } from 'react'
import { useInstitutionalSettings } from '../hooks/useInstitutionalSettings'

export function InstitutionalDisplaySync() {
  const institutional = useInstitutionalSettings()

  useEffect(() => {
    function applyToVisibleForms() {
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('.legacy-title-block strong'))
      for (const block of blocks) {
        const current = block.textContent?.trim() ?? ''
        if (
          current.includes('TESOURARIA AM NOVO') ||
          current.includes('TESOURARIA AM NOVO') ||
          current.includes('TESOURARIA AM NOVO')
        ) {
          block.textContent = institutional.razaoSocial
        }
      }
    }

    applyToVisibleForms()

    // Os modais são portais adicionados diretamente ao body. Observamos apenas
    // filhos diretos do body, sem subtree/attributes/texto, para evitar o ciclo
    // que anteriormente travou a navegação.
    const observer = new MutationObserver(() => window.requestAnimationFrame(applyToVisibleForms))
    observer.observe(document.body, { childList: true })

    return () => observer.disconnect()
  }, [institutional.razaoSocial])

  return null
}
