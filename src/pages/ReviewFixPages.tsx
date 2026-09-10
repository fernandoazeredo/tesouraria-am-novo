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
  BadgeCheck,
  BadgeDollarSign,
  FileCheck2,
  FileText,
  Filter,
  LockKeyhole,
  MailPlus,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useAuth, type UserRole, type UserStatus } from '../auth/AuthContext'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTimeBR = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const PRIMARY_ADMIN_EMAIL = 'fernandoazeredo64@gmail.com'

type AnyRecord = { id: string } & DocumentData
type ExpenseItem = { data: string; historico: string; valor: string }
type RevenueComponent = { nome: string; percentual: number; valor: number }

const roleLabels: Record<UserRole, string> = {
  master: 'Master',
  admin: 'Administrador',
  diretoria: 'Diretoria / Aprovador',
  tesouraria: 'Tesouraria / Financeiro',
  alvaras: 'Recebimento de Alvarás',
  contabilidade: 'Contabilidade',
  consulta: 'Consulta',
}

const statusLabels: Record<UserStatus, string> = {
  pending: 'Pendente', active: 'Ativo', inactive: 'Inativo', blocked: 'Bloqueado',
}

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

function timestampToDateTime(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return dateTimeBR.format((value as { toDate: () => Date }).toDate())
  }
  return '—'
}

async function writeAudit(profile: ReturnType<typeof useAuth>['profile'], action: string, module: string, detail: string, entityId?: string) {
  if (!profile) return
  await addDoc(collection(db, 'auditLogs'), {
    action, module, detail, entityId: entityId ?? null,
    userId: profile.uid, userName: profile.displayName, userEmail: profile.email,
    createdAt: serverTimestamp(),
  })
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="quick-actions">{actions}</div>}</div>
}

function StatusBadge({ value, tone = 'neutral' }: { value: string; tone?: 'expense' | 'revenue' | 'success' | 'warning' | 'neutral' }) {
  return <span className={`status-badge ${tone}`}>{value}</span>
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return <div className="module-empty"><Icon size={34} /><strong>{title}</strong><span>{text}</span></div>
}

export function DashboardPageReview() {
  const { records: expenses } = useLiveCollection('expenses')
  const { records: receivables } = useLiveCollection('receivables')
  const approvedExpenses = expenses.filter((item) => item.status === 'aprovado')
  const expenseTotal = approvedExpenses.reduce((sum, item) => sum + toNumber(item.valorTotal), 0)
  const revenueTotal = receivables.reduce((sum, item) => sum + toNumber(item.valorAlvara), 0)
  const balance = revenueTotal - expenseTotal
  const pending = expenses.filter((item) => item.status === 'enviado_aprovacao' || item.status === 'em_analise').length
  const rejected = expenses.filter((item) => item.status === 'rejeitado').length

  return <>
    <PageHeader eyebrow="Visão gerencial" title="Dashboard Financeira" description="Retrato consolidado das receitas e das despesas efetivamente aprovadas." actions={<><Link className="expense-button button-link" to="/despesas?novo=1"><ReceiptText size={18} /> + Despesa</Link><Link className="revenue-button button-link" to="/alvaras?novo=1"><BadgeDollarSign size={18} /> + Receita</Link></>} />
    <div className="metrics-grid">
      <article className="metric revenue-metric"><span>Receitas</span><strong>{money.format(revenueTotal)}</strong><small>Total registrado</small></article>
      <article className="metric expense-metric"><span>Despesas</span><strong>{money.format(expenseTotal)}</strong><small>Somente despesas aprovadas</small></article>
      <article className={`metric balance-metric ${balance < 0 ? 'negative' : ''}`}><span>Saldo / Resultado</span><strong>{money.format(balance)}</strong><small>Receitas menos despesas aprovadas</small></article>
      <article className="metric"><span>Aguardando Aprovação</span><strong>{pending}</strong><small>Fluxo da Diretoria</small></article>
    </div>
    <div className="dashboard-grid">
      <section className="page-card"><div className="card-title-row"><h2>Movimento financeiro</h2><span className="mini-legend"><i className="legend-revenue" /> Receitas <i className="legend-expense" /> Despesas aprovadas</span></div><div className="summary-bars"><div><span>Receitas</span><strong>{money.format(revenueTotal)}</strong><b className="bar revenue-bar" style={{ width: `${Math.min(100, revenueTotal > 0 ? 100 : 4)}%` }} /></div><div><span>Despesas aprovadas</span><strong>{money.format(expenseTotal)}</strong><b className="bar expense-bar" style={{ width: `${Math.min(100, revenueTotal > 0 ? (expenseTotal / revenueTotal) * 100 : expenseTotal > 0 ? 100 : 4)}%` }} /></div></div></section>
      <section className="page-card"><h2>Fluxo de aprovação</h2><div className="status-row"><span>Rascunhos</span><strong>{expenses.filter((item) => item.status === 'rascunho').length}</strong></div><div className="status-row"><span>Em análise</span><strong>{pending}</strong></div><div className="status-row"><span>Aprovados</span><strong>{approvedExpenses.length}</strong></div><div className="status-row"><span>Devolvidos</span><strong>{expenses.filter((item) => item.status === 'devolvido').length}</strong></div><div className="status-row rejected-row"><span>Rejeitados</span><strong>{rejected}</strong></div></section>
    </div>
  </>
}

