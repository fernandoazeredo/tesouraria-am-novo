from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: esperado 1 trecho, encontrado {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# ALVARÁ — dados obrigatórios somente ao enviar quando houver líquido a repassar.
alvara = 'src/pages/ReceivablesPageStorageV2.tsx'
replace_once(
    alvara,
    "  const [cpf, setCpf] = useState('')\n  const [emailNf, setEmailNf] = useState('')",
    "  const [cpf, setCpf] = useState('')\n  const [pix, setPix] = useState('')\n  const [emailNf, setEmailNf] = useState('')",
)
replace_once(
    alvara,
    "    if (!processo.trim() || !reclamante.trim() || totalAlvara <= 0) { window.alert('Preencha número do processo, reclamante e valor líquido do alvará.'); return }\n    const missingGeneralDetail",
    "    if (!processo.trim() || !reclamante.trim() || totalAlvara <= 0) { window.alert('Preencha número do processo, reclamante e valor líquido do alvará.'); return }\n    if (status === 'enviado_tesouraria' && liquidoCliente > 0 && (!banco.trim() || !agencia.trim() || !conta.trim() || !titular.trim() || !cpf.trim())) {\n      window.alert('Para realizar o repasse ao cliente, preencha Banco, Agência, Conta, Nome/Titular e CPF.')\n      return\n    }\n    const missingGeneralDetail",
)
replace_once(
    alvara,
    "        banco, agencia, conta, titular, cpf, emailNf, enderecoNf, status,",
    "        banco: banco.trim(), agencia: agencia.trim(), conta: conta.trim(), titular: titular.trim(), cpf: cpf.trim(), pix: pix.trim(), emailNf, enderecoNf, status,",
)
replace_once(
    alvara,
    "    <h3 className=\"form-section-title\">Dados bancários para crédito do cliente</h3>\n    <div className=\"form-grid compact-grid\"><label><span>Banco</span><input value={banco} onChange={(e) => setBanco(e.target.value)} /></label><label><span>Agência</span><input value={agencia} onChange={(e) => setAgencia(e.target.value)} /></label><label><span>Conta</span><input value={conta} onChange={(e) => setConta(e.target.value)} /></label><label className=\"span-2\"><span>Nome / Titular</span><input value={titular} onChange={(e) => setTitular(e.target.value)} /></label><label><span>CPF</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} /></label></div>",
    "    <h3 className=\"form-section-title\">Dados bancários para crédito do cliente</h3>\n    <div className=\"form-grid compact-grid\">\n      <label><span>Banco *</span><input value={banco} required={liquidoCliente > 0} onChange={(e) => setBanco(e.target.value)} /></label>\n      <label><span>Agência *</span><input value={agencia} required={liquidoCliente > 0} onChange={(e) => setAgencia(e.target.value)} /></label>\n      <label><span>Conta *</span><input value={conta} required={liquidoCliente > 0} onChange={(e) => setConta(e.target.value)} /></label>\n      <label className=\"span-2\"><span>Nome / Titular *</span><input value={titular} required={liquidoCliente > 0} onChange={(e) => setTitular(e.target.value)} /></label>\n      <label><span>CPF *</span><input value={cpf} required={liquidoCliente > 0} onChange={(e) => setCpf(e.target.value)} /></label>\n      <label className=\"span-2\"><span>PIX (opcional)</span><input value={pix} onChange={(e) => setPix(e.target.value)} /></label>\n    </div>",
)

# ACORDO — todos os dados do cliente obrigatórios ao enviar quando houver líquido a repassar; PIX opcional.
agreement = 'src/components/LaborAgreementReceivable.tsx'
replace_once(
    agreement,
    "  const [contaCliente, setContaCliente] = useState('')\n  const [cpfCliente, setCpfCliente] = useState('')",
    "  const [contaCliente, setContaCliente] = useState('')\n  const [titularCliente, setTitularCliente] = useState('')\n  const [cpfCliente, setCpfCliente] = useState('')\n  const [pixCliente, setPixCliente] = useState('')",
)
replace_once(
    agreement,
    "    if (status === 'enviado_tesouraria' && totalRecebido <= 0) {\n      window.alert('Para enviar à Tesouraria, informe ao menos uma parcela com data realizada e valor recebido.')\n      return\n    }\n    if (outrasDeducoes > 0",
    "    if (status === 'enviado_tesouraria' && totalRecebido <= 0) {\n      window.alert('Para enviar à Tesouraria, informe ao menos uma parcela com data realizada e valor recebido.')\n      return\n    }\n    if (status === 'enviado_tesouraria' && liquidoClienteRecebido > 0 && (!titularCliente.trim() || !cpfCliente.trim() || !bancoCliente.trim() || !agenciaCliente.trim() || !contaCliente.trim() || !emailCliente.trim() || !telefoneCliente.trim() || !enderecoCliente.trim())) {\n      window.alert('Para realizar o repasse ao cliente, preencha todos os dados obrigatórios do cliente: Nome/Titular, CPF, Banco, Agência, Conta Corrente, E-mail, Telefone e Endereço.')\n      return\n    }\n    if (outrasDeducoes > 0",
)
replace_once(
    agreement,
    "        conta: contaCliente.trim(),\n        cpf: cpfCliente.trim(),\n        emailNf: emailCliente.trim(),",
    "        conta: contaCliente.trim(),\n        titular: titularCliente.trim(),\n        cpf: cpfCliente.trim(),\n        pix: pixCliente.trim(),\n        emailNf: emailCliente.trim(),",
)
replace_once(
    agreement,
    "    <h3 className=\"form-section-title\">Dados bancários e contato do cliente</h3>\n    <div className=\"form-grid compact-grid labor-agreement-grid\">\n      <label><span>Banco</span><input value={bancoCliente} onChange={(e) => setBancoCliente(e.target.value)} /></label>\n      <label><span>Agência</span><input value={agenciaCliente} onChange={(e) => setAgenciaCliente(e.target.value)} /></label>\n      <label><span>Conta Corrente</span><input value={contaCliente} onChange={(e) => setContaCliente(e.target.value)} /></label>\n      <label><span>CPF</span><input value={cpfCliente} onChange={(e) => setCpfCliente(e.target.value)} /></label>\n      <label><span>E-mail</span><input type=\"email\" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} /></label>\n      <label><span>Telefone</span><input value={telefoneCliente} onChange={(e) => setTelefoneCliente(e.target.value)} /></label>\n      <label className=\"span-2\"><span>Endereço</span><input value={enderecoCliente} onChange={(e) => setEnderecoCliente(e.target.value)} /></label>\n    </div>",
    "    <h3 className=\"form-section-title\">Dados bancários e contato do cliente</h3>\n    <div className=\"form-grid compact-grid labor-agreement-grid\">\n      <label><span>Banco *</span><input value={bancoCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setBancoCliente(e.target.value)} /></label>\n      <label><span>Agência *</span><input value={agenciaCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setAgenciaCliente(e.target.value)} /></label>\n      <label><span>Conta Corrente *</span><input value={contaCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setContaCliente(e.target.value)} /></label>\n      <label><span>Nome / Titular *</span><input value={titularCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setTitularCliente(e.target.value)} /></label>\n      <label><span>CPF *</span><input value={cpfCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setCpfCliente(e.target.value)} /></label>\n      <label><span>PIX (opcional)</span><input value={pixCliente} onChange={(e) => setPixCliente(e.target.value)} /></label>\n      <label><span>E-mail *</span><input type=\"email\" value={emailCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setEmailCliente(e.target.value)} /></label>\n      <label><span>Telefone *</span><input value={telefoneCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setTelefoneCliente(e.target.value)} /></label>\n      <label className=\"span-2\"><span>Endereço *</span><input value={enderecoCliente} required={liquidoClienteRecebido > 0} onChange={(e) => setEnderecoCliente(e.target.value)} /></label>\n    </div>",
)

# REPASSE DE ALVARÁS — impedir programação de pagamento de registros antigos incompletos e exibir/preservar PIX.
repasse = 'src/pages/AlvaraControlPagesV3.tsx'
replace_once(
    repasse,
    "    if (!profile || !canOperate) return\n    if (!installments.length",
    "    if (!profile || !canOperate) return\n    if (kind === 'client' && (!String(source.banco || '').trim() || !String(source.agencia || '').trim() || !String(source.conta || '').trim() || !String(source.titular || '').trim() || !String(source.cpf || '').trim())) {\n      window.alert('Para realizar o repasse ao cliente, preencha Banco, Agência, Conta, Nome/Titular e CPF no recebimento de origem.')\n      return\n    }\n    if (!installments.length",
)
replace_once(
    repasse,
    "${kind === 'client' ? `<div><b>CPF</b>${escapeHtml(source.cpf || '—')}</div><div><b>Banco / Agência / Conta</b>${escapeHtml(`${source.banco || '—'} / ${source.agencia || '—'} / ${source.conta || '—'}`)}</div>` : `<div><b>Comissão</b>${percent ? `${percent.toLocaleString('pt-BR')}%` : '—'}</div>`}",
    "${kind === 'client' ? `<div><b>CPF</b>${escapeHtml(source.cpf || '—')}</div><div><b>Banco / Agência / Conta</b>${escapeHtml(`${source.banco || '—'} / ${source.agencia || '—'} / ${source.conta || '—'}`)}</div><div><b>PIX</b>${escapeHtml(source.pix || '—')}</div>` : `<div><b>Comissão</b>${percent ? `${percent.toLocaleString('pt-BR')}%` : '—'}</div>`}",
)
replace_once(
    repasse,
    "    {kind === 'client' && <><div><span>Banco</span><strong>{source.banco || '—'}</strong></div><div><span>Agência / Conta</span><strong>{source.agencia || '—'} / {source.conta || '—'}</strong></div><div><span>CPF</span><strong>{source.cpf || '—'}</strong></div></>}",
    "    {kind === 'client' && <><div><span>Banco</span><strong>{source.banco || '—'}</strong></div><div><span>Agência / Conta</span><strong>{source.agencia || '—'} / {source.conta || '—'}</strong></div><div><span>CPF</span><strong>{source.cpf || '—'}</strong></div><div><span>PIX</span><strong>{source.pix || '—'}</strong></div></>}",
)
replace_once(
    repasse,
    "banco: source.banco || '', agencia: source.agencia || '', conta: source.conta || '', titular: source.titular || '', cpf: source.cpf || '', agentName:",
    "banco: source.banco || '', agencia: source.agencia || '', conta: source.conta || '', titular: source.titular || '', cpf: source.cpf || '', pix: source.pix || '', agentName:",
)

print('Ajustes de repasse ao cliente aplicados com sucesso.')
