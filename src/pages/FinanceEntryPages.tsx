import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import {
  AlertTriangle,
  BadgeDollarSign,
  FileText,
  Filter,
  LockKeyhole,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import { AccountSelector } from '../components/AccountSelector'
import { WorkflowStatusBadge } from '../components/WorkflowStatusBadge'
import type { ChartOfAccount } from '../data/chartOfAccounts'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type AnyRecord = { id: string } & DocumentData
type ExpenseItem = { data: string; historico: string; valor: string }
type RevenueComponent = { nome: string; percentual: number; valor: number }

const expenseStatusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado_aprovacao: 'Enviado para Aprovação',
  em_analise: 'Em Análise',
  aprovado: 'Aprovado',
  devolvido: 'Devolvido p/ Correção',
  rejeitado: 'Rejeitado',
  pago: 'Pago',
  arquivado: 'Arquivado',
}

const receivableStatusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado_tesouraria: 'Enviado à Tesouraria',
  recebido_tesouraria: 'Recebido pela Tesouraria',
  devolvido: 'Devolvido para Correção',
  encerrado: 'Encerrado / Arquivado',
}

function useLiveCollection(name: string) {
  const [records, setRecords] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => onSnapshot(collection(db, name), (snapshot) => {
    setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    setLoading(false)
  }, () => setLoading(false)), [name])
  return { records, loading }
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseBRL(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/R\$/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function formatCurrencyFromDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return money.format(Number(digits) / 100)
}

function asCurrencyInput(value: unknown) {
  const number = toNumber(value)
  return number ? money.format(number) : ''
}

async function writeAudit(profile: ReturnType<typeof useAuth>['profile'], action: string, module: string, detail: string, entityId?: string) {
  if (!profile) return
  await addDoc(collection(db, 'auditLogs'), {
    action,
    module,
    detail,
    entityId: entityId ?? null,
    userId: profile.uid,
    userName: profile.displayName,
    userEmail: profile.email,
    createdAt: serverTimestamp(),
  })
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="quick-actions">{actions}</div>}</div>
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return <div className="module-empty"><Icon size={34} /><strong>{title}</strong><span>{text}</span></div>
}

function selectedAccountFromRecord(record: AnyRecord | null | undefined, category: 'Despesa' | 'Receita'): string {
  const direct = category === 'Despesa'
    ? record?.expenseAccountCode ?? record?.classificacaoContabil
    : record?.revenueAccountCode ?? record?.classificacaoContabil
  const code = String(direct ?? '')
  return code.startsWith(category === 'Despesa' ? '4.' : '3.') ? code : ''
}