function ExpenseModalReview({ record, onClose }: { record?: AnyRecord | null; onClose: () => void }) {
  const { profile } = useAuth()
  const editing = Boolean(record)
  const [busy, setBusy] = useState(false)
  const [unidade, setUnidade] = useState<'RJ' | 'SP'>((record?.unidade as 'RJ' | 'SP') || 'RJ')
  const [nome, setNome] = useState(String(record?.nome ?? ''))
  const [competencia, setCompetencia] = useState(String(record?.competencia ?? new Date().toISOString().slice(0, 7)))
  const [fornecedor, setFornecedor] = useState(String(record?.fornecedor ?? ''))
  const [documento, setDocumento] = useState(String(record?.documento ?? ''))
  const [categoria, setCategoria] = useState(String(record?.categoria ?? ''))
  const [subcategoria, setSubcategoria] = useState(String(record?.subcategoria ?? ''))
  const [classificacao, setClassificacao] = useState(String(record?.classificacaoContabil ?? ''))
  const [observacoes, setObservacoes] = useState(String(record?.observacoes ?? ''))
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
      const payload = {
        unidade, nome: nome.trim(), competencia, fornecedor: fornecedor.trim(), documento: documento.trim(), categoria, subcategoria,
        classificacaoContabil: classificacao || null, observacoes: observacoes.trim(),
        items: validItems.map((item) => ({ ...item, valor: parseBRL(item.valor) })), valorTotal: total, status,
        updatedAt: serverTimestamp(), correctedBy: editing ? profile?.uid : null, correctedAt: editing ? serverTimestamp() : null,
        ...(status === 'enviado_aprovacao' ? { approvalNote: null } : {}),
      }
      if (record) {
        await updateDoc(doc(db, 'expenses', record.id), payload)
        await writeAudit(profile, status === 'enviado_aprovacao' ? 'Despesa corrigida e reenviada para aprovação' : 'Correção de despesa salva', 'Despesas', `${nome} — ${money.format(total)}`, record.id)
      } else {
        const ref = await addDoc(collection(db, 'expenses'), { ...payload, createdBy: profile?.uid, createdByName: profile?.displayName, createdAt: serverTimestamp() })
        await writeAudit(profile, status === 'rascunho' ? 'Despesa salva como rascunho' : 'Despesa enviada para aprovação', 'Despesas', `${nome} — ${money.format(total)}`, ref.id)
      }
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar a despesa. Confira sua conexão e permissão de acesso.')
    } finally { setBusy(false) }
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal-sheet legacy-sheet expense-sheet" role="dialog" aria-modal="true">
    <div className="modal-toolbar"><div><span className="eyebrow expense-text">Tesouraria</span><h2>{editing ? 'Corrigir Demonstrativo de Despesas' : 'Demonstrativo de Despesas'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <div className="legacy-title-block"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE DESPESAS</span></div>
    {record?.status === 'devolvido' && <div className="return-note"><AlertTriangle size={18} /><div><strong>Devolvido para correção</strong><span>{record.approvalNote || 'A Diretoria solicitou correção deste demonstrativo.'}</span></div></div>}
    <div className="form-grid compact-grid">
      <label><span>Unidade</span><select value={unidade} onChange={(e) => setUnidade(e.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label>
      <label className="span-2"><span>Nome / Responsável</span><input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <label><span>Competência</span><input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></label>
      <label className="span-2"><span>Fornecedor / Favorecido</span><input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} /></label>
      <label><span>CPF / CNPJ</span><input value={documento} onChange={(e) => setDocumento(e.target.value)} /></label>
    </div>
    <div className="legacy-table expense-table"><div className="legacy-row legacy-head"><span>DATA</span><span>HISTÓRICO</span><span>VALOR</span><span></span></div>{items.map((item, index) => <div className="legacy-row" key={index}><input type="date" value={item.data} onChange={(e) => updateItem(index, 'data', e.target.value)} /><input value={item.historico} onChange={(e) => updateItem(index, 'historico', e.target.value)} /><input inputMode="numeric" value={item.valor} onChange={(e) => updateItem(index, 'valor', formatCurrencyFromDigits(e.target.value))} placeholder="R$ 0,00" /><button type="button" className="row-remove" onClick={() => setItems((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current)}><Trash2 size={15} /></button></div>)}</div>
    <button type="button" className="add-row-button expense-text" onClick={() => setItems((current) => [...current, { data: '', historico: '', valor: '' }])}><Plus size={16} /> Adicionar linha</button>
    <div className="form-grid compact-grid section-gap"><label><span>Categoria</span><select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Selecionar</option><option>Impostos, Tributos e Encargos</option><option>Folha de Pagamento e Pessoal</option><option>Contas a Pagar - Operacionais</option><option>Honorários, Comissões e Participações</option><option>Reembolsos e Despesas de Representação</option><option>Despesas Extraordinárias / Não Recorrentes</option></select></label><label><span>Subcategoria</span><input value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} /></label><label><span>Classificação de Contas <small>(opcional)</small></span><input value={classificacao} onChange={(e) => setClassificacao(e.target.value)} /></label><label className="span-3"><span>OBS.</span><textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></label></div>
    <div className="document-zone disabled-zone"><Paperclip size={19} /><div><strong>Documentos comprobatórios</strong><span>Upload será habilitado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div>
    <div className="legacy-total"><span>Total da Despesa</span><strong>{money.format(total)}</strong></div>
    <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>{editing ? <><button className="outline-expense-button" type="button" disabled={busy} onClick={() => save('devolvido')}>Salvar correção</button><button className="expense-button" type="button" disabled={busy} onClick={() => save('enviado_aprovacao')}><Send size={17} /> Reenviar para Aprovação</button></> : <><button className="outline-expense-button" type="button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button><button className="expense-button" type="button" disabled={busy} onClick={() => save('enviado_aprovacao')}><Send size={17} /> Enviar para Aprovação</button></>}</div>
  </section></div>
}

export function ExpensesPageReview() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [editing, setEditing] = useState<AnyRecord | null>(null)
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('expenses')
  useEffect(() => { if (params.get('novo') === '1') { setEditing(null); setOpen(true) } }, [params])
  const filtered = records.filter((item) => `${item.nome ?? ''} ${item.fornecedor ?? ''} ${item.competencia ?? ''} ${item.categoria ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setEditing(null); setParams({}) }

  return <>
    <PageHeader eyebrow="Tesouraria" title="Despesas" description="Criação, correção, reenvio para aprovação e acompanhamento do demonstrativo." actions={<><button className="outline-expense-button" type="button"><FileText size={18} /> Extrato de Despesas</button><button className="expense-button" type="button" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={18} /> Nova Despesa</button></>} />
    <section className="page-card module-card expense-module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por responsável, fornecedor, competência ou categoria" /></div><button className="secondary-button"><Filter size={17} /> Filtros</button></div>
      {loading ? <EmptyState icon={RefreshCw} title="Carregando despesas" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={ReceiptText} title="Nenhuma despesa encontrada" text="Clique em Nova Despesa para preencher o primeiro demonstrativo." /> : <div className="data-table review-expenses-table"><div className="data-row data-head"><span>Competência</span><span>Responsável / Favorecido</span><span>Categoria</span><span>Status</span><span className="numeric">Valor</span><span>Ações</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span>{item.competencia || '—'}</span><span><strong>{item.nome || 'Sem nome'}</strong><small>{item.fornecedor || ''}</small></span><span>{item.categoria || 'Não classificada'}</span><span><StatusBadge value={expenseStatusLabels[item.status] || item.status || '—'} tone="expense" /></span><span className="numeric expense-text"><strong>{money.format(toNumber(item.valorTotal))}</strong></span><span>{item.status === 'devolvido' ? <button className="small-expense-button" type="button" onClick={() => { setEditing(item); setOpen(true) }}><Pencil size={14} /> Corrigir e reenviar</button> : <span className="muted-dash">—</span>}</span></div>)}</div>}
    </section>
    {open && <ExpenseModalReview key={editing?.id ?? 'nova-despesa'} record={editing} onClose={close} />}
  </>
}

function ReceivableModalReview({ onClose }: { onClose: () => void }) {
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
    { nome: 'Imposto de Renda', percentual: 0, valor: 0 }, { nome: 'INSS', percentual: 0, valor: 0 }, { nome: 'INSS Empregador', percentual: 0, valor: 0 }, { nome: 'Honorários do Escritório', percentual: 0, valor: 0 }, { nome: 'Honorários Perito', percentual: 0, valor: 0 }, { nome: 'Ressarcimento de Custas', percentual: 0, valor: 0 }, { nome: 'Despesas Bancárias / Tarifas', percentual: 0, valor: 0 }, { nome: 'Outras Deduções / Participações', percentual: 0, valor: 0 },
  ])
  const totalDeducoes = useMemo(() => components.reduce((sum, component) => sum + toNumber(component.valor), 0), [components])
  const liquidoCliente = useMemo(() => Math.max(0, Number((totalAlvara - totalDeducoes).toFixed(2))), [totalAlvara, totalDeducoes])

  function updatePercent(index: number, percentual: number) { setComponents((current) => current.map((item, i) => i === index ? { ...item, percentual, valor: totalAlvara > 0 ? Number(((totalAlvara * percentual) / 100).toFixed(2)) : 0 } : item)) }
  function updateValue(index: number, valor: number) { setComponents((current) => current.map((item, i) => i === index ? { ...item, valor, percentual: totalAlvara > 0 ? Number(((valor / totalAlvara) * 100).toFixed(4)) : 0 } : item)) }
  function changeTotal(value: number) { const previous = totalAlvara; setTotalAlvara(value); setBaseCalculo((current) => current === 0 || current === previous ? value : current); setComponents((current) => current.map((item) => ({ ...item, valor: value > 0 ? Number(((value * item.percentual) / 100).toFixed(2)) : 0 }))) }

  async function save(status: 'rascunho' | 'enviado_tesouraria') {
    if (!processo.trim() || !reclamante.trim() || totalAlvara <= 0) { window.alert('Preencha número do processo, reclamante e valor líquido do alvará.'); return }
    setBusy(true)
    try {
      const ref = await addDoc(collection(db, 'receivables'), { unidade, data, natureza, processo: processo.trim(), reclamada: reclamada.trim(), reclamante: reclamante.trim(), origem, formaRecebimento: formaRecebimento.trim(), dataPrevista, valorAlvara: totalAlvara, baseCalculo, valorLiquidoCliente: liquidoCliente, totalDeducoes, components, banco, agencia, conta, titular, cpf, emailNf, enderecoNf, status, createdBy: profile?.uid, createdByName: profile?.displayName, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await writeAudit(profile, status === 'rascunho' ? 'Receita salva como rascunho' : 'Receita enviada à Tesouraria', 'Recebimento de Alvarás', `Processo ${processo} — ${money.format(totalAlvara)}`, ref.id)
      onClose()
    } catch (error) { console.error(error); window.alert('Não foi possível salvar a receita.') } finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><section className="modal-sheet legacy-sheet revenue-sheet"><div className="modal-toolbar"><div><span className="eyebrow revenue-text">Recebimento de Alvarás</span><h2>Demonstrativo de Recebimento de Honorários</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><div className="legacy-title-block revenue-title"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE RECEBIMENTO DE HONORÁRIOS</span></div>
    <h3 className="form-section-title">Dados do Processo</h3><div className="form-grid compact-grid"><label><span>Unidade</span><select value={unidade} onChange={(e) => setUnidade(e.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label><label><span>Data</span><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label><label><span>Natureza</span><select value={natureza} onChange={(e) => setNatureza(e.target.value)}><option>Trabalhista</option><option>Cível</option></select></label><label className="span-2"><span>Número do processo</span><input value={processo} onChange={(e) => setProcesso(e.target.value)} /></label><label className="span-2"><span>Reclamada</span><input value={reclamada} onChange={(e) => setReclamada(e.target.value)} /></label><label className="span-2"><span>Reclamante</span><input value={reclamante} onChange={(e) => setReclamante(e.target.value)} /></label><label><span>Origem</span><select value={origem} onChange={(e) => setOrigem(e.target.value)}><option>Alvará</option><option>Acordo</option></select></label><label><span>Forma de recebimento</span><input value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)} /></label><label><span>Data prevista</span><input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} /></label></div>
    <h3 className="form-section-title">Composição do Valor</h3><div className="composition-table"><div className="composition-row composition-head"><span>Componente</span><span>Percentual (%)</span><span>Valor (R$)</span></div><div className="composition-row total-row"><strong>Valor Líquido do Alvará</strong><span>100%</span><input type="number" min="0" step="0.01" value={totalAlvara || ''} onChange={(e) => changeTotal(Number(e.target.value))} /></div><div className="composition-row"><strong>Base Cálculo Honorários (Valor Bruto)</strong><span>editável</span><input type="number" min="0" step="0.01" value={baseCalculo || ''} onChange={(e) => setBaseCalculo(Number(e.target.value))} /></div>{components.map((component, index) => <div className="composition-row" key={component.nome}><span>{component.nome}</span><input type="number" min="0" step="0.01" value={component.percentual || ''} onChange={(e) => updatePercent(index, Number(e.target.value))} /><input type="number" min="0" step="0.01" value={component.valor || ''} onChange={(e) => updateValue(index, Number(e.target.value))} /></div>)}<div className="composition-row deductions-row"><strong>Total de descontos / repasses</strong><span>—</span><strong>{money.format(totalDeducoes)}</strong></div><div className="composition-row client-row"><strong>VALOR LÍQUIDO DEVIDO AO CLIENTE</strong><span>automático</span><strong>{money.format(liquidoCliente)}</strong></div></div>
    <h3 className="form-section-title">Dados bancários para crédito do cliente</h3><div className="form-grid compact-grid"><label><span>Banco</span><input value={banco} onChange={(e) => setBanco(e.target.value)} /></label><label><span>Agência</span><input value={agencia} onChange={(e) => setAgencia(e.target.value)} /></label><label><span>Conta</span><input value={conta} onChange={(e) => setConta(e.target.value)} /></label><label className="span-2"><span>Nome / Titular</span><input value={titular} onChange={(e) => setTitular(e.target.value)} /></label><label><span>CPF</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} /></label></div><h3 className="form-section-title">Dados para emissão de Nota Fiscal</h3><div className="form-grid compact-grid"><label className="span-2"><span>Endereço</span><input value={enderecoNf} onChange={(e) => setEnderecoNf(e.target.value)} /></label><label><span>E-mail</span><input type="email" value={emailNf} onChange={(e) => setEmailNf(e.target.value)} /></label></div><div className="document-zone disabled-zone revenue-zone"><Paperclip size={19} /><div><strong>Alvará, acordo e documentos do processo</strong><span>Upload será ativado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="outline-revenue-button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button><button className="revenue-button" disabled={busy} onClick={() => save('enviado_tesouraria')}><Send size={17} /> Enviar à Tesouraria</button></div>
  </section></div>
}

export function ReceivablesPageReview() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('receivables')
  useEffect(() => { if (params.get('novo') === '1') setOpen(true) }, [params])
  const filtered = records.filter((item) => `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.reclamada ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setParams({}) }
  return <><PageHeader eyebrow="Origem do recebimento" title="Recebimento de Alvarás" description="O departamento de origem preenche o demonstrativo completo e envia o documento pronto à Tesouraria." actions={<><button className="outline-revenue-button" type="button"><FileText size={18} /> Extrato de Receitas</button><button className="revenue-button" type="button" onClick={() => setOpen(true)}><Plus size={18} /> Nova Receita</button></>} /><section className="page-card module-card revenue-module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por processo, reclamante ou reclamada" /></div><StatusBadge value="Receita = azul" tone="revenue" /></div>{loading ? <EmptyState icon={RefreshCw} title="Carregando receitas" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={BadgeDollarSign} title="Nenhuma receita cadastrada" text="Clique em Nova Receita para preencher o demonstrativo." /> : <div className="data-table"><div className="data-row data-head"><span>Processo</span><span>Partes</span><span>Origem</span><span>Status</span><span className="numeric">Valor</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span><strong>{item.processo || '—'}</strong><small>{item.natureza || ''}</small></span><span><strong>{item.reclamante || '—'}</strong><small>{item.reclamada || ''}</small></span><span>{item.origem || '—'}</span><span><StatusBadge value={receivableStatusLabels[item.status] || item.status || '—'} tone="revenue" /></span><span className="numeric revenue-text"><strong>{money.format(toNumber(item.valorAlvara))}</strong></span></div>)}</div>}</section>{open && <ReceivableModalReview key="nova-receita" onClose={close} />}</>
}

