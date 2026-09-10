import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type InstitutionalSettings = {
  razaoSocial: string
  cnpj: string
  endereco: string
}

export const DEFAULT_INSTITUTIONAL_SETTINGS: InstitutionalSettings = {
  razaoSocial: 'TESOURARIA AM NOVO',
  cnpj: '',
  endereco: '',
}

export function useInstitutionalSettings() {
  const [settings, setSettings] = useState<InstitutionalSettings>(DEFAULT_INSTITUTIONAL_SETTINGS)

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'appConfig', 'institutional'), (snapshot) => {
      if (!snapshot.exists()) {
        setSettings(DEFAULT_INSTITUTIONAL_SETTINGS)
        return
      }
      const data = snapshot.data()
      setSettings({
        razaoSocial: String(data.razaoSocial || DEFAULT_INSTITUTIONAL_SETTINGS.razaoSocial),
        cnpj: String(data.cnpj || DEFAULT_INSTITUTIONAL_SETTINGS.cnpj),
        endereco: String(data.endereco || DEFAULT_INSTITUTIONAL_SETTINGS.endereco),
      })
    }, () => setSettings(DEFAULT_INSTITUTIONAL_SETTINGS))

    return unsubscribe
  }, [])

  return settings
}
