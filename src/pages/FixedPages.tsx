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
  Calculator,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  Filter,
  LockKeyhole,
  Paperclip,
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
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useAuth, type UserRole, type UserStatus } from '../auth/AuthContext'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTimeBR = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const PRIMARY_ADMIN_EMAIL = 'fernandoazeredo64@gmail.com'

type AnyRecord = { id: string } & DocumentData

type ExpenseItem = {
  data: string
  historico: string
  valor: string
}

type RevenueComponent = {
  nome: string
  percentual: number
  valor: number
}

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
  pending: 'Pendente',
  active: 'Ativo',
  inactive: 'Inativo',
  blocked: 'Bloqueado',
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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, name), (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsubscribe
  }, [name])

  return { records, loading }
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseBRL(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/R\$/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function formatCurrencyFromDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return money.format(Number(digits) / 100)
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
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="quick-actions">{actions}</div>}
    </div>
  )
}

function StatusBadge({ value, tone = 'neutral' }: { value: string; tone?: 'expense' | 'revenue' | 'success' | 'warning' | 'neutral' }) {
  return <span className={`status-badge ${tone}`}>{value}</span>
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return (
    <div className="module-empty">
      <Icon size={34} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [unidade, setUnidade] = useState<'RJ' | 'SP'>('RJ')
  const [nome, setNome] = useState('')
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [fornecedor, setFornecedor] = useState('')
  const [documento, setDocumento] = useState('')
  const [categoria, setCategoria] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [items, setItems] = useState<ExpenseItem[]>([
    { data: new Date().toISOString().slice(0, 10), historico: '', valor: '' },
    { data: '', historico: '', valor: '' },
    { data: '', historico: '', valor: '' },
  ])
  const total = useMemo(() => items.reduce((sum, item) => sum + parseBRL(item.valor), 0), [items])

  if (!open) return null

  function updateItem(index: number, field: keyof ExpenseItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  async function save(status: 'rascunho' | 'enviado_aprovacao') {
    const validItems = items.filter((item) => item.historico.trim() || parseBRL(item.valor) > 0)
    if (!nome.trim() || !validItems.length || total <= 0) {
      window.alert('Preencha o nome/responsável e pelo menos uma linha de despesa com histórico e valor.')
      return
    }

    setBusy(true)
    try {
      const payload = {
        unidade,
        nome: nome.trim(),
        competencia,
        fornecedor: fornecedor.trim(),
        documento: documento.trim(),
        categoria,
        subcategoria,
        classificacaoContabil: classificacao || null,
        observacoes: observacoes.trim(),
        items: validItems.map((item) => ({ ...item, valor: parseBRL(item.valor) })),
        valorTotal: total,
        status,
        createdBy: profile?.uid,
        createdByName: profile?.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'expenses'), payload)
      await writeAudit(profile, status === 'rascunho' ? 'Despesa salva como rascunho' : 'Despesa enviada para aprovação', 'Despesas', `${nome} — ${money.format(total)}`, ref.id)
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar a despesa. Confira sua conexão e permissão de acesso.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-sheet legacy-sheet expense-sheet" role="dialog" aria-modal="true" aria-label="Novo demonstrativo de despesas">
        <div className="modal-toolbar">
          <div><span className="eyebrow expense-text">Tesouraria</span><h2>Demonstrativo de Despesas</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="legacy-title-block"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE DESPESAS</span></div>

        <div className="form-grid compact-grid">
          <label><span>Unidade</span><select value={unidade} onChange={(e) => setUnidade(e.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label>
          <label className="span-2"><span>Nome / Responsável</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do responsável pela despesa" /></label>
          <label><span>Competência</span><input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></label>
          <label className="span-2"><span>Fornecedor / Favorecido</span><input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} /></label>
          <label><span>CPF / CNPJ</span><input value={documento} onChange={(e) => setDocumento(e.target.value)} /></label>
        </div>

        <div className="legacy-table expense-table">
          <div className="legacy-row legacy-head"><span>DATA</span><span>HISTÓRICO</span><span>VALOR</span><span></span></div>
          {items.map((item, index) => (
            <div className="legacy-row" key={index}>
              <input type="date" value={item.data} onChange={(e) => updateItem(index, 'data', e.target.value)} />
              <input value={item.historico} onChange={(e) => updateItem(index, 'historico', e.target.value)} placeholder="Descrição da despesa" />
              <input inputMode="numeric" value={item.valor} onChange={(e) => updateItem(index, 'valor', formatCurrencyFromDigits(e.target.value))} placeholder="R$ 0,00" aria-label="Valor da despesa" />
              <button type="button" className="row-remove" title="Remover linha" onClick={() => setItems((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="add-row-button expense-text" onClick={() => setItems((current) => [...current, { data: '', historico: '', valor: '' }])}><Plus size={16} /> Adicionar linha</button>
        <p className="form-note expense-mask-note">Digite apenas os números: 150000 será exibido imediatamente como R$ 1.500,00.</p>

        <div className="form-grid compact-grid section-gap">
          <label><span>Categoria</span><select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Selecionar</option><option>Impostos, Tributos e Encargos</option><option>Folha de Pagamento e Pessoal</option><option>Contas a Pagar - Operacionais</option><option>Honorários, Comissões e Participações</option><option>Reembolsos e Despesas de Representação</option><option>Despesas Extraordinárias / Não Recorrentes</option></select></label>
          <label><span>Subcategoria</span><input value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} placeholder="Ex.: Energia, Aluguel, FGTS..." /></label>
          <label><span>Classificação de Contas <small>(opcional)</small></span><input value={classificacao} onChange={(e) => setClassificacao(e.target.value)} placeholder="Código / conta" /></label>
          <label className="span-3"><span>OBS.</span><textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></label>
        </div>

        <div className="document-zone disabled-zone"><Paperclip size={19} /><div><strong>Documentos comprobatórios</strong><span>Upload de boleto, nota fiscal e comprovante será habilitado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div>

        <div className="legacy-total"><span>Total da Despesa</span><strong>{money.format(total)}</strong></div>
        <div className="approval-strip"><span>Visto / Aprovações</span><em>Será preenchido eletronicamente após o envio à Diretoria.</em></div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="outline-expense-button" type="button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button>
          <button className="expense-button" type="button" disabled={busy} onClick={() => save('enviado_aprovacao')}><Send size={17} /> Enviar para Aprovação</button>
        </div>
      </section>
    </div>
  )
}

function ReceivableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  if (!open) return null

  function updatePercent(index: number, percentual: number) {
    setComponents((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, percentual, valor: totalAlvara > 0 ? Number(((totalAlvara * percentual) / 100).toFixed(2)) : 0 }
      : item))
  }

  function updateValue(index: number, valor: number) {
    setComponents((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, valor, percentual: totalAlvara > 0 ? Number(((valor / totalAlvara) * 100).toFixed(4)) : 0 }
      : item))
  }

  function changeTotal(value: number) {
    const previousTotal = totalAlvara
    setTotalAlvara(value)
    setBaseCalculo((current) => current === 0 || current === previousTotal ? value : current)
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
      await writeAudit(profile, status === 'rascunho' ? 'Recebimento salvo como rascunho' : 'Recebimento enviado à Tesouraria', 'Recebimento de Alvarás', `Processo ${processo} — ${money.format(totalAlvara)}`, ref.id)
      onClose()
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível salvar o recebimento. Confira sua conexão e permissão de acesso.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-sheet legacy-sheet revenue-sheet" role="dialog" aria-modal="true" aria-label="Novo demonstrativo de recebimento de honorários">
        <div className="modal-toolbar">
          <div><span className="eyebrow revenue-text">Recebimento de Alvarás</span><h2>Demonstrativo de Recebimento de Honorários</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="legacy-title-block revenue-title"><strong>TESOURARIA AM NOVO</strong><span>DEMONSTRATIVO DE RECEBIMENTO DE HONORÁRIOS</span></div>

        <h3 className="form-section-title">Dados do Processo</h3>
        <div className="form-grid compact-grid">
          <label><span>Unidade</span><select value={unidade} onChange={(e) => setUnidade(e.target.value as 'RJ' | 'SP')}><option>RJ</option><option>SP</option></select></label>
          <label><span>Data</span><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
          <label><span>Natureza</span><select value={natureza} onChange={(e) => setNatureza(e.target.value)}><option>Trabalhista</option><option>Cível</option></select></label>
          <label className="span-2"><span>Número do processo</span><input value={processo} onChange={(e) => setProcesso(e.target.value)} /></label>
          <label className="span-2"><span>Reclamada</span><input value={reclamada} onChange={(e) => setReclamada(e.target.value)} /></label>
          <label className="span-2"><span>Reclamante</span><input value={reclamante} onChange={(e) => setReclamante(e.target.value)} /></label>
          <label><span>Origem</span><select value={origem} onChange={(e) => setOrigem(e.target.value)}><option>Alvará</option><option>Acordo</option></select></label>
          <label><span>Forma de recebimento</span><input value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)} /></label>
          <label><span>Data prevista</span><input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} /></label>
        </div>

        <h3 className="form-section-title">Composição do Valor</h3>
        <div className="composition-table">
          <div className="composition-row composition-head"><span>Componente</span><span>Percentual (%)</span><span>Valor (R$)</span></div>
          <div className="composition-row total-row"><strong>Valor Líquido do Alvará</strong><span>100%</span><input type="number" min="0" step="0.01" value={totalAlvara || ''} onChange={(e) => changeTotal(Number(e.target.value))} /></div>
          <div className="composition-row"><strong>Base Cálculo Honorários (Valor Bruto)</strong><span>editável</span><input type="number" min="0" step="0.01" value={baseCalculo || ''} onChange={(e) => setBaseCalculo(Number(e.target.value))} /></div>
          {components.map((component, index) => (
            <div className="composition-row" key={component.nome}>
              <span>{component.nome}</span>
              <input type="number" min="0" step="0.01" value={component.percentual || ''} onChange={(e) => updatePercent(index, Number(e.target.value))} />
              <input type="number" min="0" step="0.01" value={component.valor || ''} onChange={(e) => updateValue(index, Number(e.target.value))} />
            </div>
          ))}
          <div className="composition-row deductions-row"><strong>Total de descontos / repasses</strong><span>—</span><strong>{money.format(totalDeducoes)}</strong></div>
          <div className="composition-row client-row"><strong>VALOR LÍQUIDO DEVIDO AO CLIENTE</strong><span>automático</span><strong>{money.format(liquidoCliente)}</strong></div>
        </div>
        <p className="form-note">A Base de Cálculo inicia automaticamente com o valor do alvará, mas continua editável. Percentual e valor dos componentes são vinculados entre si. O líquido do cliente é calculado automaticamente: valor do alvará menos descontos/repasses.</p>

        <h3 className="form-section-title">Dados bancários para crédito do cliente</h3>
        <div className="form-grid compact-grid">
          <label><span>Banco</span><input value={banco} onChange={(e) => setBanco(e.target.value)} /></label>
          <label><span>Agência</span><input value={agencia} onChange={(e) => setAgencia(e.target.value)} /></label>
          <label><span>Conta</span><input value={conta} onChange={(e) => setConta(e.target.value)} /></label>
          <label className="span-2"><span>Nome / Titular</span><input value={titular} onChange={(e) => setTitular(e.target.value)} /></label>
          <label><span>CPF</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} /></label>
        </div>

        <h3 className="form-section-title">Dados para emissão de Nota Fiscal</h3>
        <div className="form-grid compact-grid">
          <label className="span-2"><span>Endereço</span><input value={enderecoNf} onChange={(e) => setEnderecoNf(e.target.value)} /></label>
          <label><span>E-mail</span><input type="email" value={emailNf} onChange={(e) => setEmailNf(e.target.value)} /></label>
        </div>

        <div className="document-zone disabled-zone revenue-zone"><Paperclip size={19} /><div><strong>Alvará, acordo e documentos do processo</strong><span>Upload será ativado assim que o Storage estiver disponível.</span></div><LockKeyhole size={17} /></div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="outline-revenue-button" type="button" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button>
          <button className="revenue-button" type="button" disabled={busy} onClick={() => save('enviado_tesouraria')}><Send size={17} /> Enviar à Tesouraria</button>
        </div>
      </section>
    </div>
  )
}

export function ExpensesPageFixed() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('expenses')
  useEffect(() => { if (params.get('novo') === '1') setOpen(true) }, [params])
  const filtered = records.filter((item) => `${item.nome ?? ''} ${item.fornecedor ?? ''} ${item.competencia ?? ''} ${item.categoria ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setParams({}) }

  return (
    <>
      <PageHeader eyebrow="Tesouraria" title="Despesas" description="Criação do demonstrativo tradicional, envio para aprovação, acompanhamento de status e extrato de despesas." actions={<><button className="outline-expense-button" type="button"><FileText size={18} /> Extrato de Despesas</button><button className="expense-button" type="button" onClick={() => setOpen(true)}><Plus size={18} /> Nova Despesa</button></>} />
      <section className="page-card module-card expense-module-card">
        <div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por responsável, fornecedor, competência ou categoria" /></div><button className="secondary-button"><Filter size={17} /> Filtros</button></div>
        {loading ? <EmptyState icon={RefreshCw} title="Carregando despesas" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={ReceiptText} title="Nenhuma despesa encontrada" text="Clique em Nova Despesa para preencher o primeiro demonstrativo." /> : <div className="data-table"><div className="data-row data-head"><span>Competência</span><span>Responsável / Favorecido</span><span>Categoria</span><span>Status</span><span className="numeric">Valor</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span>{item.competencia || '—'}</span><span><strong>{item.nome || 'Sem nome'}</strong><small>{item.fornecedor || ''}</small></span><span>{item.categoria || 'Não classificada'}</span><span><StatusBadge value={expenseStatusLabels[item.status] || item.status || '—'} tone="expense" /></span><span className="numeric expense-text"><strong>{money.format(toNumber(item.valorTotal))}</strong></span></div>)}</div>}
      </section>
      <ExpenseModal open={open} onClose={close} />
    </>
  )
}

export function ReceivablesPageFixed() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')
  const [search, setSearch] = useState('')
  const { records, loading } = useLiveCollection('receivables')
  useEffect(() => { if (params.get('novo') === '1') setOpen(true) }, [params])
  const filtered = records.filter((item) => `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.reclamada ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const close = () => { setOpen(false); setParams({}) }

  return (
    <>
      <PageHeader eyebrow="Origem do recebimento" title="Recebimento de Alvarás" description="O departamento de origem preenche o demonstrativo completo e envia o documento pronto à Tesouraria." actions={<><button className="outline-revenue-button" type="button"><FileText size={18} /> Extrato de Receitas</button><button className="revenue-button" type="button" onClick={() => setOpen(true)}><Plus size={18} /> Nova Receita</button></>} />
      <section className="page-card module-card revenue-module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por processo, reclamante ou reclamada" /></div><StatusBadge value="Receita = azul" tone="revenue" /></div>{loading ? <EmptyState icon={RefreshCw} title="Carregando recebimentos" text="Consultando o Firestore..." /> : filtered.length === 0 ? <EmptyState icon={BadgeDollarSign} title="Nenhuma receita cadastrada" text="Clique em Nova Receita para preencher o demonstrativo de honorários." /> : <div className="data-table"><div className="data-row data-head"><span>Processo</span><span>Partes</span><span>Origem</span><span>Status</span><span className="numeric">Valor</span></div>{filtered.map((item) => <div className="data-row" key={item.id}><span><strong>{item.processo || '—'}</strong><small>{item.natureza || ''}</small></span><span><strong>{item.reclamante || '—'}</strong><small>{item.reclamada || ''}</small></span><span>{item.origem || '—'}</span><span><StatusBadge value={receivableStatusLabels[item.status] || item.status || '—'} tone="revenue" /></span><span className="numeric revenue-text"><strong>{money.format(toNumber(item.valorAlvara))}</strong></span></div>)}</div>}</section>
      <ReceivableModal open={open} onClose={close} />
    </>
  )
}

export function AccountingPageFixed() {
  const { profile } = useAuth()
  const { records: expenses } = useLiveCollection('expenses')
  const { records: receivables } = useLiveCollection('receivables')
  const { records: dispatches } = useLiveCollection('accountingDispatches')
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7))
  const [unit, setUnit] = useState('Todas')
  const [movement, setMovement] = useState('Despesas + Recebimentos')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const approvedExpenses = expenses.filter((item) => ['aprovado', 'pago', 'arquivado'].includes(item.status) && item.competencia === competence && (unit === 'Todas' || item.unidade === unit))
  const finishedReceivables = receivables.filter((item) => ['recebido_tesouraria', 'encerrado'].includes(item.status) && String(item.data ?? '').slice(0, 7) === competence && (unit === 'Todas' || item.unidade === unit))

  const includeExpenses = movement !== 'Somente Recebimentos'
  const includeReceivables = movement !== 'Somente Despesas'
  const expenseCount = includeExpenses ? approvedExpenses.length : 0
  const receivableCount = includeReceivables ? finishedReceivables.length : 0
  const expenseTotal = includeExpenses ? approvedExpenses.reduce((sum, item) => sum + toNumber(item.valorTotal), 0) : 0
  const revenueTotal = includeReceivables ? finishedReceivables.reduce((sum, item) => sum + toNumber(item.valorAlvara), 0) : 0

  const orderedDispatches = [...dispatches].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

  async function sendMovement() {
    if (expenseCount + receivableCount === 0) {
      setMessage('Nenhum lançamento apto foi encontrado para a competência e filtros selecionados.')
      return
    }
    const confirmed = window.confirm(`Registrar o movimento ${competence} como enviado à Contabilidade?`)
    if (!confirmed) return

    setBusy(true)
    setMessage('')
    try {
      const ref = await addDoc(collection(db, 'accountingDispatches'), {
        competence,
        unit,
        movement,
        expenseCount,
        receivableCount,
        expenseTotal,
        revenueTotal,
        status: 'enviado',
        sentBy: profile?.uid,
        sentByName: profile?.displayName,
        sentByEmail: profile?.email,
        createdAt: serverTimestamp(),
      })
      await writeAudit(profile, 'Movimento registrado como enviado à Contabilidade', 'Contabilidade', `${competence} · ${expenseCount} despesa(s) · ${receivableCount} receita(s)`, ref.id)
      setMessage('Movimento registrado com sucesso. O histórico foi atualizado abaixo. O ZIP e o link seguro continuam aguardando o Storage.')
    } catch (error) {
      console.error(error)
      setMessage('Não foi possível registrar o envio. Confira sua conexão e permissão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Fechamento mensal" title="Contabilidade" description="Conferência do movimento, preparação do pacote mensal e histórico de envio para o contador." />
      <section className="page-card accounting-panel">
        <div className="accounting-config">
          <label><span>Competência</span><input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} /></label>
          <label><span>Unidade</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>Todas</option><option>RJ</option><option>SP</option></select></label>
          <label><span>Movimento</span><select value={movement} onChange={(e) => setMovement(e.target.value)}><option>Despesas + Recebimentos</option><option>Somente Despesas</option><option>Somente Recebimentos</option></select></label>
        </div>
        <div className="readiness-grid"><article><ReceiptText /><span>Despesas aptas</span><strong>{expenseCount}</strong><small>{money.format(expenseTotal)}</small></article><article><BadgeDollarSign /><span>Receitas aptas</span><strong>{receivableCount}</strong><small>{money.format(revenueTotal)}</small></article><article><Paperclip /><span>Documentos no Storage</span><strong>0</strong><small>Pendente Blaze</small></article><article><CheckCircle2 /><span>Classificação</span><strong>Opcional</strong></article></div>
        <div className="warning-box"><AlertTriangle size={18} /><span>O pacote ZIP e o link seguro serão liberados quando o Storage estiver ativo. O registro eletrônico do envio já funciona independentemente do Storage.</span></div>
        {message && <div className={`accounting-feedback ${message.startsWith('Movimento registrado') ? 'success' : 'warning'}`} role="status">{message}</div>}
        <div className="accounting-actions"><button className="secondary-button" disabled><FileText size={17} /> Baixar ZIP</button><button className="secondary-button" disabled><Send size={17} /> Gerar link para Contabilidade</button><button className="revenue-button" type="button" disabled={busy} onClick={sendMovement}><Calculator size={17} /> {busy ? 'Registrando...' : 'Enviar Movimento à Contabilidade'}</button></div>
      </section>

      <section className="page-card accounting-history-card">
        <div className="card-title-row"><div><h2>Histórico de envios para a Contabilidade</h2><p>Cada confirmação fica registrada com competência, usuário e totais.</p></div><StatusBadge value={`${orderedDispatches.length} envio(s)`} tone="revenue" /></div>
        {orderedDispatches.length === 0 ? <EmptyState icon={Send} title="Nenhum envio registrado" text="O primeiro envio confirmado aparecerá aqui." /> : <div className="accounting-history-list">{orderedDispatches.map((item) => <article key={item.id}><div><strong>{item.competence || '—'} · {item.unit || 'Todas'}</strong><span>{item.movement || 'Movimento mensal'}</span><small>{item.sentByName || item.sentByEmail || 'Usuário'} · {timestampToDateTime(item.createdAt)}</small></div><div className="history-totals"><span>{toNumber(item.expenseCount)} despesa(s) · {money.format(toNumber(item.expenseTotal))}</span><span>{toNumber(item.receivableCount)} receita(s) · {money.format(toNumber(item.revenueTotal))}</span></div><StatusBadge value="Enviado" tone="success" /></article>)}</div>}
      </section>
    </>
  )
}

