import { onlyDigits, formatBRL, formatDate } from './util.js';

export const CATEGORIAS = {
  placa_acm: 'Placa / fachada em ACM',
  letreiro: 'Letreiro e letra caixa',
  luminoso: 'Luminoso e neon',
  fachada: 'Fachada completa (projeto e reforma)',
  pintura: 'Pintura e revestimento',
  adesivo: 'Adesivos e envelopamento de vitrine',
  toldo: 'Toldos e coberturas',
  totem: 'Totem, placa de rua e sinalização',
  outro: 'Outro serviço de comunicação visual',
};
export const SITUACAO = { tenho: 'Já tem a loja funcionando', vazio: 'Ponto vazio ou em obra', sem_ponto: 'Ainda não tem o ponto' };
export const ORCAMENTO = { ate1k: 'Até R$ 1.000', '1a3k': 'R$ 1.000 a R$ 3.000', '3a8k': 'R$ 3.000 a R$ 8.000', '8a20k': 'R$ 8.000 a R$ 20.000', acima20k: 'Acima de R$ 20.000', aberto: 'Ainda não sei' };
export const PRAZO = { urgente: 'Urgente (até 7 dias)', '15d': 'Em até 15 dias', '30d': 'Em até 30 dias', '60d': 'Em até 2 meses', flex: 'Sem pressa' };
export const DOC_TIPO = { cnpj: 'CNPJ (empresa)', mei: 'MEI (CNPJ)', cpf: 'CPF (autônomo)' };
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const REQ_STATUS = { aberto: 'Recebendo propostas', em_contratacao: 'Aguardando assinatura', contratado: 'Contratado', concluido: 'Concluído', cancelado: 'Cancelado' };
export const PROP_STATUS = { enviada: 'Enviada', retirada: 'Retirada', aceita: 'Aceita', recusada: 'Não escolhida' };
export const CT_STATUS = { aguardando_prestador: 'Aguardando o prestador', vigente: 'Em vigor', concluido: 'Concluído', cancelado: 'Cancelado' };

// ---------- CPF / CNPJ ----------
export function validCPF(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export function validCNPJ(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
export function formatDoc(tipo, v) {
  const d = onlyDigits(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return v || '';
}
export const docLabel = (tipo) => (tipo === 'cpf' ? 'CPF' : 'CNPJ');

/** Texto do contrato (fica gravado no momento da geração e é protegido por hash). */
export function contractText({ id, req, prop, empresa, prestador, createdAt }) {
  const parte = (u) => `${u.empresa || u.nome}, inscrito(a) no ${docLabel(u.doc_tipo)} sob o nº ${formatDoc(u.doc_tipo, u.documento)}${u.doc_tipo === 'mei' ? ' (Microempreendedor Individual)' : ''}, com sede/domicílio em ${u.cidade}/${u.uf}, neste ato representado(a) por ${u.nome}, e-mail ${u.email}`;
  const cats = JSON.parse(req.categorias || '[]').map((c) => CATEGORIAS[c] || c).join(', ');
  return [
    `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE COMUNICAÇÃO VISUAL Nº ${id}`,
    '',
    `CONTRATANTE: ${parte(empresa)}.`,
    `CONTRATADA: ${parte(prestador)}.`,
    '',
    'As partes acima identificadas celebram o presente contrato, que se regerá pelas cláusulas a seguir.',
    '',
    'CLÁUSULA 1 – OBJETO',
    `1.1. A CONTRATADA prestará à CONTRATANTE os serviços descritos no pedido ${req.id} ("${req.titulo}"), nas categorias: ${cats}, no endereço da CONTRATANTE em ${req.bairro ? req.bairro + ', ' : ''}${req.cidade}/${req.uf}.`,
    `1.2. Descrição do pedido: ${req.descricao}`,
    req.medidas ? `1.3. Medidas informadas: ${req.medidas}` : '1.3. As medidas definitivas serão conferidas pela CONTRATADA no local antes da produção.',
    `1.4. Escopo da proposta ${prop.id} da CONTRATADA: ${prop.inclui}`,
    '',
    'CLÁUSULA 2 – PREÇO E PAGAMENTO',
    `2.1. Pelo serviço, a CONTRATANTE pagará à CONTRATADA o valor total de ${formatBRL(prop.valor_cents)}.`,
    `2.2. Condições de pagamento: ${prop.pagamento}`,
    '2.3. O pagamento é feito diretamente entre as partes. A plataforma Fachada em Vista não recebe, intermedeia nem garante pagamentos.',
    '',
    'CLÁUSULA 3 – PRAZO',
    `3.1. A CONTRATADA concluirá o serviço em até ${prop.prazo_dias} dia(s) corrido(s), contados da aprovação final da arte pela CONTRATANTE e do pagamento da entrada, quando houver.`,
    '3.2. Atrasos causados por chuva, falta de acesso ao local, licenças de órgãos públicos ou alterações pedidas pela CONTRATANTE prorrogam o prazo pelo mesmo período.',
    '',
    'CLÁUSULA 4 – OBRIGAÇÕES DA CONTRATADA',
    '4.1. Apresentar a arte final para aprovação por escrito antes da produção.',
    '4.2. Executar o serviço com materiais adequados, observando as normas técnicas e de segurança, inclusive para trabalho em altura e instalações elétricas.',
    '4.3. Responsabilizar-se por danos causados ao imóvel ou a terceiros durante a instalação.',
    `4.4. Garantia: ${prop.garantia || 'a garantia legal prevista no Código de Defesa do Consumidor e no Código Civil, quando aplicável'}.`,
    '',
    'CLÁUSULA 5 – OBRIGAÇÕES DA CONTRATANTE',
    '5.1. Fornecer logo, textos e informações necessárias, e aprovar a arte em tempo razoável.',
    '5.2. Permitir o acesso ao local nos dias e horários combinados.',
    '5.3. Obter as autorizações do condomínio, do proprietário do imóvel e, quando exigido, da prefeitura, salvo se a proposta incluir esse serviço.',
    '5.4. Efetuar os pagamentos nas condições acordadas.',
    '',
    'CLÁUSULA 6 – ALTERAÇÕES E RESCISÃO',
    '6.1. Mudanças de escopo após a aprovação da arte podem alterar preço e prazo, mediante acordo por escrito entre as partes.',
    '6.2. Em caso de desistência da CONTRATANTE após o início da produção, serão devidos os custos já comprovadamente incorridos pela CONTRATADA.',
    '6.3. O descumprimento de qualquer cláusula permite à parte prejudicada rescindir o contrato, sem prejuízo de perdas e danos.',
    '',
    'CLÁUSULA 7 – DISPOSIÇÕES GERAIS',
    '7.1. A plataforma Fachada em Vista apenas aproxima as partes e registra este contrato. Ela não é parte do contrato nem responde pela execução do serviço.',
    '7.2. Simulações e imagens ilustrativas trocadas pela plataforma servem como referência visual. Medidas, materiais e instalação devem ser confirmados pela CONTRATADA.',
    '7.3. As partes reconhecem a validade deste contrato aceito eletronicamente, por meio de login com senha pessoal na plataforma, com registro de data, hora e endereço IP, nos termos do art. 10, § 2º, da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.',
    `7.4. Fica eleito o foro da comarca de ${req.cidade}/${req.uf} para dirimir dúvidas oriundas deste contrato.`,
    '',
    `Gerado em ${formatDate(createdAt)} pela plataforma Fachada em Vista.`,
  ].join('\n');
}
