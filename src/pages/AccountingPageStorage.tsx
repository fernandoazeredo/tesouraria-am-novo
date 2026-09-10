import { useEffect, useMemo, useState } from 'react'
import { BadgeDollarSign, Calculator, CheckCircle2, Download, FileArchive, FileSpreadsheet, Landmark, Paperclip, ReceiptText, Send, Upload } from 'lucide-react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'
import { deleteObject, getBytes, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import { createZip } from '../lib/simpleZip'
import { createXlsx, type XlsxSheet } from '../lib/simpleXlsx'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTimeBR = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
type AnyRecord = { id: string } & DocumentData
type BusyAction = '' | 'download' | 'send' | 'statement'
type Attachment = { name?: string; path?: string; url?: string; size?: number; type?: string }

function useLiveCollection(name: string) {
  const [records, setRecords] = useState<AnyRecord[]>([])
  useEffect(() => onSnapshot(collection(db, name), (snapshot) => setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [name])
  return records
}

function toNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0 }
function timestampToDateTime(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') return dateTimeBR.format((value as { toDate: () => Date }).toDate())
  return '—'
}
function safeName(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'arquivo' }
function toBlob(bytes: Uint8Array) { const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); return new Blob([buffer], { type: 'application/zip' }) }
function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }
function attachmentsOf(item: AnyRecord): Attachment[] { return Array.isArray(item.attachments) ? item.attachments as Attachment[] : [] }
function statusLabel(value: string) {
  const labels: Record<string, string> = { aprovado: 'Aprovado', pago: 'Pago', arquivado: 'Arquivado', recebido_tesouraria: 'Recebido pela Tesouraria', encerrado: 'Encerrado / Arquivado' }
  return labels[value] ?? value
}

async function bytesFromAttachment(file: Attachment) {
  if (file.path) return new Uint8Array(await getBytes(storageRef(storage, file.path)))
  if (file.url) return new Uint8Array(await (await fetch(file.url)).arrayBuffer())
  throw new Error(`Documento sem referência de Storage: ${file.name || 'arquivo'}`)
}

