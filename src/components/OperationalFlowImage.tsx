export function OperationalFlowImage() {
  const src = '/fluxo-operacional.webp'

  return (
    <section className="page-card" style={{ marginTop: 24, padding: 12 }}>
      <img
        src={src}
        alt="Fluxo Operacional do Aplicativo"
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 14, cursor: 'zoom-in' }}
        onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
      />
    </section>
  )
}