export function ApprovalsPageReview() {
  const { profile } = useAuth()
  const { records } = useLiveCollection('expenses')
  const queue = records.filter((item) => ['enviado_aprovacao', 'em_analise'].includes(item.status))

  async function decide(item: AnyRecord, status: 'aprovado' | 'devolvido' | 'rejeitado') {
    if (status === 'rejeitado') {
      const confirmed = window.confirm('Tem certeza de que deseja REJEITAR esta despesa? Ela sairá da fila de aprovação.')
      if (!confirmed) return
    }
    const note = status === 'devolvido' || status === 'rejeitado' ? window.prompt(status === 'devolvido' ? 'Informe o que precisa ser corrigido:' : 'Informe a justificativa da rejeição:') : ''
    if ((status === 'devolvido' || status === 'rejeitado') && !note) return
    await updateDoc(doc(db, 'expenses', item.id), { status, approvalNote: note || null, decisionBy: profile?.uid, decisionByName: profile?.displayName, decisionAt: serverTimestamp(), updatedAt: serverTimestamp(), ...(status === 'aprovado' ? { approvedAt: serverTimestamp() } : {}) })
    await writeAudit(profile, `Despesa: ${expenseStatusLabels[status]}`, 'Aprovações', `${item.nome ?? 'Despesa'} — ${money.format(toNumber(item.valorTotal))}`, item.id)
  }

  return <><PageHeader eyebrow="Diretoria" title="Aprovações" description="Somente itens efetivamente enviados ou reenviados ficam nesta fila. Despesas devolvidas aguardam correção na Tesouraria." /><section className="page-card module-card approval-card">{queue.length === 0 ? <EmptyState icon={FileCheck2} title="Nenhuma aprovação pendente" text="As despesas enviadas ou reenviadas pela Tesouraria aparecerão nesta fila." /> : <div className="approval-list">{queue.map((item) => <article className="approval-item" key={item.id}><div><StatusBadge value={expenseStatusLabels[item.status] || item.status} tone="expense" /><h3>{item.nome || 'Demonstrativo de despesa'}</h3><p>{item.fornecedor || 'Sem fornecedor informado'} · {item.competencia || 'Sem competência'} · {item.categoria || 'Sem categoria'}</p></div><strong className="expense-text">{money.format(toNumber(item.valorTotal))}</strong><div className="row-actions"><button className="small-success-button" onClick={() => decide(item, 'aprovado')}><BadgeCheck size={15} /> Aprovar</button><button className="small-neutral-button" onClick={() => decide(item, 'devolvido')}>Devolver</button><button className="small-expense-button" onClick={() => decide(item, 'rejeitado')}>Rejeitar</button></div></article>)}</div>}</section></>
}