export function AccountingPageStorage() {
  const { profile } = useAuth()
  const expenses = useLiveCollection('expenses')
  const receivables = useLiveCollection('receivables')
  const dispatches = useLiveCollection('accountingDispatches')
  const statements = useLiveCollection('bankStatements')
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7))
  const [unit, setUnit] = useState('Todas')
  const [movement, setMovement] = useState('Despesas + Recebimentos')
  const [busy, setBusy] = useState<BusyAction>('')
  const [message, setMessage] = useState('')

  const approvedExpenses = useMemo(() => expenses.filter((item) => ['aprovado', 'pago', 'arquivado'].includes(String(item.status)) && item.competencia === competence && (unit === 'Todas' || item.unidade === unit)), [expenses, competence, unit])
  const finishedReceivables = useMemo(() => receivables.filter((item) => ['recebido_tesouraria', 'encerrado'].includes(String(item.status)) && String(item.data ?? '').slice(0, 7) === competence && (unit === 'Todas' || item.unidade === unit)), [receivables, competence, unit])
  const includeExpenses = movement !== 'Somente Recebimentos'
  const includeReceivables = movement !== 'Somente Despesas'
  const selectedExpenses = includeExpenses ? approvedExpenses : []
  const selectedReceivables = includeReceivables ? finishedReceivables : []
  const expenseCount = selectedExpenses.length
  const receivableCount = selectedReceivables.length
  const expenseTotal = selectedExpenses.reduce((sum, item) => sum + toNumber(item.valorTotal), 0)
  const revenueTotal = selectedReceivables.reduce((sum, item) => sum + toNumber(item.valorAlvara), 0)
  const totalEntries = expenseCount + receivableCount
  const orderedDispatches = [...dispatches].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
  const statementId = `${competence}__${unit}`
  const statement = statements.find((item) => item.id === statementId) ?? null
  const documentCount = [...selectedExpenses, ...selectedReceivables].reduce((sum, item) => sum + attachmentsOf(item).length, 0)
  const missingDocs = [...selectedExpenses.map((item) => ({ type: 'Despesa', item })), ...selectedReceivables.map((item) => ({ type: 'Receita', item }))].filter(({ item }) => attachmentsOf(item).length === 0)

  async function audit(action: string, detail: string, entityId?: string) {
    if (!profile) return
    await addDoc(collection(db, 'auditLogs'), { action, module: 'Contabilidade', detail, entityId: entityId ?? null, userId: profile.uid, userName: profile.displayName, userEmail: profile.email, createdAt: serverTimestamp() })
  }

  async function uploadStatement(file: File) {
    if (!profile || file.size > 30 * 1024 * 1024) { if (file.size > 30 * 1024 * 1024) setMessage('O extrato ultrapassa o limite de 30 MB.'); return }
    setBusy('statement'); setMessage('')
    try {
      if (statement?.storagePath) { try { await deleteObject(storageRef(storage, String(statement.storagePath))) } catch {} }
      const path = `extratos-bancarios/${competence}/${safeName(unit)}/${Date.now()}-${safeName(file.name)}`
      const target = storageRef(storage, path)
      await uploadBytes(target, file, { contentType: file.type || 'application/octet-stream' })
      const downloadUrl = await getDownloadURL(target)
      await setDoc(doc(db, 'bankStatements', statementId), { competence, unit, fileName: file.name, storagePath: path, downloadUrl, size: file.size, type: file.type || 'application/octet-stream', uploadedBy: profile.uid, uploadedByName: profile.displayName, uploadedByEmail: profile.email, uploadedAt: serverTimestamp() })
      await audit('Extrato bancário consolidado anexado', `${competence} · ${unit} · ${file.name}`, statementId)
      setMessage('Extrato consolidado anexado com sucesso. Ele será incluído automaticamente no ZIP da Contabilidade.')
    } catch (error) {
      console.error(error)
      setMessage('Não foi possível enviar o extrato consolidado.')
    } finally { setBusy('') }
  }

  function workbookSheets(): XlsxSheet[] {
    const summaryRows = [
      ['TESOURARIA AM NOVO'],
      ['Movimento mensal para Contabilidade'],
      ['Competência', competence], ['Unidade', unit], ['Movimento', movement],
      ['Despesas aptas', expenseCount], ['Total despesas', expenseTotal], ['Receitas aptas', receivableCount], ['Total receitas', revenueTotal],
      ['Documentos anexados', documentCount], ['Lançamentos sem documento', missingDocs.length], ['Extrato consolidado', statement?.fileName || 'NÃO ANEXADO'],
      ['Gerado por', profile?.displayName || profile?.email || 'Usuário'], ['Gerado em', dateTimeBR.format(new Date())],
    ]
    const expenseRows: (string | number)[][] = [['Competência', 'Unidade', 'Responsável', 'Fornecedor/Favorecido', 'CPF/CNPJ', 'Plano de Contas', 'Descrição da Conta', 'DRE', 'Status', 'Valor', 'Documentos']]
    for (const item of selectedExpenses) expenseRows.push([item.competencia ?? '', item.unidade ?? '', item.nome ?? '', item.fornecedor ?? '', item.documento ?? '', item.expenseAccountCode ?? item.classificacaoContabil ?? '', item.expenseAccountName ?? '', item.expenseAccountDre ?? '', statusLabel(String(item.status ?? '')), toNumber(item.valorTotal), attachmentsOf(item).length])
    const revenueRows: (string | number)[][] = [['Data', 'Unidade', 'Processo', 'Reclamante', 'Reclamada', 'Origem', 'Plano de Contas', 'Descrição da Conta', 'DRE', 'Status', 'Valor do Alvará', 'Líquido Cliente', 'Documentos']]
    for (const item of selectedReceivables) revenueRows.push([item.data ?? '', item.unidade ?? '', item.processo ?? '', item.reclamante ?? '', item.reclamada ?? '', item.origem ?? '', item.revenueAccountCode ?? item.classificacaoContabil ?? '', item.revenueAccountName ?? '', item.revenueAccountDre ?? '', statusLabel(String(item.status ?? '')), toNumber(item.valorAlvara), toNumber(item.valorLiquidoCliente), attachmentsOf(item).length])
    const documentRows: (string | number)[][] = [['Tipo', 'Referência', 'Arquivo', 'Tamanho (bytes)']]
    selectedExpenses.forEach((item) => attachmentsOf(item).forEach((file) => documentRows.push(['Despesa', `${item.nome ?? ''} · ${item.fornecedor ?? ''}`, file.name ?? 'Documento', toNumber(file.size)])))
    selectedReceivables.forEach((item) => attachmentsOf(item).forEach((file) => documentRows.push(['Receita', `${item.processo ?? ''} · ${item.reclamante ?? ''}`, file.name ?? 'Documento', toNumber(file.size)])))
    const pendingRows: (string | number)[][] = [['Tipo', 'Referência', 'Valor', 'Pendência']]
    missingDocs.forEach(({ type, item }) => pendingRows.push([type, type === 'Despesa' ? `${item.nome ?? ''} · ${item.fornecedor ?? ''}` : `${item.processo ?? ''} · ${item.reclamante ?? ''}`, type === 'Despesa' ? toNumber(item.valorTotal) : toNumber(item.valorAlvara), 'Sem documento anexado']))
    if (!statement) pendingRows.push(['Extrato bancário', competence, 0, 'Extrato consolidado não anexado'])
    return [
      { name: 'Resumo', rows: summaryRows as (string | number)[][], currencyColumns: [1] },
      { name: 'Despesas', rows: expenseRows, currencyColumns: [9] },
      { name: 'Receitas', rows: revenueRows, currencyColumns: [10, 11] },
      { name: 'Documentos', rows: documentRows },
      { name: 'Pendencias', rows: pendingRows, currencyColumns: [2] },
    ]
  }

  async function buildPackage() {
    if (totalEntries === 0) throw new Error('Nenhum lançamento apto foi encontrado para a competência e filtros selecionados.')
    if (!statement?.storagePath) throw new Error('Anexe o extrato consolidado do banco antes de gerar o ZIP para a Contabilidade.')
    setMessage('Montando planilha Excel e incorporando documentos ao ZIP...')

    const workbook = createXlsx(workbookSheets())
    const entries: Array<{ name: string; content: string | Uint8Array }> = [
      { name: `Movimento_Contabilidade_${competence}_${safeName(unit)}.xlsx`, content: workbook },
    ]

    const statementBytes = new Uint8Array(await getBytes(storageRef(storage, String(statement.storagePath))))
    entries.push({ name: `Extrato_Bancario/${safeName(String(statement.fileName ?? 'Extrato_Consolidado'))}`, content: statementBytes })

    for (let index = 0; index < selectedExpenses.length; index += 1) {
      const item = selectedExpenses[index]
      for (const file of attachmentsOf(item)) {
        try {
          const bytes = await bytesFromAttachment(file)
          entries.push({ name: `Documentos_Despesas/${String(index + 1).padStart(3, '0')}_${safeName(String(item.fornecedor || item.nome || item.id))}/${safeName(file.name || 'documento')}`, content: bytes })
        } catch (error) { console.warn('Documento de despesa não incluído:', file, error) }
      }
    }
    for (let index = 0; index < selectedReceivables.length; index += 1) {
      const item = selectedReceivables[index]
      for (const file of attachmentsOf(item)) {
        try {
          const bytes = await bytesFromAttachment(file)
          entries.push({ name: `Documentos_Receitas/${String(index + 1).padStart(3, '0')}_${safeName(String(item.processo || item.reclamante || item.id))}/${safeName(file.name || 'documento')}`, content: bytes })
        } catch (error) { console.warn('Documento de receita não incluído:', file, error) }
      }
    }

    const bytes = createZip(entries)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return { blob: toBlob(bytes), fileName: `Contabilidade_${competence}_${safeName(unit)}_${stamp}.zip` }
  }

  async function downloadPackage() {
    setBusy('download'); setMessage('')
    try {
      const { blob, fileName } = await buildPackage()
      downloadBlob(blob, fileName)
      await audit('Pacote completo da Contabilidade baixado', `${competence} · ${unit} · ${expenseCount} despesa(s) · ${receivableCount} receita(s) · ${documentCount} documento(s)`)
      setMessage(`ZIP completo gerado: ${fileName}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o ZIP.') } finally { setBusy('') }
  }

  async function sendMovement() {
    if (totalEntries === 0) { setMessage('Nenhum lançamento apto foi encontrado.'); return }
    if (!window.confirm(`Registrar o movimento ${competence} como enviado à Contabilidade?`)) return
    setBusy('send'); setMessage('')
    try {
      const ref = await addDoc(collection(db, 'accountingDispatches'), { competence, unit, movement, expenseCount, receivableCount, expenseTotal, revenueTotal, documentCount, bankStatement: statement?.fileName ?? null, status: 'enviado', sentBy: profile?.uid, sentByName: profile?.displayName, sentByEmail: profile?.email, createdAt: serverTimestamp() })
      await audit('Movimento registrado como enviado à Contabilidade', `${competence} · ${expenseCount} despesa(s) · ${receivableCount} receita(s)`, ref.id)
      setMessage('Movimento registrado com sucesso no histórico.')
    } catch (error) { console.error(error); setMessage('Não foi possível registrar o envio.') } finally { setBusy('') }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">Fechamento mensal</span><h1>Contabilidade</h1><p>Geração do pacote mensal com planilha Excel, extrato consolidado do banco e documentos comprobatórios.</p></div></div>
    <section className="page-card accounting-panel">
      <div className="accounting-config"><label><span>Competência</span><input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} /></label><label><span>Unidade</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>Todas</option><option>RJ</option><option>SP</option></select></label><label><span>Movimento</span><select value={movement} onChange={(e) => setMovement(e.target.value)}><option>Despesas + Recebimentos</option><option>Somente Despesas</option><option>Somente Recebimentos</option></select></label></div>
      <div className="readiness-grid"><article><ReceiptText /><span>Despesas aptas</span><strong>{expenseCount}</strong><small>{money.format(expenseTotal)}</small></article><article><BadgeDollarSign /><span>Receitas aptas</span><strong>{receivableCount}</strong><small>{money.format(revenueTotal)}</small></article><article><Paperclip /><span>Documentos</span><strong>{documentCount}</strong><small>{missingDocs.length} lançamento(s) sem anexo</small></article><article className={statement ? 'storage-ready-card' : ''}><Landmark /><span>Extrato bancário</span><strong>{statement ? 'Anexado' : 'Pendente'}</strong><small>{statement?.fileName || 'Consolidado do mês'}</small></article></div>

      <div className="bank-statement-box"><div><Landmark size={21} /><div><strong>Extrato consolidado do banco</strong><span>Obrigatório para gerar o pacote mensal. Aceita PDF, OFX, CSV e Excel.</span>{statement && <small><CheckCircle2 size={13} /> {statement.fileName}</small>}</div></div><label className="secondary-button accounting-file-button"><Upload size={17} /> {busy === 'statement' ? 'Enviando...' : statement ? 'Substituir extrato' : 'Anexar extrato'}<input type="file" hidden accept=".pdf,.ofx,.csv,.xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadStatement(file); e.currentTarget.value = '' }} /></label></div>

      <div className="storage-ready-box"><FileSpreadsheet size={18} /><span><strong>Pacote para a Contabilidade:</strong> 1 planilha Excel com abas Resumo, Despesas, Receitas, Documentos e Pendências + extrato bancário + todos os anexos disponíveis.</span></div>
      {message && <div className={`accounting-feedback ${message.includes('sucesso') || message.includes('gerado') || message.includes('anexado') ? 'success' : 'warning'}`} role="status">{message}</div>}
      <div className="accounting-actions"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void downloadPackage()}><Download size={17} /> {busy === 'download' ? 'Montando ZIP...' : 'Baixar ZIP completo'}</button><button className="revenue-button" type="button" disabled={Boolean(busy)} onClick={() => void sendMovement()}><Calculator size={17} /> {busy === 'send' ? 'Registrando...' : 'Registrar envio à Contabilidade'}</button></div>
    </section>

    <section className="page-card accounting-history-card"><div className="card-title-row"><div><h2>Histórico de envios para a Contabilidade</h2><p>Cada confirmação fica registrada com competência, usuário e totais.</p></div><span className="status-badge revenue">{orderedDispatches.length} envio(s)</span></div>{orderedDispatches.length === 0 ? <div className="module-empty"><Send size={34} /><strong>Nenhum envio registrado</strong></div> : <div className="accounting-history-list">{orderedDispatches.map((item) => <article key={item.id}><div><strong>{item.competence || '—'} · {item.unit || 'Todas'}</strong><span>{item.movement || 'Movimento mensal'}</span><small>{item.sentByName || item.sentByEmail || 'Usuário'} · {timestampToDateTime(item.createdAt)}</small></div><div className="history-totals"><span>{toNumber(item.expenseCount)} despesa(s) · {money.format(toNumber(item.expenseTotal))}</span><span>{toNumber(item.receivableCount)} receita(s) · {money.format(toNumber(item.revenueTotal))}</span></div><span className="status-badge success">Enviado</span></article>)}</div>}</section>
  </>
}