export function UsersPageFixed() {
  const { profile } = useAuth()
  const { records, loading } = useLiveCollection('users')
  const canManage = profile?.role === 'master' || profile?.role === 'admin'
  const [copied, setCopied] = useState(false)

  async function updateUser(item: AnyRecord, field: 'role' | 'status', value: string) {
    if (!canManage || item.email === PRIMARY_ADMIN_EMAIL) return
    await updateDoc(doc(db, 'users', item.id), { [field]: value, updatedAt: serverTimestamp(), updatedBy: profile?.uid })
    await writeAudit(profile, `Usuário atualizado: ${field}`, 'Usuários', `${item.email} → ${value}`, item.id)
  }

  async function copyAccessLink() {
    await navigator.clipboard.writeText(window.location.origin)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      <PageHeader eyebrow="Acesso e segurança" title="Usuários e Permissões" description="Cadastro por solicitação de acesso, aprovação administrativa, definição de perfil, ativação e bloqueio." actions={<><StatusBadge value={`${records.filter((item) => item.status === 'pending').length} pendente(s)`} tone="warning" /><button className="secondary-button" type="button" onClick={copyAccessLink}><ClipboardCopy size={17} /> {copied ? 'Link copiado' : 'Copiar link para cadastro'}</button></>} />

      <section className="page-card user-onboarding-box">
        <div className="user-onboarding-icon"><Users size={26} /></div>
        <div><h2>Como cadastrar um novo usuário</h2><p>Por segurança, o administrador não cria senha de terceiros. Envie o link do sistema ao usuário; ele escolhe <strong>“Primeiro acesso? Solicitar cadastro”</strong>. O cadastro entra aqui como <strong>Pendente</strong>. Então você escolhe o perfil e muda o status para <strong>Ativo</strong>.</p></div>
        <div className="user-flow"><span>1. Enviar link</span><span>2. Usuário solicita cadastro</span><span>3. Definir perfil</span><span>4. Ativar</span></div>
      </section>

      <section className="page-card module-card users-card">
        {loading ? <EmptyState icon={RefreshCw} title="Carregando usuários" text="Consultando perfis do Firestore..." /> : <div className="data-table users-table"><div className="data-row data-head"><span>Usuário</span><span>Perfil</span><span>Status</span><span>Último acesso</span></div>{records.map((item) => { const locked = item.email === PRIMARY_ADMIN_EMAIL; return <div className="data-row" key={item.id}><span><strong>{item.displayName || 'Usuário'}</strong><small>{item.email}</small>{locked && <em className="master-lock"><ShieldCheck size={13} /> Administrador principal</em>}</span><span>{canManage && !locked ? <select value={item.role || 'consulta'} onChange={(e) => updateUser(item, 'role', e.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <StatusBadge value={roleLabels[(item.role as UserRole) || 'consulta'] || item.role} />}</span><span>{canManage && !locked ? <select value={item.status || 'pending'} onChange={(e) => updateUser(item, 'status', e.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <StatusBadge value={locked ? 'Ativo' : statusLabels[(item.status as UserStatus) || 'pending']} tone={item.status === 'active' || locked ? 'success' : item.status === 'pending' ? 'warning' : 'neutral'} />}</span><span>{timestampToDateTime(item.lastLoginAt)}</span></div>})}</div>}
      </section>
    </>
  )
}