export function UsersPageReview() {
  const { profile } = useAuth()
  const { records, loading } = useLiveCollection('users')
  const { records: invites } = useLiveCollection('userInvites')
  const canManage = profile?.role === 'master' || profile?.role === 'admin'
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('consulta')
  const [inviteMessage, setInviteMessage] = useState('')

  async function updateUser(item: AnyRecord, field: 'role' | 'status', value: string) {
    if (!canManage || item.email === PRIMARY_ADMIN_EMAIL) return
    await updateDoc(doc(db, 'users', item.id), { [field]: value, updatedAt: serverTimestamp(), updatedBy: profile?.uid })
    await writeAudit(profile, `Usuário atualizado: ${field}`, 'Usuários', `${item.email} → ${value}`, item.id)
  }

  async function createInvite() {
    if (!inviteEmail.trim()) return
    const email = inviteEmail.trim().toLowerCase()
    await addDoc(collection(db, 'userInvites'), { name: inviteName.trim(), email, suggestedRole: inviteRole, status: 'convidado', invitedBy: profile?.uid, invitedByName: profile?.displayName, createdAt: serverTimestamp() })
    const text = `Você foi convidado para o Controle de Despesas e Receitas da AM. Acesse ${window.location.origin} e clique em "Primeiro acesso? Solicitar cadastro" usando o e-mail ${email}.`
    try { await navigator.clipboard.writeText(text); setInviteMessage('Convite registrado e texto copiado para a área de transferência.') } catch { setInviteMessage('Convite registrado. Envie o link do sistema ao usuário para ele solicitar o cadastro.') }
    await writeAudit(profile, 'Convite de usuário criado', 'Usuários', `${email} · ${roleLabels[inviteRole]}`)
    setInviteName(''); setInviteEmail(''); setInviteRole('consulta'); setInviteOpen(false)
  }

  return <><PageHeader eyebrow="Acesso e segurança" title="Usuários e Permissões" description="Convide usuários, aprove cadastros, defina perfis e controle ativação ou bloqueio." actions={<><StatusBadge value={`${records.filter((item) => item.status === 'pending').length} pendente(s)`} tone="warning" /><button className="revenue-button" type="button" onClick={() => setInviteOpen(true)}><MailPlus size={17} /> Convidar usuário</button></>} />
    {inviteMessage && <div className="user-invite-feedback" role="status">{inviteMessage}</div>}
    <section className="page-card user-onboarding-box"><div className="user-onboarding-icon"><Users size={26} /></div><div><h2>Fluxo de cadastro</h2><p>O convite registra nome, e-mail e perfil sugerido. O usuário cria a própria senha no primeiro acesso; depois aparece como <strong>Pendente</strong> e o administrador ativa o cadastro.</p></div></section>
    <section className="page-card module-card users-card">{loading ? <EmptyState icon={RefreshCw} title="Carregando usuários" text="Consultando perfis..." /> : <div className="data-table users-table"><div className="data-row data-head"><span>Usuário</span><span>Perfil</span><span>Status</span><span>Último acesso</span></div>{records.map((item) => { const locked = item.email === PRIMARY_ADMIN_EMAIL; return <div className="data-row" key={item.id}><span><strong>{item.displayName || 'Usuário'}</strong><small>{item.email}</small>{locked && <em className="master-lock"><ShieldCheck size={13} /> Administrador principal</em>}</span><span>{canManage && !locked ? <select value={item.role || 'consulta'} onChange={(e) => updateUser(item, 'role', e.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <StatusBadge value={roleLabels[(item.role as UserRole) || 'consulta'] || item.role} />}</span><span>{canManage && !locked ? <select value={item.status || 'pending'} onChange={(e) => updateUser(item, 'status', e.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <StatusBadge value={locked ? 'Ativo' : statusLabels[(item.status as UserStatus) || 'pending']} tone={item.status === 'active' || locked ? 'success' : item.status === 'pending' ? 'warning' : 'neutral'} />}</span><span>{timestampToDateTime(item.lastLoginAt)}</span></div>})}</div>}</section>
    <section className="page-card invites-card"><div className="card-title-row"><div><h2>Convites enviados</h2><p>Pré-cadastros aguardando o primeiro acesso do usuário.</p></div><StatusBadge value={`${invites.length} convite(s)`} tone="revenue" /></div>{invites.length === 0 ? <EmptyState icon={MailPlus} title="Nenhum convite enviado" text="Use o botão Convidar usuário para iniciar um novo cadastro." /> : <div className="invite-list">{[...invites].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)).map((invite) => { const registered = records.some((user) => String(user.email).toLowerCase() === String(invite.email).toLowerCase()); return <article key={invite.id}><div><strong>{invite.name || invite.email}</strong><span>{invite.email}</span><small>{roleLabels[(invite.suggestedRole as UserRole) || 'consulta']} · {timestampToDateTime(invite.createdAt)}</small></div><StatusBadge value={registered ? 'Cadastrado' : 'Aguardando cadastro'} tone={registered ? 'success' : 'warning'} /></article>})}</div>}</section>
    {inviteOpen && <div className="modal-backdrop"><section className="invite-modal"><div className="modal-toolbar"><div><span className="eyebrow">Usuários</span><h2>Convidar usuário</h2></div><button className="icon-button" onClick={() => setInviteOpen(false)}><X size={20} /></button></div><div className="form-grid section-gap"><label><span>Nome</span><input value={inviteName} onChange={(e) => setInviteName(e.target.value)} /></label><label><span>E-mail</span><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label><label><span>Perfil sugerido</span><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}>{Object.entries(roleLabels).filter(([value]) => value !== 'master').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setInviteOpen(false)}>Cancelar</button><button className="revenue-button" onClick={createInvite}><MailPlus size={17} /> Registrar convite</button></div></section></div>}
  </>
}