function ExpenseModal({ record, onClose }: { record?: AnyRecord | null; onClose: () => void }) {
  const { profile } = useAuth()
  const editing = Boolean(record)
  const [busy, setBusy] = useState(false)
  const [unidade, setUnidade] = useState<'RJ' | 'SP'>((record?.unidade as 'RJ' | 'SP') || 'RJ')
  const [nome, setNome] = useState(String(record?.nome ?? ''))
  const [competencia, setCompetencia] = useState(String(record?.competencia ?? new Date().toISOString().slice(0, 7)))
  const [fornecedor, setFornecedor] = useState(String(record?.fornecedor ?? ''))
  const [documento, setDocumento] = useState(String(record?.documento ?? ''))
  const [subcategoria, setSubcategoria] = useState(String(record?.subcategoria ?? ''))
  const [observacoes, setObservacoes] = useState(String(record?.observacoes ?? ''))
  const [account, setAccount] = useState<ChartOfAccount | null>(null)
  const initialAccountCode = selectedAccountFromRecord(record, 'Despesa')
  const initialItems = Array.isArray(record?.items) && record?.items.length
    ? record.items.map((item: DocumentData) => ({ data: String(item.data ?? ''), historico: String(item.historico ?? ''), valor: asCurrencyInput(item.valor) }))
    : [{ data: new Date().toISOString().slice(0, 10), historico: '', valor: '' }, { data: '', historico: '', valor: '' }, { data: '', historico: '', valor: '' }]
  const [items, setItems] = useState<ExpenseItem[]>(initialItems)
  const total = useMemo(() => items.reduce((sum, item) => sum + parseBRL(item.valor), 0), [items])

  function updateItem(index: number, field: keyof ExpenseItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  async function save(status: 'rascunho' | 'devolvido' | 'enviado_aprovacao') {
    const validItems = items.filter((item) => item.historico.trim() || parseBRL(item.valor) > 0)
    if (!nome.trim() || !validItems.length || total <= 0) {
      window.alert('Preencha o nome/responsável e pelo menos uma linha de despesa com histórico e valor.')
      return
    }
    setBusy(true)
    try {
      const chosenCode = account?.code || initialAccountCode || null
      const chosenName = account?.name || String(record?.expenseAccountName ?? '') || null
      const chosenDre = account?.dre || String(record?.expenseAccountDre ?? '') || null
      const categoryLabel = chosenCode && chosenName ? `${chosenCode} - ${chosenName}` : String(record?.categoria ?? '')
      const payload = {
        unidade,
        nome: nome.trim(),
        competencia,
        fornecedor: fornecedor.trim(),
        documento: documento.trim(),
        categoria: categoryLabel,
        subcategoria: subcategoria.trim(),
        classificacaoContabil: chosenCode,
        expenseAccountCode: chosenCode,
        expenseAccountName: chosenName,
        expenseAccountDre: chosenDre,
        planoConta: chosenCode ? { code: chosenCode, name: chosenName, dre: chosenDre, category: 'Despesa' } : null,
        observacoes: observacoes.trim(),
        items: validItems.map((item) => ({ ...item, valor: parseBRL(item.valor) })),
        valorTotal: total,
        status,
        updatedAt: serverTimestamp(),
        correctedBy: editing ? profile?.uid : null,
        correctedAt: editing ? serverTimestamp() : null,
        ...(status === 'enviado_aprovacao' ? { approvalNote: null } : {}),
      }
      if (record) {
        await updateDoc(doc(db, 'expenses', record.id), payload)
        await writeAudit(profile, status === 'enviado_aprovacao' ? 'Despesa corrigida e reenviada para aprovação' : 'Correção de despesa salva', 'Despesas', `${nome} — ${money.format(total)}${chosenCode ? ` — Conta ${chosenCode}` : ''}`, record.id)
      } else {
        const ref = await addDoc(collection(db, 'expenses'), { ...payload, createdBy: profile?.uid, createdByName: profile?.displayName, createdAt: serverTimestamp() })
        await writeAudit(profile, status === 'rascunho' ? 'Despesa salva como rascunho' : 'Despesa enviada para aprovação', 'Despesas', `${nome} — ${money.format(total)}${chosenCode ? ` — Conta ${chosenCode}` : ''}`, ref.id)
      }
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar a despesa. Confira sua conexão e permissão de acesso.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal-sheet legacy-sheet expense-sheet" role="dialog" aria-modal="true">
    <div className="modal-toolbar"><div><span className="eyebrow expense-text">Tesouraria</span><h2>{editing ? 'Corrigir Demonstrativo de Despesas' : 'Demonstrativo de Despesas'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <div className="legacy-title-block"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE DESPESAS</span></div>
    {record?.status === 'devolvido' && <div className="return-note"><AlertTriangle size={18} /><div><strong>Devolvido para correção</strong><span>{record.approvalNote || 'A Diretoria solicitou correção deste demonstrativo.'}</span></div></div>}

    <div className="form-grid compact-grid">
      <label><span>Unidade</span><select value={unidade} onChange={(event) => setUnidade(event.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label>
      <label className="span-2"><span>Nome / Responsável</span><input value={nome} onChange={(event) => setNome(event.target.value)} /></label>
      <label><span>Competência</span><input type="month" value={competencia} onChange={(event) => setCompetencia(event.target.value)} /></label>
      <label className="span-2"><span>Fornecedor / Favorecido</span><input value={fornecedor} onChange={(event) => setFornecedor(event.target.value)} /></label>
      <label><span>CPF / CNPJ</span><input value={documento} onChange={(event) => setDocumento(event.target.value)} /></label>
    </div>

    <div className="legacy-table expense-table"><div className="legacy-row legacy-head"><span>DATA</span><span>HISTÓRICO</span><span>VALOR</span><span></span></div>{items.map((item, index) => <div className="legacy-row" key={index}><input type="date" value={item.data} onChange={(event) => updateItem(index, 'data', event.target.value)} /><input value={item.historico} onChange={(event) => updateItem(index, 'historico', event.target.value)} placeholder="Descrição da despesa" /><input inputMode="numeric" value={item.valor} onChange={(event) => updateItem(index, 'valor', formatCurrencyFromDigits(event.target.value))} placeholder="R$ 0,00" /><button type="button" className="row-remove" onClick={() => setItems((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current)}><Trash2 size={15} /></button></div>)}</div>
    <button type="button" className="add-row-button expense-text" onClick={() => setItems((current) => [...current, { data: '', historico: '', valor: '' }])}><Plus size={16} /> Adicionar linha</button>

    <div className="account-integration-block expense-account-block">
      <AccountSelector category="Despesa" value={account?.code || initialAccountCode} onChange={setAccount} label="Categoria / Plano de Contas" placeholder="Digite código ou nome — ex.: 4.05, aluguel, telefone..." />
      <p>A lista contém somente as contas finais 4.xx do Plano de Contas oficial. A classificação permanece opcional.</p>
    </div>

    <div className="form-grid compact-grid section-gap">
      <label className="span-2"><span>Detalhamento complementar <small>(opcional)</small></span><input value={subcategoria} onChange={(event) => setSubcategoria(event.target.value)} placeholder="Informação complementar da despesa" /></label>
      <label className="span-3"><span>OBS.</span><textarea rows={3} value={observacoes} onChange={(event) => setObservacoes(event.target.value)} /></label>
    </div>

    <div className="document-zone disabled-zone"><Paperclip size={19} /><div><strong>Documentos comprobatórios</strong><span>Upload será habilitado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div>
    <div className="legacy-total"><span>Total da Despesa</span><strong>{money.format(total)}</strong></div>
    <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>{editing ? <><button className="outline-expense-button" type="button" disabled={busy} onClick={() => save('devolvido')}>Salvar correção</button><button className="expense-button" type="button" disabled={busy} onClick={() => save('enviado_aprovacao')}><Send size={17} /> Reenviar para Aprovação</button></> : <><button className="outline-expense-button" type="button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button><button className="expense-button" type="button" disabled={busy} onClick={() => save('enviado_aprovacao')}><Send size={17} /> Enviar para Aprovação</button></>}</div>
  </section></div>
}

export function ExpensesPageIntegrated() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [editing, setEditing] = useState<AnyRecord | null>(null)
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('expenses')
  useEffect(() => { if (params.get('novo') === '1') { setEditing(null); setOpen(true) } }, [params])
  const filtered = records.filter((item) => `${item.nome ?? ''} ${item.fornecedor ?? ''} ${item.competencia ?? ''} ${item.categoria ?? ''} ${item.expenseAccountCode ?? ''} ${item.expenseAccountName ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setEditing(null); setParams({}) }

  return <>
    <PageHeader eyebrow="Tesouraria" title="Despesas" description="Criação, classificação pelo Plano de Contas, correção, reenvio e acompanhamento do demonstrativo." actions={<><button className="outline-expense-button" type="button"><FileText size={18} /> Extrato de Despesas</button><button className="expense-button" type="button" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={18} /> Nova Despesa</button></>} />
    <section className="page-card module-card expense-module-card">
      <div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por responsável, fornecedor, competência, código ou conta" /></div><button className="secondary-button"><Filter size={17} /> Filtros</button></div>
      {loading ? <EmptyState icon={RefreshCw} title="Carregando despesas" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={ReceiptText} title="Nenhuma despesa encontrada" text="Clique em Nova Despesa para preencher o primeiro demonstrativo." /> : <div className="data-table review-expenses-table"><div className="data-row data-head"><span>Competência</span><span>Responsável / Favorecido</span><span>Plano de Contas</span><span>Status</span><span className="numeric">Valor</span><span>Ações</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span>{item.competencia || '—'}</span><span><strong>{item.nome || 'Sem nome'}</strong><small>{item.fornecedor || ''}</small></span><span><strong>{item.expenseAccountCode || item.classificacaoContabil || '—'}</strong><small>{item.expenseAccountName || item.categoria || 'Não classificada'}</small></span><span><WorkflowStatusBadge status={item.status} label={expenseStatusLabels[item.status] || item.status || '—'} /></span><span className="numeric expense-text"><strong>{money.format(toNumber(item.valorTotal))}</strong></span><span>{item.status === 'devolvido' ? <button className="small-expense-button" type="button" onClick={() => { setEditing(item); setOpen(true) }}><Pencil size={14} /> Corrigir e reenviar</button> : <span className="muted-dash">—</span>}</span></div>)}</div>}
    </section>
    {open && <ExpenseModal key={editing?.id ?? 'nova-despesa'} record={editing} onClose={close} />}
  </>
}

function ReceivableModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
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

  function updatePercent(index: number, percentual: number) {
    setComponents((current) => current.map((item, i) => i === index ? { ...item, percentual, valor: totalAlvara > 0 ? Number(((totalAlvara * percentual) / 100).toFixed(2)) : 0 } : item))
  }
  function updateValue(index: number, valor: number) {
    setComponents((current) => current.map((item, i) => i === index ? { ...item, valor, percentual: totalAlvara > 0 ? Number(((valor / totalAlvara) * 100).toFixed(4)) : 0 } : item))
  }
  function changeTotal(value: number) {
    const previous = totalAlvara
    setTotalAlvara(value)
    setBaseCalculo((current) => current === 0 || current === previous ? value : current)
    setComponents((current) => current.map((item) => ({ ...item, valor: value > 0 ? Number(((value * item.percentual) / 100).toFixed(2)) : 0 })))
  }

  async function save(status: 'rascunho' | 'enviado_tesouraria') {
    if (!processo.trim() || !reclamante.trim() || totalAlvara <= 0) {
      window.alert('Preencha número do processo, reclamante e valor líquido do alvará.')
      return
    }
    setBusy(true)
    try {
      const ref = await addDoc(collection(db, 'receivables'), {
        unidade,
        data,
        natureza,
        processo: processo.trim(),
        reclamada: reclamada.trim(),
        reclamante: reclamante.trim(),
        origem,
        formaRecebimento: formaRecebimento.trim(),
        dataPrevista,
        categoriaReceita: account ? `${account.code} - ${account.name}` : '',
        classificacaoContabil: account?.code ?? null,
        revenueAccountCode: account?.code ?? null,
        revenueAccountName: account?.name ?? null,
        revenueAccountDre: account?.dre ?? null,
        planoConta: account ? { code: account.code, name: account.name, dre: account.dre, category: 'Receita' } : null,
        valorAlvara: totalAlvara,
        baseCalculo,
        valorLiquidoCliente: liquidoCliente,
        totalDeducoes,
        components,
        banco,
        agencia,
        conta,
        titular,
        cpf,
        emailNf,
        enderecoNf,
        status,
        createdBy: profile?.uid,
        createdByName: profile?.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await writeAudit(profile, status === 'rascunho' ? 'Receita salva como rascunho' : 'Receita enviada à Tesouraria', 'Recebimento de Alvarás', `Processo ${processo} — ${money.format(totalAlvara)}${account ? ` — Conta ${account.code}` : ''}`, ref.id)
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar a receita.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop"><section className="modal-sheet legacy-sheet revenue-sheet">
    <div className="modal-toolbar"><div><span className="eyebrow revenue-text">Recebimento de Alvarás</span><h2>Demonstrativo de Recebimento de Honorários</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
    <div className="legacy-title-block revenue-title"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE RECEBIMENTO DE HONORÁRIOS</span></div>

    <h3 className="form-section-title">Dados do Processo</h3>
    <div className="form-grid compact-grid"><label><span>Unidade</span><select value={unidade} onChange={(event) => setUnidade(event.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label><label><span>Data</span><input type="date" value={data} onChange={(event) => setData(event.target.value)} /></label><label><span>Natureza</span><select value={natureza} onChange={(event) => setNatureza(event.target.value)}><option>Trabalhista</option><option>Cível</option></select></label><label className="span-2"><span>Número do processo</span><input value={processo} onChange={(event) => setProcesso(event.target.value)} /></label><label className="span-2"><span>Reclamada</span><input value={reclamada} onChange={(event) => setReclamada(event.target.value)} /></label><label className="span-2"><span>Reclamante</span><input value={reclamante} onChange={(event) => setReclamante(event.target.value)} /></label><label><span>Origem</span><select value={origem} onChange={(event) => setOrigem(event.target.value)}><option>Alvará</option><option>Acordo</option></select></label><label><span>Forma de recebimento</span><input value={formaRecebimento} onChange={(event) => setFormaRecebimento(event.target.value)} /></label><label><span>Data prevista</span><input type="date" value={dataPrevista} onChange={(event) => setDataPrevista(event.target.value)} /></label></div>

    <div className="account-integration-block revenue-account-block">
      <AccountSelector category="Receita" value={account?.code} onChange={setAccount} label="Categoria / Plano de Contas" placeholder="Digite código ou nome — ex.: 3.01, alvará, honorários..." />
      <p>A lista contém somente as contas finais 3.xx do Plano de Contas oficial.</p>
    </div>

    <h3 className="form-section-title">Composição do Valor</h3>
    <div className="composition-table"><div className="composition-row composition-head"><span>Componente</span><span>Percentual (%)</span><span>Valor (R$)</span></div><div className="composition-row total-row"><strong>Valor Líquido do Alvará</strong><span>100%</span><input type="number" min="0" step="0.01" value={totalAlvara || ''} onChange={(event) => changeTotal(Number(event.target.value))} /></div><div className="composition-row"><strong>Base Cálculo Honorários (Valor Bruto)</strong><span>editável</span><input type="number" min="0" step="0.01" value={baseCalculo || ''} onChange={(event) => setBaseCalculo(Number(event.target.value))} /></div>{components.map((component, index) => <div className="composition-row" key={component.nome}><span>{component.nome}</span><input type="number" min="0" step="0.01" value={component.percentual || ''} onChange={(event) => updatePercent(index, Number(event.target.value))} /><input type="number" min="0" step="0.01" value={component.valor || ''} onChange={(event) => updateValue(index, Number(event.target.value))} /></div>)}<div className="composition-row deductions-row"><strong>Total de descontos / repasses</strong><span>—</span><strong>{money.format(totalDeducoes)}</strong></div><div className="composition-row client-row"><strong>VALOR LÍQUIDO DEVIDO AO CLIENTE</strong><span>automático</span><strong>{money.format(liquidoCliente)}</strong></div></div>

    <h3 className="form-section-title">Dados bancários para crédito do cliente</h3>
    <div className="form-grid compact-grid"><label><span>Banco</span><input value={banco} onChange={(event) => setBanco(event.target.value)} /></label><label><span>Agência</span><input value={agencia} onChange={(event) => setAgencia(event.target.value)} /></label><label><span>Conta</span><input value={conta} onChange={(event) => setConta(event.target.value)} /></label><label className="span-2"><span>Nome / Titular</span><input value={titular} onChange={(event) => setTitular(event.target.value)} /></label><label><span>CPF</span><input value={cpf} onChange={(event) => setCpf(event.target.value)} /></label></div>

    <h3 className="form-section-title">Dados para emissão de Nota Fiscal</h3>
    <div className="form-grid compact-grid"><label className="span-2"><span>Endereço</span><input value={enderecoNf} onChange={(event) => setEnderecoNf(event.target.value)} /></label><label><span>E-mail</span><input type="email" value={emailNf} onChange={(event) => setEmailNf(event.target.value)} /></label></div>

    <div className="document-zone disabled-zone revenue-zone"><Paperclip size={19} /><div><strong>Alvará, acordo e documentos do processo</strong><span>Upload será ativado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="outline-revenue-button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button><button className="revenue-button" disabled={busy} onClick={() => save('enviado_tesouraria')}><Send size={17} /> Enviar à Tesouraria</button></div>
  </section></div>
}

export function ReceivablesPageIntegrated() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('receivables')
  useEffect(() => { if (params.get('novo') === '1') setOpen(true) }, [params])
  const filtered = records.filter((item) => `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.reclamada ?? ''} ${item.revenueAccountCode ?? ''} ${item.revenueAccountName ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setParams({}) }

  return <>
    <PageHeader eyebrow="Origem do recebimento" title="Recebimento de Alvarás" description="O departamento de origem preenche o demonstrativo completo, classifica a receita no Plano de Contas e envia o documento pronto à Tesouraria." actions={<><button className="outline-revenue-button" type="button"><FileText size={18} /> Extrato de Receitas</button><button className="revenue-button" type="button" onClick={() => setOpen(true)}><Plus size={18} /> Nova Receita</button></>} />
    <section className="page-card module-card revenue-module-card">
      <div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, partes, código ou conta de receita" /></div></div>
      {loading ? <EmptyState icon={RefreshCw} title="Carregando receitas" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={BadgeDollarSign} title="Nenhuma receita cadastrada" text="Clique em Nova Receita para preencher o demonstrativo." /> : <div className="data-table receivable-integrated-table"><div className="data-row data-head"><span>Processo</span><span>Partes</span><span>Plano de Contas</span><span>Status</span><span className="numeric">Valor</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span><strong>{item.processo || '—'}</strong><small>{item.natureza || ''}</small></span><span><strong>{item.reclamante || '—'}</strong><small>{item.reclamada || ''}</small></span><span><strong>{item.revenueAccountCode || item.classificacaoContabil || '—'}</strong><small>{item.revenueAccountName || item.categoriaReceita || 'Não classificada'}</small></span><span><WorkflowStatusBadge status={item.status} label={receivableStatusLabels[item.status] || item.status || '—'} /></span><span className="numeric revenue-text"><strong>{money.format(toNumber(item.valorAlvara))}</strong></span></div>)}</div>}
    </section>
    {open && <ReceivableModal key="nova-receita-integrada" onClose={close} />}
  </>
}
