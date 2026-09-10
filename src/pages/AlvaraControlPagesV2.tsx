import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'
import { BadgeDollarSign, CheckCircle2, FileText, RefreshCw, Search, Send, Users, X } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthContext'

type AnyRecord = { id: string } & DocumentData
type PaymentKind = 'client' | 'agent'
type Installment = { number: number; value: number; dueDate: string; paid: boolean; paidDate: string }

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const today = () => new Date().toISOString().slice(0, 10)
const toNumber = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? number : 0 }
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char))
const dateBr = (value: unknown) => { const text = String(value ?? ''); if (!text) return '—'; const [year, month, day] = text.slice(0, 10).split('-'); return year && month && day ? `${day}/${month}/${year}` : text }

function useCollectionRecords(name: string) {
  const [records, setRecords] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => onSnapshot(collection(db, name), (snapshot) => {
    setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    setLoading(false)
  }, () => setLoading(false)), [name])
  return { records, loading }
}

function componentOf(item: AnyRecord, name: string) {
  const components = Array.isArray(item.components) ? item.components : []
  return components.find((component) => String(component?.nome ?? '').toLowerCase() === name.toLowerCase()) as DocumentData | undefined
}
function componentValue(item: AnyRecord, name: string) { return toNumber(componentOf(item, name)?.valor) }
function componentPercent(item: AnyRecord, name: string) { return toNumber(componentOf(item, name)?.percentual) }
function eligibleReceivable(item: AnyRecord) { return ['recebido_tesouraria', 'encerrado'].includes(String(item.status ?? '')) }

function addMonths(dateValue: string, months: number) {
  if (!dateValue) return ''
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateValue
  const originalDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(originalDay, lastDay))
  return date.toISOString().slice(0, 10)
}

function makeInstallments(amount: number, count: number, firstDueDate: string): Installment[] {
  const safeCount = Math.max(1, Math.min(60, Math.trunc(count || 1)))
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / safeCount)
  let distributed = 0
  return Array.from({ length: safeCount }, (_, index) => {
    const installmentCents = index === safeCount - 1 ? cents - distributed : base
    distributed += installmentCents
    return { number: index + 1, value: installmentCents / 100, dueDate: addMonths(firstDueDate, index), paid: false, paidDate: '' }
  })
}

