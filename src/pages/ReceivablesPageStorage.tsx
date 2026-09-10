import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { BadgeDollarSign, CheckCircle2, ExternalLink, FileText, Paperclip, Plus, RefreshCw, Search, Send, Upload, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import { AccountSelector } from '../components/AccountSelector'
import { WorkflowStatusBadge } from '../components/WorkflowStatusBadge'
import type { ChartOfAccount } from '../data/chartOfAccounts'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
type AnyRecord = { id: string } & DocumentData
type RevenueComponent = { nome: string; percentual: number; valor: number }
type AttachmentMeta = { name: string; url: string; path: string; size: number; type: string; uploadedAt: string; uploadedBy: string }
type UploadItem = { id: string; name: string; size: number; progress: number; status: 'uploading' | 'success' | 'error'; meta?: AttachmentMeta; error?: string }

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho', enviado_tesouraria: 'Enviado à Tesouraria', recebido_tesouraria: 'Recebido pela Tesouraria', devolvido: 'Devolvido para Correção', encerrado: 'Encerrado / Arquivado',
}

function safeFileName(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'arquivo' }
function toNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0 }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` }
function attachmentsOf(item: AnyRecord): AttachmentMeta[] { return Array.isArray(item.attachments) ? item.attachments as AttachmentMeta[] : [] }

function useReceivables() {
  const [records, setRecords] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => onSnapshot(collection(db, 'receivables'), (snapshot) => {
    setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    setLoading(false)
  }, () => setLoading(false)), [])
  return { records, loading }
}

async function audit(profile: ReturnType<typeof useAuth>['profile'], action: string, detail: string, entityId: string) {
  if (!profile) return
  await addDoc(collection(db, 'auditLogs'), { action, module: 'Recebimento de Alvarás', detail, entityId, userId: profile.uid, userName: profile.displayName, userEmail: profile.email, createdAt: serverTimestamp() })
}

function ReceivableModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const [recordRef] = useState(() => doc(collection(db, 'receivables')))
  const tasks = useRef<Record<string, UploadTask>>({})
  const [busy, setBusy] = useState(false)
  const [unidade, setUnidade] = useState<'RJ' | 'SP'>('RJ')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [natureza, setNatureza] = useState('Trabalhista')
  const [processo, setProcesso] = useState('')
  const [reclamada, setReclamada] = useState('')
  const [reclamante, setReclamante] = useState('')
  const [origem, setOrigem] = useState('Alvará')
  const [formaRecebimento, setFormaRecebimento] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [account, setAccount] = useState<ChartOfAccount | null>(null)
  const [totalAlvara, setTotalAlvara] = useState(0)
  const [baseCalculo, setBaseCalculo] = useState(0)
  const [banco, setBanco] = useState('')
  const [agencia, setAgencia] = useState('')
  const [conta, setConta] = useState('')
  const [titular, setTitular] = useState('')
  const [cpf, setCpf] = useState('')
  const [emailNf, setEmailNf] = useState('')
  const [enderecoNf, setEnderecoNf] = useState('')
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [components, setComponents] = useState<RevenueComponent[]>([
    { nome: 'Imposto de Renda', percentual: 0, valor: 0 },
    { nome: 'INSS', percentual: 0, valor: 0 },
    { nome: 'INSS Empregador', percentual: 0, valor: 0 },
    { nome: 'Honorários do Escritório', percentual: 0, valor: 0 },
    { nome: 'Honorários Perito', percentual: 0, valor: 0 },
    { nome: 'Ressarcimento de Custas', percentual: 0, valor: 0 },
    { nome: 'Despesas Bancárias / Tarifas', percentual: 0, valor: 0 },
    { nome: 'Outras Deduções / Participações', percentual: 0, valor: 0 },
  ])
  const totalDeducoes = useMemo(() => components.reduce((sum, component) => sum + toNumber(component.valor), 0), [components])
  const liquidoCliente = useMemo(() => Math.max(0, Number((totalAlvara - totalDeducoes).toFixed(2))), [totalAlvara, totalDeducoes])
  const uploading = uploads.some((item) => item.status === 'uploading')
  const uploaded = uploads.flatMap((item) => item.meta ? [item.meta] : [])

  function updatePercent(index: number, percentual: number) { setComponents((current) => current.map((item, i) => i === index ? { ...item, percentual, valor: totalAlvara > 0 ? Number(((totalAlvara * percentual) / 100).toFixed(2)) : 0 } : item)) }
  function updateValue(index: number, valor: number) { setComponents((current) => current.map((item, i) => i === index ? { ...item, valor, percentual: totalAlvara > 0 ? Number(((valor / totalAlvara) * 100).toFixed(4)) : 0 } : item)) }
  function changeTotal(value: number) {
    const previous = totalAlvara
    setTotalAlvara(value)
    setBaseCalculo((current) => current === 0 || current === previous ? value : current)
    setComponents((current) => current.map((item) => ({ ...item, valor: value > 0 ? Number(((value * item.percentual) / 100).toFixed(2)) : 0 })))
  }

  function selectFiles(files: FileList | null) {
    if (!profile?.uid || !files?.length) return
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { window.alert(`${file.name} ultrapassa 20 MB.`); continue }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const path = `recebimentos/${profile.uid}/${recordRef.id}/${Date.now()}-${safeFileName(file.name)}`
      const target = storageRef(storage, path)
      const task = uploadBytesResumable(target, file, { contentType: file.type || 'application/octet-stream' })
      tasks.current[id] = task
      setUploads((current) => [...current, { id, name: file.name, size: file.size, progress: 0, status: 'uploading' }])
      task.on('state_changed', (snapshot) => {
        const progress = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0
        setUploads((current) => current.map((item) => item.id === id ? { ...item, progress } : item))
      }, (error) => {
        setUploads((current) => current.map((item) => item.id === id ? { ...item, status: 'error', error: error.message } : item))
      }, async () => {
        const url = await getDownloadURL(target)
        const meta: AttachmentMeta = { name: file.name, url, path, size: file.size, type: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString(), uploadedBy: profile.uid }
        setUploads((current) => current.map((item) => item.id === id ? { ...item, status: 'success', progress: 100, meta } : item))
        delete tasks.current[id]
      })
    }
  }

  async function removeUpload(item: UploadItem) {
    tasks.current[item.id]?.cancel()
    delete tasks.current[item.id]
    if (item.meta?.path) { try { await deleteObject(storageRef(storage, item.meta.path)) } catch {} }
    setUploads((current) => current.filter((row) => row.id !== item.id))
  }

  async function closeAndClean() {
    for (const task of Object.values(tasks.current)) task.cancel()
    for (const item of uploads) if (item.meta?.path) { try { await deleteObject(storageRef(storage, item.meta.path)) } catch {} }
    onClose()
  }

  async function save(status: 'rascunho' | 'enviado_tesouraria') {
    if (uploading) { window.alert('Aguarde o término do envio dos documentos.'); return }
    if (!processo.trim() || !reclamante.trim() || totalAlvara <= 0) { window.alert('Preencha número do processo, reclamante e valor líquido do alvará.'); return }
    setBusy(true)
    try {
      await setDoc(recordRef, {
        unidade, data, natureza, processo: processo.trim(), reclamada: reclamada.trim(), reclamante: reclamante.trim(), origem,
        formaRecebimento: formaRecebimento.trim(), dataPrevista,
        categoriaReceita: account ? `${account.code} - ${account.name}` : '', classificacaoContabil: account?.code ?? null,
        revenueAccountCode: account?.code ?? null, revenueAccountName: account?.name ?? null, revenueAccountDre: account?.dre ?? null,
        planoConta: account ? { code: account.code, name: account.name, dre: account.dre, category: 'Receita' } : null,
        valorAlvara: totalAlvara, baseCalculo, valorLiquidoCliente: liquidoCliente, totalDeducoes, components,
        banco, agencia, conta, titular, cpf, emailNf, enderecoNf, status,
        attachments: uploaded, attachmentCount: uploaded.length, storageStatus: 'active',
        createdBy: profile?.uid, createdByName: profile?.displayName, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      await audit(profile, status === 'rascunho' ? 'Receita salva como rascunho' : 'Receita enviada à Tesouraria', `Processo ${processo} — ${money.format(totalAlvara)} · ${uploaded.length} anexo(s)`, recordRef.id)
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar a receita.')
    } finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><section className="modal-sheet legacy-sheet revenue-sheet">
    <div className="modal-toolbar"><div><span className="eyebrow revenue-text">Recebimento de Alvarás</span><h2>Demonstrativo de Recebimento de Honorários</h2></div><button className="icon-button" onClick={() => void closeAndClean()}><X size={20} /></button></div>
    <div className="legacy-title-block revenue-title"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE RECEBIMENTO DE HONORÁRIOS</span></div>
    <h3 className="form-section-title">Dados do Processo</h3>
    <div className="form-grid compact-grid"><label><span>Unidade</span><select value={unidade} onChange={(e) => setUnidade(e.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label><label><span>Data</span><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label><label><span>Natureza</span><select value={natureza} onChange={(e) => setNatureza(e.target.value)}><option>Trabalhista</option><option>Cível</option></select></label><label className="span-2"><span>Número do processo</span><input value={processo} onChange={(e) => setProcesso(e.target.value)} /></label><label className="span-2"><span>Reclamada</span><input value={reclamada} onChange={(e) => setReclamada(e.target.value)} /></label><label className="span-2"><span>Reclamante</span><input value={reclamante} onChange={(e) => setReclamante(e.target.value)} /></label><label><span>Origem</span><select value={origem} onChange={(e) => setOrigem(e.target.value)}><option>Alvará</option><option>Acordo</option></select></label><label><span>Forma de recebimento</span><input value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)} /></label><label><span>Data prevista</span><input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} /></label></div>
    <div className="account-integration-block revenue-account-block"><AccountSelector category="Receita" value={account?.code} onChange={setAccount} label="Categoria / Plano de Contas" placeholder="Digite código ou nome — ex.: 3.01, alvará, honorários..." /><p>A classificação permanece opcional.</p></div>
    <h3 className="form-section-title">Composição do Valor</h3>
    <div className="composition-table"><div className="composition-row composition-head"><span>Componente</span><span>Percentual (%)</span><span>Valor (R$)</span></div><div className="composition-row total-row"><strong>Valor Líquido do Alvará</strong><span>100%</span><input type="number" min="0" step="0.01" value={totalAlvara || ''} onChange={(e) => changeTotal(Number(e.target.value))} /></div><div className="composition-row"><strong>Base Cálculo Honorários (Valor Bruto)</strong><span>editável</span><input type="number" min="0" step="0.01" value={baseCalculo || ''} onChange={(e) => setBaseCalculo(Number(e.target.value))} /></div>{components.map((component, index) => <div className="composition-row" key={component.nome}><span>{component.nome}</span><input type="number" min="0" step="0.01" value={component.percentual || ''} onChange={(e) => updatePercent(index, Number(e.target.value))} /><input type="number" min="0" step="0.01" value={component.valor || ''} onChange={(e) => updateValue(index, Number(e.target.value))} /></div>)}<div className="composition-row deductions-row"><strong>Total de descontos / repasses</strong><span>—</span><strong>{money.format(totalDeducoes)}</strong></div><div className="composition-row client-row"><strong>VALOR LÍQUIDO DEVIDO AO CLIENTE</strong><span>automático</span><strong>{money.format(liquidoCliente)}</strong></div></div>
    <h3 className="form-section-title">Dados bancários para crédito do cliente</h3>
    <div className="form-grid compact-grid"><label><span>Banco</span><input value={banco} onChange={(e) => setBanco(e.target.value)} /></label><label><span>Agência</span><input value={agencia} onChange={(e) => setAgencia(e.target.value)} /></label><label><span>Conta</span><input value={conta} onChange={(e) => setConta(e.target.value)} /></label><label className="span-2"><span>Nome / Titular</span><input value={titular} onChange={(e) => setTitular(e.target.value)} /></label><label><span>CPF</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} /></label></div>
    <h3 className="form-section-title">Dados para emissão de Nota Fiscal</h3>
    <div className="form-grid compact-grid"><label className="span-2"><span>Endereço</span><input value={enderecoNf} onChange={(e) => setEnderecoNf(e.target.value)} /></label><label><span>E-mail</span><input type="email" value={emailNf} onChange={(e) => setEmailNf(e.target.value)} /></label></div>

    <div className="document-zone storage-document-zone revenue-zone"><CheckCircle2 size={20} /><div><strong>Documentos da receita · Storage ativo</strong><span>Anexe alvará, acordo, comprovantes e documentos do processo. O envio começa ao selecionar.</span></div><label className="storage-upload-button"><Upload size={16} /> Selecionar arquivos{uploads.length > 0 && <b className="upload-count-badge">{uploads.length}</b>}<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => selectFiles(e.target.files)} /></label></div>
    {uploads.length > 0 && <div className="expense-attachment-list">{uploads.map((item) => <div key={item.id} className={`upload-item upload-${item.status}`}><Paperclip size={15} /><div className="upload-item-main"><strong>{item.name}</strong>{item.status === 'uploading' ? <><div className="upload-progress"><i style={{ width: `${item.progress}%` }} /></div><small>{item.progress}% enviado · {formatBytes(item.size)}</small></> : item.status === 'success' ? <small><CheckCircle2 size={13} /> Enviado — {formatBytes(item.size)}</small> : <small>{item.error || 'Falha no envio'}</small>}</div>{item.meta?.url && <a href={item.meta.url} target="_blank" rel="noreferrer" title="Abrir arquivo"><ExternalLink size={14} /></a>}<button type="button" className="icon-button" onClick={() => void removeUpload(item)}><X size={14} /></button></div>)}</div>}

    <div className="modal-actions"><button className="secondary-button" onClick={() => void closeAndClean()}>Cancelar</button><button className="outline-revenue-button" disabled={busy || uploading} onClick={() => void save('rascunho')}>Salvar rascunho</button><button className="revenue-button" disabled={busy || uploading} onClick={() => void save('enviado_tesouraria')}><Send size={17} /> {uploading ? 'Enviando documentos...' : 'Enviar à Tesouraria'}</button></div>
  </section></div>
}

export function ReceivablesPageStorage() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [search, setSearch] = useState('')
  const [attachmentsTarget, setAttachmentsTarget] = useState<AnyRecord | null>(null)
  const { records, loading } = useReceivables()
  useEffect(() => { if (params.get('novo') === '1') setOpen(true) }, [params])
  const filtered = records.filter((item) => `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.reclamada ?? ''} ${item.revenueAccountCode ?? ''} ${item.revenueAccountName ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setParams({}) }

  return <>
    <div className="page-heading"><div><span className="eyebrow">Origem do recebimento</span><h1>Recebimento de Alvarás</h1><p>O departamento de origem preenche o demonstrativo, classifica a receita e anexa os documentos que seguirão para a Contabilidade.</p></div><div className="quick-actions"><button className="outline-revenue-button" type="button"><FileText size={18} /> Extrato de Receitas</button><button className="revenue-button" type="button" onClick={() => setOpen(true)}><Plus size={18} /> Nova Receita</button></div></div>
    <section className="page-card module-card revenue-module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por processo, partes, código ou conta de receita" /></div></div>{loading ? <div className="module-empty"><RefreshCw className="spin" size={30} /><strong>Carregando receitas</strong></div> : filtered.length === 0 ? <div className="module-empty"><BadgeDollarSign size={34} /><strong>Nenhuma receita cadastrada</strong></div> : <div className="data-table receivable-integrated-table"><div className="data-row data-head"><span>Processo</span><span>Partes</span><span>Plano de Contas</span><span>Status</span><span className="numeric">Valor</span></div>{filtered.map((item) => { const attachments = attachmentsOf(item); return <div className="data-row" key={item.id}><span><strong>{item.processo || '—'}</strong><small>{item.natureza || ''}</small></span><span><strong>{item.reclamante || '—'}</strong><small>{item.reclamada || ''}</small></span><span><strong>{item.revenueAccountCode || item.classificacaoContabil || '—'}</strong><small>{item.revenueAccountName || item.categoriaReceita || 'Não classificada'}</small></span><span><WorkflowStatusBadge status={item.status} label={statusLabels[item.status] || item.status || '—'} /></span><span className="numeric revenue-text"><strong>{money.format(toNumber(item.valorAlvara))}</strong>{attachments.length > 0 && <button className="attachment-count-link" type="button" onClick={() => setAttachmentsTarget(item)}><Paperclip size={14} /> {attachments.length}</button>}</span></div> })}</div>}</section>
    {open && <ReceivableModal key="nova-receita-storage" onClose={close} />}
    {attachmentsTarget && <div className="modal-backdrop"><section className="decision-modal" role="dialog" aria-modal="true"><div className="modal-toolbar"><div><span className="eyebrow">Documentos da receita</span><h2>{attachmentsTarget.processo || attachmentsTarget.reclamante || 'Recebimento'}</h2></div><button className="icon-button" onClick={() => setAttachmentsTarget(null)}><X size={20} /></button></div><div className="storage-dossier-files">{attachmentsOf(attachmentsTarget).map((file) => <a key={file.path} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14} /><span>{file.name}</span><ExternalLink size={13} /></a>)}</div></section></div>}
  </>
}
