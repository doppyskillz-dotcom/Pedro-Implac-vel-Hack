/**
 * BOT GERAL IA — API de Licenciamento e Validação (Backend)
 * Criador: Pedro Implacável
 * Contacto: doppyskillz@gmail.com | 937 175 204
 *
 * A autoridade sobre validade, expiração, HWID e código ADM está AQUI no servidor.
 * O frontend apenas consulta e recebe autorização.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3847;
const DATA_DIR = path.join(__dirname, 'data');
const LIC_FILE = path.join(DATA_DIR, 'licencas.json');
const PAG_FILE = path.join(DATA_DIR, 'pagamentos.json');
const LOG_FILE = path.join(DATA_DIR, 'access.log');

const ADM_CODE = process.env.ADM_CODE || '00999';
const LIMITE_LICENCAS = parseInt(process.env.LIMITE_LICENCAS || '300', 10);
const API_SECRET = process.env.API_SECRET || 'bot-geral-ia-secret-change-me';

// ---------- Persistência ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
function loadJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function logAccess(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// ---------- Utilitários ----------
function serverNow() {
  // Horário oficial do servidor (UTC) — não depende do relógio do cliente
  return new Date();
}

function gerarToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SEC-${seg()}-${seg()}-${seg()}`;
}

function statusLicenca(lic) {
  if (lic.bloqueada) return 'BLOQUEADA';
  if (lic.revogada) return 'REVOGADA';
  if (lic.expiraEm === null) return 'ATIVA';
  if (new Date(lic.expiraEm).getTime() <= serverNow().getTime()) return 'EXPIRADA';
  return 'ATIVA';
}

function calcularExpiracao(tipo, customIso) {
  const agora = serverNow();
  if (tipo === 'vitalicio') return null;
  if (tipo === 'custom' && customIso) return new Date(customIso);
  const mapa = { '1h': 1, '6h': 6, '12h': 12, '24h': 24, '7d': 168, '30d': 720 };
  const horas = mapa[tipo] || 24;
  return new Date(agora.getTime() + horas * 3600 * 1000);
}

function requireAdmin(req, res, next) {
  const code = (req.headers['x-admin-code'] || req.body?.adminCode || '').toString();
  if (code !== ADM_CODE) {
    return res.status(403).json({ ok: false, erro: 'Código administrativo inválido.' });
  }
  next();
}

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// ---------- Health & Tempo do Servidor ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servico: 'BOT GERAL IA — License API',
    servidorAgora: serverNow().toISOString(),
    limiteLicencas: LIMITE_LICENCAS
  });
});

app.get('/api/time', (req, res) => {
  res.json({ ok: true, utc: serverNow().toISOString(), ts: serverNow().getTime() });
});

// ---------- Validar Licença (endpoint principal do cliente) ----------
app.post('/api/license/validate', (req, res) => {
  const { key, hwid } = req.body || {};
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, erro: 'Chave em falta.' });
  }

  const k = key.trim().toUpperCase();

  // Código ADM — só confirma que é admin; não "abre o bot" como cliente
  if (k === ADM_CODE) {
    logAccess(`ADM_CODE usado (HWID=${hwid || 'n/a'})`);
    return res.json({
      ok: true,
      tipo: 'admin',
      mensagem: 'Acesso administrativo autorizado.',
      servidorAgora: serverNow().toISOString()
    });
  }

  const lista = loadJSON(LIC_FILE);
  const lic = lista.find(l => (l.key || '').toUpperCase() === k);

  if (!lic) {
    logAccess(`FALHA key=${k} HWID=${hwid || 'n/a'}`);
    return res.status(401).json({ ok: false, erro: 'Chave inválida.' });
  }

  const st = statusLicenca(lic);
  if (st === 'REVOGADA') {
    return res.status(403).json({ ok: false, erro: 'Chave revogada.', estado: st });
  }
  if (st === 'BLOQUEADA') {
    return res.status(403).json({ ok: false, erro: 'Chave bloqueada.', estado: st });
  }
  if (st === 'EXPIRADA') {
    return res.status(403).json({
      ok: false,
      erro: 'Licença expirada.',
      estado: st,
      expiraEm: lic.expiraEm,
      servidorAgora: serverNow().toISOString()
    });
  }

  // HWID binding
  if (lic.hwid && hwid && lic.hwid !== hwid) {
    logAccess(`HWID_MISMATCH key=${k} esperado=${lic.hwid} recebido=${hwid}`);
    return res.status(403).json({
      ok: false,
      erro: 'Chave vinculada a outro dispositivo.',
      estado: 'HWID_BLOQUEADO'
    });
  }

  // Primeiro acesso / atualizar
  const agora = serverNow().toISOString();
  if (!lic.hwid && hwid) {
    lic.hwid = hwid;
    lic.primeiroAcesso = agora;
    lic.ativadaEm = agora;
  }
  lic.ultimoAcesso = agora;
  saveJSON(LIC_FILE, lista);

  logAccess(`OK key=${k} cliente=${lic.cliente} HWID=${hwid || 'n/a'}`);

  res.json({
    ok: true,
    tipo: 'cliente',
    estado: 'ATIVA',
    key: lic.key,
    cliente: lic.cliente,
    expiraEm: lic.expiraEm,
    servidorAgora: agora,
    sessaoToken: crypto.createHmac('sha256', API_SECRET).update(lic.key + agora).digest('hex').slice(0, 32)
  });
});

// ---------- Admin: listar / criar / gerir ----------
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
  const lista = loadJSON(LIC_FILE);
  const comStatus = lista.map(l => ({ ...l, estadoAtual: statusLicenca(l) }));
  const ativas = comStatus.filter(l => l.estadoAtual === 'ATIVA').length;
  const expiradas = comStatus.filter(l => l.estadoAtual === 'EXPIRADA').length;
  const bloqueadas = comStatus.filter(l => l.estadoAtual === 'BLOQUEADA' || l.estadoAtual === 'REVOGADA').length;
  res.json({
    ok: true,
    limite: LIMITE_LICENCAS,
    total: lista.length,
    disponiveis: Math.max(0, LIMITE_LICENCAS - lista.length),
    ativas,
    expiradas,
    bloqueadas,
    licencas: comStatus,
    servidorAgora: serverNow().toISOString()
  });
});

app.post('/api/admin/licenses', requireAdmin, (req, res) => {
  const { cliente, tipo, customExpira, observacao } = req.body || {};
  const lista = loadJSON(LIC_FILE);
  if (lista.length >= LIMITE_LICENCAS) {
    return res.status(400).json({ ok: false, erro: `Limite de ${LIMITE_LICENCAS} licenças atingido.` });
  }

  const key = gerarToken();
  const agora = serverNow();
  const expiraEm = calcularExpiracao(tipo || '30d', customExpira);
  const lic = {
    id: 'LIC-' + Date.now().toString(36).toUpperCase(),
    key,
    cliente: (cliente || 'Cliente').trim(),
    criadaEm: agora.toISOString(),
    ativadaEm: null,
    expiraEm: expiraEm ? expiraEm.toISOString() : null,
    tipo: tipo || '30d',
    hwid: null,
    revogada: false,
    bloqueada: false,
    primeiroAcesso: null,
    ultimoAcesso: null,
    observacao: observacao || ''
  };
  lista.unshift(lic);
  saveJSON(LIC_FILE, lista);
  logAccess(`CRIADA key=${key} cliente=${lic.cliente}`);
  res.json({ ok: true, licenca: lic, servidorAgora: agora.toISOString() });
});

app.patch('/api/admin/licenses/:key', requireAdmin, (req, res) => {
  const key = (req.params.key || '').toUpperCase();
  const { acao } = req.body || {};
  const lista = loadJSON(LIC_FILE);
  const idx = lista.findIndex(l => (l.key || '').toUpperCase() === key);
  if (idx < 0) return res.status(404).json({ ok: false, erro: 'Licença não encontrada.' });

  const lic = lista[idx];
  switch (acao) {
    case 'revogar':
      lic.revogada = true;
      break;
    case 'bloquear':
      lic.bloqueada = true;
      break;
    case 'desbloquear':
      lic.bloqueada = false;
      lic.revogada = false;
      break;
    case 'renovar30d':
      lic.revogada = false;
      lic.bloqueada = false;
      lic.expiraEm = new Date(serverNow().getTime() + 30 * 24 * 3600 * 1000).toISOString();
      lic.tipo = '30d';
      break;
    case 'desvincular':
      lic.hwid = null;
      lic.primeiroAcesso = null;
      break;
    case 'excluir':
      lista.splice(idx, 1);
      saveJSON(LIC_FILE, lista);
      return res.json({ ok: true, mensagem: 'Licença excluída.' });
    default:
      return res.status(400).json({ ok: false, erro: 'Ação inválida.' });
  }
  saveJSON(LIC_FILE, lista);
  res.json({ ok: true, licenca: { ...lic, estadoAtual: statusLicenca(lic) } });
});

// ---------- Pagamentos (admin) ----------
app.get('/api/admin/payments', requireAdmin, (req, res) => {
  res.json({ ok: true, pagamentos: loadJSON(PAG_FILE) });
});

app.post('/api/admin/payments', requireAdmin, (req, res) => {
  const { cliente, planoTipo, valor, metodo, referencia } = req.body || {};
  const listaPag = loadJSON(PAG_FILE);
  const listaLic = loadJSON(LIC_FILE);

  if (listaLic.length >= LIMITE_LICENCAS) {
    return res.status(400).json({ ok: false, erro: 'Limite de licenças atingido.' });
  }

  const pagId = 'PAG-' + Date.now().toString(36).toUpperCase();
  const key = gerarToken();
  const agora = serverNow();
  const expiraEm = calcularExpiracao(planoTipo || '30d');

  const lic = {
    id: 'LIC-' + Date.now().toString(36).toUpperCase(),
    key,
    cliente: (cliente || 'Cliente').trim(),
    criadaEm: agora.toISOString(),
    ativadaEm: null,
    expiraEm: expiraEm ? expiraEm.toISOString() : null,
    tipo: planoTipo || '30d',
    hwid: null,
    revogada: false,
    bloqueada: false,
    primeiroAcesso: null,
    ultimoAcesso: null,
    observacao: 'Via pagamento ' + pagId,
    pagamentoId: pagId
  };
  listaLic.unshift(lic);
  saveJSON(LIC_FILE, listaLic);

  const pag = {
    id: pagId,
    cliente: lic.cliente,
    planoTipo: planoTipo || '30d',
    valor: valor || 0,
    metodo: metodo || 'Transferência',
    referencia: referencia || '',
    estado: 'CONFIRMADO',
    criadoEm: agora.toISOString(),
    licencaKey: key
  };
  listaPag.unshift(pag);
  saveJSON(PAG_FILE, listaPag);

  res.json({ ok: true, pagamento: pag, licenca: lic });
});

// ---------- Arranque ----------
app.listen(PORT, () => {
  console.log(`BOT GERAL IA License API a correr em http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`ADM protegido por header x-admin-code`);
});