function sourceAmount(source: AnyRecord, kind: PaymentKind) {
  return kind === 'client' ? toNumber(source.valorLiquidoCliente) : toNumber(source.agentCommissionValue) || componentValue(source, 'Outras Deduções / Participações')
}
function sourceBeneficiary(source: AnyRecord, kind: PaymentKind) { return kind === 'client' ? String(source.titular || source.reclamante || 'Cliente') : String(source.agentName || 'Agente não informado') }
function planPaidValue(plan?: AnyRecord) { return (Array.isArray(plan?.installments) ? plan!.installments : []).reduce((sum: number, item: DocumentData) => sum + (item?.paid ? toNumber(item.value) : 0), 0) }
function statusLabel(plan?: AnyRecord) {
  if (!plan) return 'Aguardando programação'
  const labels: Record<string, string> = { aguardando_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado', rejeitado: 'Rejeitado', parcialmente_pago: 'Parcialmente pago', pago: 'Pago integralmente' }
  return labels[String(plan.status ?? '')] || String(plan.status ?? 'Aguardando programação')
}
function statusClass(plan?: AnyRecord) {
  if (!plan) return 'workflow-neutral'
  if (plan.status === 'pago' || plan.status === 'aprovado') return 'workflow-success'
  if (plan.status === 'rejeitado') return 'workflow-danger'
  if (plan.status === 'aguardando_aprovacao') return 'workflow-warning'
  if (plan.status === 'parcialmente_pago') return 'workflow-info'
  return 'workflow-neutral'
}

async function audit(profile: ReturnType<typeof useAuth>['profile'], module: string, action: string, detail: string, entityId: string) {
  if (!profile) return
  await addDoc(collection(db, 'auditLogs'), { action, module, detail, entityId, userId: profile.uid, userName: profile.displayName, userEmail: profile.email, createdAt: serverTimestamp() })
}

function openPdfPrint(title: string, body: string) {
  const reportWindow = window.open('', '_blank', 'width=1120,height=820')
  if (!reportWindow) { window.alert('O navegador bloqueou a janela do relatório. Libere pop-ups para gerar o PDF.'); return }
  reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:11px}h1{margin:0;text-align:center;font-size:18px}h2{font-size:13px;margin:14px 0 7px}.company{text-align:center;font-weight:700;font-size:12px;margin-bottom:3px}.subtitle{text-align:center;margin:3px 0 14px}.section{page-break-inside:avoid;margin-bottom:18px;border:1px solid #222}.meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #222}.meta div{padding:5px 7px;border-right:1px solid #222;min-height:34px}.meta div:nth-child(4n){border-right:0}.meta b{display:block;font-size:9px;text-transform:uppercase;margin-bottom:3px}.wide{grid-column:span 2}.value{font-weight:700}table{width:100%;border-collapse:collapse}th,td{border:1px solid #222;padding:6px;text-align:left;vertical-align:top}th{background:#efefef;text-align:center;font-size:9px;text-transform:uppercase}.num{text-align:right}.center{text-align:center}.total-row td{font-weight:700;background:#f7f7f7}.summary{margin-top:12px;display:flex;gap:20px;justify-content:flex-end}.summary b{font-size:12px}.footer{margin-top:18px;border-top:1px solid #999;padding-top:6px;color:#555;font-size:9px}.no-data{padding:30px;text-align:center;border:1px solid #ccc}.page-break{page-break-before:always}
  </style></head><body>${body}<div class="footer">TESOURARIA AM NOVO · Controle de Despesas e Receitas · Relatório gerado em ${new Date().toLocaleString('pt-BR')}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`)
  reportWindow.document.close()
}

function generatePaymentPdf(kind: PaymentKind, sources: AnyRecord[], planMap: Map<string, AnyRecord>) {
  const title = kind === 'client' ? 'REPASSE DE ALVARÁS' : 'DEMONSTRATIVO DE RECEBIMENTO - COMISSÃO DE AGENTES'
  if (!sources.length) { window.alert('Não há registros no filtro atual para gerar o relatório.'); return }
  const sections = sources.map((source, index) => {
    const plan = planMap.get(source.id)
    const amount = sourceAmount(source, kind)
    const paid = planPaidValue(plan)
    const installments = Array.isArray(plan?.installments) ? plan!.installments as Installment[] : []
    if (kind === 'agent') {
      const percent = componentPercent(source, 'Outras Deduções / Participações')
      const paidText = plan?.status === 'pago' ? 'Sim' : paid > 0 ? 'Parcial' : 'Não'
      return `<section class="section${index ? ' page-break' : ''}"><div class="meta"><div class="wide"><b>Reclamante</b>${escapeHtml(source.reclamante || '—')}</div><div><b>Data do recebimento</b>${escapeHtml(dateBr(source.data))}</div><div><b>Valor líquido do alvará</b><span class="value">${escapeHtml(money.format(toNumber(source.valorAlvara)))}</span></div><div class="wide"><b>Reclamada</b>${escapeHtml(source.reclamada || '—')}</div><div class="wide"><b>Processo</b>${escapeHtml(source.processo || '—')}</div></div><table><thead><tr><th>Agente</th><th>Comissão</th><th>Valor</th><th>Pago</th><th>Status</th></tr></thead><tbody><tr><td>${escapeHtml(sourceBeneficiary(source, kind))}</td><td class="center">${percent ? `${percent.toLocaleString('pt-BR')}%` : '—'}</td><td class="num">${escapeHtml(money.format(amount))}</td><td class="center">${paidText}</td><td>${escapeHtml(statusLabel(plan))}</td></tr><tr class="total-row"><td colspan="2">TOTAL</td><td class="num">${escapeHtml(money.format(amount))}</td><td colspan="2">Pago: ${escapeHtml(money.format(paid))} · Saldo: ${escapeHtml(money.format(Math.max(0, amount - paid)))}</td></tr></tbody></table>${installments.length ? `<h2>Parcelas</h2><table><thead><tr><th>Nº</th><th>Valor</th><th>Data prevista</th><th>Pago</th><th>Data pagamento</th></tr></thead><tbody>${installments.map((item) => `<tr><td class="center">${item.number}</td><td class="num">${escapeHtml(money.format(toNumber(item.value)))}</td><td class="center">${escapeHtml(dateBr(item.dueDate))}</td><td class="center">${item.paid ? 'Sim' : 'Não'}</td><td class="center">${escapeHtml(dateBr(item.paidDate))}</td></tr>`).join('')}</tbody></table>` : ''}</section>`
    }
    return `<section class="section${index ? ' page-break' : ''}"><div class="meta"><div class="wide"><b>Cliente / Titular</b>${escapeHtml(sourceBeneficiary(source, kind))}</div><div><b>CPF</b>${escapeHtml(source.cpf || '—')}</div><div><b>Valor devido</b><span class="value">${escapeHtml(money.format(amount))}</span></div><div class="wide"><b>Processo</b>${escapeHtml(source.processo || '—')}</div><div><b>Banco</b>${escapeHtml(source.banco || '—')}</div><div><b>Agência / Conta</b>${escapeHtml(`${source.agencia || '—'} / ${source.conta || '—'}`)}</div><div class="wide"><b>Reclamante</b>${escapeHtml(source.reclamante || '—')}</div><div class="wide"><b>Reclamada</b>${escapeHtml(source.reclamada || '—')}</div></div><table><thead><tr><th>Nº</th><th>Valor</th><th>Data prevista</th><th>Pago</th><th>Data pagamento</th></tr></thead><tbody>${installments.length ? installments.map((item) => `<tr><td class="center">${item.number}</td><td class="num">${escapeHtml(money.format(toNumber(item.value)))}</td><td class="center">${escapeHtml(dateBr(item.dueDate))}</td><td class="center">${item.paid ? 'Sim' : 'Não'}</td><td class="center">${escapeHtml(dateBr(item.paidDate))}</td></tr>`).join('') : `<tr><td colspan="5" class="center">Pagamento ainda não programado</td></tr>`}<tr class="total-row"><td colspan="2">TOTAL DEVIDO: ${escapeHtml(money.format(amount))}</td><td colspan="2">JÁ REPASSADO: ${escapeHtml(money.format(paid))}</td><td>SALDO: ${escapeHtml(money.format(Math.max(0, amount - paid)))}</td></tr></tbody></table><div class="summary"><span>Status: <b>${escapeHtml(statusLabel(plan))}</b></span></div></section>`
  }).join('')
  openPdfPrint(title, `<div class="company">TESOURARIA AM NOVO</div><h1>${escapeHtml(title)}</h1><div class="subtitle">Relatório de controle financeiro</div>${sections}`)
}

function SourceSnapshot({ source, kind }: { source: AnyRecord; kind: PaymentKind }) {
  return <div className="obligation-source-grid"><div><span>Processo</span><strong>{source.processo || '—'}</strong></div><div><span>{kind === 'client' ? 'Cliente / Titular' : 'Agente'}</span><strong>{sourceBeneficiary(source, kind)}</strong></div><div><span>Reclamante</span><strong>{source.reclamante || '—'}</strong></div><div><span>Reclamada</span><strong>{source.reclamada || '—'}</strong></div>{kind === 'client' && <><div><span>Banco</span><strong>{source.banco || '—'}</strong></div><div><span>Agência / Conta</span><strong>{source.agencia || '—'} / {source.conta || '—'}</strong></div><div><span>CPF</span><strong>{source.cpf || '—'}</strong></div></>}<div className="obligation-source-value"><span>Valor devido</span><strong>{money.format(sourceAmount(source, kind))}</strong></div></div>
}

function PaymentPlanModal({ source, plan, kind, collectionName, onClose }: { source: AnyRecord; plan?: AnyRecord; kind: PaymentKind; collectionName: string; onClose: () => void }) {
  const { profile } = useAuth()
  const canOperate = profile?.role === 'master' || profile?.role === 'tesouraria'
  const canApprove = profile?.role === 'master' || profile?.role === 'diretor'
  const amount = sourceAmount(source, kind)
  const isExecutionStage = Boolean(plan && ['aprovado', 'parcialmente_pago', 'pago'].includes(String(plan.status)))
  const [paymentType, setPaymentType] = useState<'avista' | 'parcelado'>(plan?.paymentType === 'parcelado' ? 'parcelado' : 'avista')
  const [count, setCount] = useState(Math.max(1, toNumber(plan?.installmentCount) || 1))
  const [firstDueDate, setFirstDueDate] = useState(String(plan?.firstDueDate || today()))
  const [installments, setInstallments] = useState<Installment[]>(() => { const existing = Array.isArray(plan?.installments) ? plan!.installments as Installment[] : []; return existing.length ? existing : makeInstallments(amount, 1, today()) })
  const [approvalNote, setApprovalNote] = useState(String(plan?.approvalNote || ''))
  const [notes, setNotes] = useState(String(plan?.notes || ''))
  const [busy, setBusy] = useState(false)
  const moduleName = kind === 'client' ? 'Repasse de Alvarás' : 'Comissões de Agentes'
  const sum = installments.reduce((total, item) => total + toNumber(item.value), 0)

  function regenerate() { const quantity = paymentType === 'avista' ? 1 : Math.max(2, count); setCount(quantity); setInstallments(makeInstallments(amount, quantity, firstDueDate)) }
  function patchInstallment(index: number, patch: Partial<Installment>) { setInstallments((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)) }

  async function saveSchedule() {
    if (!profile || !canOperate) return
    if (!installments.length || installments.some((item) => !item.dueDate || toNumber(item.value) <= 0)) { window.alert('Informe valor e data de todas as parcelas.'); return }
    if (Math.abs(sum - amount) > 0.02) { window.alert(`A soma das parcelas deve ser igual ao valor devido (${money.format(amount)}).`); return }
    setBusy(true)
    try {
      await setDoc(doc(db, collectionName, source.id), {
        sourceReceivableId: source.id, sourceType: kind === 'client' ? 'repasse_cliente' : 'comissao_agente', processo: source.processo || '', reclamante: source.reclamante || '', reclamada: source.reclamada || '', beneficiary: sourceBeneficiary(source, kind), amountDue: amount,
        paymentType, installmentCount: installments.length, firstDueDate: installments[0]?.dueDate || firstDueDate, installments: installments.map((item, index) => ({ ...item, number: index + 1, paid: false, paidDate: '' })), status: 'aguardando_aprovacao', notes: notes.trim(), approvalNote: '', approvedBy: null, approvedByName: null, approvedAt: null,
        sourceSnapshot: { unidade: source.unidade || '', data: source.data || '', natureza: source.natureza || '', processo: source.processo || '', reclamante: source.reclamante || '', reclamada: source.reclamada || '', origem: source.origem || '', banco: source.banco || '', agencia: source.agencia || '', conta: source.conta || '', titular: source.titular || '', cpf: source.cpf || '', agentName: source.agentName || '', valorLiquidoCliente: toNumber(source.valorLiquidoCliente), agentCommissionValue: sourceAmount(source, 'agent') },
        createdBy: plan?.createdBy || profile.uid, createdByName: plan?.createdByName || profile.displayName, createdAt: plan?.createdAt || serverTimestamp(), updatedBy: profile.uid, updatedByName: profile.displayName, updatedAt: serverTimestamp(),
      }, { merge: false })
      await audit(profile, moduleName, 'Programação enviada para aprovação', `Processo ${source.processo || '—'} — ${sourceBeneficiary(source, kind)} — ${money.format(amount)} em ${installments.length} parcela(s)`, source.id)
      onClose()
    } catch (error) { console.error(error); window.alert('Não foi possível salvar a programação.') } finally { setBusy(false) }
  }

  async function decide(status: 'aprovado' | 'rejeitado') {
    if (!profile || !canApprove || !plan) return
    setBusy(true)
    try {
      await setDoc(doc(db, collectionName, source.id), { status, approvalNote: approvalNote.trim(), approvedBy: profile.uid, approvedByName: profile.displayName, approvedByEmail: profile.email, approvedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
      await audit(profile, moduleName, status === 'aprovado' ? 'Pagamento aprovado' : 'Pagamento rejeitado', `Processo ${source.processo || '—'} — ${money.format(amount)}${approvalNote.trim() ? ` — ${approvalNote.trim()}` : ''}`, source.id)
      onClose()
    } catch (error) { console.error(error); window.alert('Não foi possível registrar a decisão.') } finally { setBusy(false) }
  }

  async function saveExecution() {
    if (!profile || !canOperate || !plan) return
    const paidCount = installments.filter((item) => item.paid).length
    const nextStatus = paidCount === 0 ? 'aprovado' : paidCount === installments.length ? 'pago' : 'parcialmente_pago'
    setBusy(true)
    try {
      await setDoc(doc(db, collectionName, source.id), { installments, status: nextStatus, paidValue: installments.reduce((total, item) => total + (item.paid ? toNumber(item.value) : 0), 0), updatedBy: profile.uid, updatedByName: profile.displayName, updatedAt: serverTimestamp() }, { merge: true })
      await audit(profile, moduleName, 'Execução de pagamento atualizada', `Processo ${source.processo || '—'} — ${paidCount}/${installments.length} parcela(s) paga(s)`, source.id)
      onClose()
    } catch (error) { console.error(error); window.alert('Não foi possível atualizar a execução do pagamento.') } finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><section className="decision-modal obligation-modal" role="dialog" aria-modal="true"><div className="modal-toolbar"><div><span className="eyebrow">{moduleName}</span><h2>{plan ? 'Programação do pagamento' : 'Nova programação'}</h2></div><button className="icon-button" type="button" onClick={onClose}><X size={20} /></button></div><SourceSnapshot source={source} kind={kind} />
    {!isExecutionStage && <><div className="obligation-form-grid"><label><span>Forma de pagamento</span><select value={paymentType} disabled={!canOperate || plan?.status === 'aguardando_aprovacao'} onChange={(event) => { const value = event.target.value as 'avista' | 'parcelado'; setPaymentType(value); if (value === 'avista') setCount(1) }}><option value="avista">À vista</option><option value="parcelado">Parcelado</option></select></label><label><span>Número de parcelas</span><input type="number" min="1" max="60" value={paymentType === 'avista' ? 1 : count} disabled={!canOperate || paymentType === 'avista' || plan?.status === 'aguardando_aprovacao'} onChange={(event) => setCount(Math.max(1, Number(event.target.value)))} /></label><label><span>Primeira data prevista</span><input type="date" value={firstDueDate} disabled={!canOperate || plan?.status === 'aguardando_aprovacao'} onChange={(event) => setFirstDueDate(event.target.value)} /></label></div>{canOperate && plan?.status !== 'aguardando_aprovacao' && <button className="secondary-button obligation-generate" type="button" onClick={regenerate}>Gerar / atualizar parcelas</button>}</>}
    <div className="obligation-installments"><div className="obligation-installment-head"><span>Parcela</span><span>Valor</span><span>Data prevista</span>{isExecutionStage && <><span>Pago</span><span>Data do pagamento</span></>}</div>{installments.map((item, index) => <div className="obligation-installment-row" key={item.number}><strong>{index + 1}/{installments.length}</strong><input type="number" min="0" step="0.01" value={item.value} disabled={isExecutionStage || !canOperate || plan?.status === 'aguardando_aprovacao'} onChange={(event) => patchInstallment(index, { value: Number(event.target.value) })} /><input type="date" value={item.dueDate} disabled={isExecutionStage || !canOperate || plan?.status === 'aguardando_aprovacao'} onChange={(event) => patchInstallment(index, { dueDate: event.target.value })} />{isExecutionStage && <><label className="obligation-paid-check"><input type="checkbox" checked={Boolean(item.paid)} disabled={!canOperate || plan?.status === 'pago'} onChange={(event) => patchInstallment(index, { paid: event.target.checked, paidDate: event.target.checked ? (item.paidDate || today()) : '' })} /><span>{item.paid ? 'Paga' : 'Pendente'}</span></label><input type="date" value={item.paidDate || ''} disabled={!canOperate || !item.paid || plan?.status === 'pago'} onChange={(event) => patchInstallment(index, { paidDate: event.target.value })} /></>}</div>)}<div className="obligation-installment-total"><span>Total programado</span><strong className={Math.abs(sum - amount) > .02 ? 'expense-text' : ''}>{money.format(sum)}</strong></div></div>
    <label className="obligation-notes"><span>Observações</span><textarea rows={3} value={notes} disabled={isExecutionStage || !canOperate || plan?.status === 'aguardando_aprovacao'} onChange={(event) => setNotes(event.target.value)} /></label>
    {plan?.status === 'aguardando_aprovacao' && <div className="obligation-approval-box"><strong>Aprovação do pagamento</strong><span>Flávio é o autorizador oficial. O Administrador Master também pode decidir em homologação.</span><textarea rows={2} placeholder="Observação da aprovação / motivo da rejeição (opcional)" value={approvalNote} disabled={!canApprove} onChange={(event) => setApprovalNote(event.target.value)} /></div>}
    {plan?.approvalNote && plan.status !== 'aguardando_aprovacao' && <div className="obligation-approval-note"><strong>Observação da decisão:</strong> {plan.approvalNote}</div>}
    <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Fechar</button>{canOperate && (!plan || plan.status === 'rejeitado') && <button className="revenue-button" type="button" disabled={busy} onClick={() => void saveSchedule()}><Send size={16} /> Enviar para aprovação</button>}{canApprove && plan?.status === 'aguardando_aprovacao' && <><button className="expense-button" type="button" disabled={busy} onClick={() => void decide('rejeitado')}>Rejeitar</button><button className="revenue-button" type="button" disabled={busy} onClick={() => void decide('aprovado')}><CheckCircle2 size={16} /> Aprovar pagamento</button></>}{canOperate && plan && ['aprovado', 'parcialmente_pago'].includes(String(plan.status)) && <button className="revenue-button" type="button" disabled={busy} onClick={() => void saveExecution()}><CheckCircle2 size={16} /> Salvar pagamentos</button>}</div>
  </section></div>
}

function PaymentControlPage({ kind }: { kind: PaymentKind }) {
  const collectionName = kind === 'client' ? 'alvaraTransfers' : 'agentCommissions'
  const title = kind === 'client' ? 'Repasse de Alvarás' : 'Comissões de Agentes'
  const subtitle = kind === 'client' ? 'Controle separado do valor devido ao cliente, independentemente do mês em que o Alvará entrou no caixa.' : 'Controle dos pagamentos de comissões e participações de agentes, inclusive quando realizados em parcelas ou meses diferentes.'
  const { records: receivables, loading: loadingReceivables } = useCollectionRecords('receivables')
  const { records: plans, loading: loadingPlans } = useCollectionRecords(collectionName)
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<AnyRecord | null>(null)
  const planMap = useMemo(() => new Map(plans.map((item) => [item.id, item])), [plans])
  const sources = useMemo(() => receivables.filter((item) => {
    if (!eligibleReceivable(item)) return false
    const amount = sourceAmount(item, kind)
    if (amount <= 0) return false
    if (kind === 'agent' && !String(item.agentName || '').trim()) return false
    return `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.reclamada ?? ''} ${sourceBeneficiary(item, kind)}`.toLowerCase().includes(search.toLowerCase())
  }), [kind, receivables, search])
  const totals = useMemo(() => sources.reduce((acc, source) => { const plan = planMap.get(source.id); const due = sourceAmount(source, kind); const paid = planPaidValue(plan); acc.due += due; acc.paid += paid; acc.pending += Math.max(0, due - paid); if (plan?.status === 'aguardando_aprovacao') acc.approvals += 1; const installments = Array.isArray(plan?.installments) ? plan!.installments : []; acc.overdue += installments.filter((item: DocumentData) => !item.paid && item.dueDate && String(item.dueDate) < today() && ['aprovado', 'parcialmente_pago'].includes(String(plan?.status))).length; return acc }, { due: 0, paid: 0, pending: 0, approvals: 0, overdue: 0 }), [kind, planMap, sources])
  const loading = loadingReceivables || loadingPlans
  const Icon = kind === 'client' ? BadgeDollarSign : Users

  return <><div className="page-heading"><div><span className="eyebrow">Controle financeiro separado</span><h1>{title}</h1><p>{subtitle}</p></div><div className="quick-actions"><button className="secondary-button" type="button" onClick={() => generatePaymentPdf(kind, sources, planMap)}><FileText size={17} /> Gerar PDF do relatório</button></div></div>
    <div className="obligation-metrics"><article><span>Total devido</span><strong>{money.format(totals.due)}</strong></article><article><span>Já pago</span><strong>{money.format(totals.paid)}</strong></article><article><span>Saldo pendente</span><strong>{money.format(totals.pending)}</strong></article><article><span>Aguardando aprovação</span><strong>{totals.approvals}</strong></article><article><span>Parcelas vencidas</span><strong>{totals.overdue}</strong></article></div>
    <section className="page-card module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, cliente, parte ou beneficiário" /></div></div>{loading ? <div className="module-empty"><RefreshCw className="spin" size={30} /><strong>Carregando controle</strong></div> : sources.length === 0 ? <div className="module-empty"><Icon size={34} /><strong>Nenhum valor disponível para este controle</strong><span>Os registros entram automaticamente depois que a Tesouraria confirma o recebimento do Alvará.</span></div> : <div className="obligation-list"><div className="obligation-list-row obligation-list-head"><span>Processo / Beneficiário</span><span>Valor devido</span><span>Já pago</span><span>Saldo</span><span>Status</span><span>Ação</span></div>{sources.map((source) => { const plan = planMap.get(source.id); const due = sourceAmount(source, kind); const paid = planPaidValue(plan); return <div className="obligation-list-row" key={source.id}><span><strong>{source.processo || '—'}</strong><small>{sourceBeneficiary(source, kind)}</small></span><span><strong>{money.format(due)}</strong></span><span><strong>{money.format(paid)}</strong></span><span><strong>{money.format(Math.max(0, due - paid))}</strong></span><span><b className={`workflow-status-badge ${statusClass(plan)}`}>{statusLabel(plan)}</b></span><span><button className="small-neutral-button" type="button" onClick={() => setTarget(source)}>{plan ? 'Abrir controle' : 'Programar pagamento'}</button></span></div> })}</div>}</section>
    {target && <PaymentPlanModal source={target} plan={planMap.get(target.id)} kind={kind} collectionName={collectionName} onClose={() => setTarget(null)} />}</>
}

function FiscalNoteModal({ source, note, onClose }: { source: AnyRecord; note?: AnyRecord; onClose: () => void }) {
  const { profile } = useAuth()
  const canEdit = ['master', 'diretor', 'gerente', 'tesouraria'].includes(String(profile?.role ?? ''))
  const invoiceValue = toNumber(source.invoiceValue) || componentValue(source, 'Honorários do Escritório')
  const [number, setNumber] = useState(String(note?.number || ''))
  const [issueDate, setIssueDate] = useState(String(note?.issueDate || ''))
  const [status, setStatus] = useState(String(note?.status || 'pendente'))
  const [notes, setNotes] = useState(String(note?.notes || ''))
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!profile || !canEdit) return
    if (status === 'emitida' && (!number.trim() || !issueDate)) { window.alert('Para marcar como Emitida, informe número e data da Nota Fiscal.'); return }
    setBusy(true)
    try {
      await setDoc(doc(db, 'fiscalNotes', source.id), { sourceReceivableId: source.id, processo: source.processo || '', clientName: source.titular || source.reclamante || '', cpf: source.cpf || '', email: source.emailNf || '', address: source.enderecoNf || '', invoiceValue, number: number.trim(), issueDate, status, notes: notes.trim(), sourceSnapshot: { unidade: source.unidade || '', natureza: source.natureza || '', processo: source.processo || '', reclamante: source.reclamante || '', reclamada: source.reclamada || '', titular: source.titular || '', cpf: source.cpf || '', emailNf: source.emailNf || '', enderecoNf: source.enderecoNf || '', valorAlvara: toNumber(source.valorAlvara), invoiceValue }, updatedBy: profile.uid, updatedByName: profile.displayName, updatedAt: serverTimestamp(), createdBy: note?.createdBy || profile.uid, createdAt: note?.createdAt || serverTimestamp() }, { merge: false })
      await audit(profile, 'Nota Fiscal', status === 'emitida' ? 'Nota Fiscal registrada como emitida' : 'Controle de Nota Fiscal atualizado', `Processo ${source.processo || '—'} — ${money.format(invoiceValue)}${number.trim() ? ` — NF ${number.trim()}` : ''}`, source.id)
      onClose()
    } catch (error) { console.error(error); window.alert('Não foi possível atualizar o controle da Nota Fiscal.') } finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><section className="decision-modal obligation-modal" role="dialog" aria-modal="true"><div className="modal-toolbar"><div><span className="eyebrow">Nota Fiscal</span><h2>Dados para emissão</h2></div><button className="icon-button" type="button" onClick={onClose}><X size={20} /></button></div><div className="fiscal-client-card"><div><span>Cliente</span><strong>{source.titular || source.reclamante || '—'}</strong></div><div><span>CPF</span><strong>{source.cpf || '—'}</strong></div><div><span>E-mail</span><strong>{source.emailNf || '—'}</strong></div><div><span>Endereço</span><strong>{source.enderecoNf || '—'}</strong></div><div><span>Processo</span><strong>{source.processo || '—'}</strong></div><div className="fiscal-value"><span>Valor da Nota / Honorários</span><strong>{money.format(invoiceValue)}</strong></div></div><div className="obligation-form-grid fiscal-form-grid"><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pendente">Pendente de emissão</option><option value="emitida">Emitida</option><option value="cancelada">Cancelada</option></select></label><label><span>Número da Nota Fiscal</span><input value={number} onChange={(event) => setNumber(event.target.value)} /></label><label><span>Data de emissão</span><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label></div><label className="obligation-notes"><span>Observações</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label><div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Fechar</button>{canEdit && <button className="revenue-button" type="button" disabled={busy} onClick={() => void save()}><FileText size={16} /> Salvar controle da NF</button>}</div></section></div>
}

export function FiscalNotesPageV2() {
  const { records: receivables, loading: loadingReceivables } = useCollectionRecords('receivables')
  const { records: notes, loading: loadingNotes } = useCollectionRecords('fiscalNotes')
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<AnyRecord | null>(null)
  const noteMap = useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes])
  const sources = useMemo(() => receivables.filter((item) => { if (!eligibleReceivable(item)) return false; const value = toNumber(item.invoiceValue) || componentValue(item, 'Honorários do Escritório'); if (value <= 0) return false; return `${item.processo ?? ''} ${item.reclamante ?? ''} ${item.titular ?? ''} ${item.cpf ?? ''}`.toLowerCase().includes(search.toLowerCase()) }), [receivables, search])
  const pending = sources.filter((source) => noteMap.get(source.id)?.status !== 'emitida').length
  const issued = sources.filter((source) => noteMap.get(source.id)?.status === 'emitida').length
  const total = sources.reduce((sum, source) => sum + (toNumber(source.invoiceValue) || componentValue(source, 'Honorários do Escritório')), 0)
  return <><div className="page-heading"><div><span className="eyebrow">Apoio à emissão</span><h1>Nota Fiscal</h1><p>Os dados do cliente e o valor dos honorários são trazidos automaticamente do Demonstrativo de Recebimento de Honorários.</p></div></div><div className="obligation-metrics fiscal-metrics"><article><span>Notas pendentes</span><strong>{pending}</strong></article><article><span>Notas emitidas</span><strong>{issued}</strong></article><article><span>Valor total dos honorários</span><strong>{money.format(total)}</strong></article></div><section className="page-card module-card"><div className="module-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, cliente ou CPF" /></div></div>{loadingReceivables || loadingNotes ? <div className="module-empty"><RefreshCw className="spin" size={30} /><strong>Carregando Notas Fiscais</strong></div> : sources.length === 0 ? <div className="module-empty"><FileText size={34} /><strong>Nenhum honorário disponível para emissão</strong></div> : <div className="obligation-list fiscal-list"><div className="obligation-list-row obligation-list-head"><span>Processo / Cliente</span><span>CPF</span><span>E-mail</span><span>Valor</span><span>Status</span><span>Ação</span></div>{sources.map((source) => { const note = noteMap.get(source.id); const value = toNumber(source.invoiceValue) || componentValue(source, 'Honorários do Escritório'); return <div className="obligation-list-row" key={source.id}><span><strong>{source.processo || '—'}</strong><small>{source.titular || source.reclamante || '—'}</small></span><span>{source.cpf || '—'}</span><span className="fiscal-email-cell">{source.emailNf || '—'}</span><span><strong>{money.format(value)}</strong></span><span><b className={`workflow-status-badge ${note?.status === 'emitida' ? 'workflow-success' : note?.status === 'cancelada' ? 'workflow-danger' : 'workflow-warning'}`}>{note?.status === 'emitida' ? `Emitida${note.number ? ` · NF ${note.number}` : ''}` : note?.status === 'cancelada' ? 'Cancelada' : 'Pendente'}</b></span><span><button className="small-neutral-button" type="button" onClick={() => setTarget(source)}>{note ? 'Abrir controle' : 'Preparar NF'}</button></span></div> })}</div>}</section>{target && <FiscalNoteModal source={target} note={noteMap.get(target.id)} onClose={() => setTarget(null)} />}</>
}

export function AlvaraTransfersPageV2() { return <PaymentControlPage kind="client" /> }
export function AgentCommissionsPageV2() { return <PaymentControlPage kind="agent" /> }
