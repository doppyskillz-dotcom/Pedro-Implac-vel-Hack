# BOT GERAL IA — API de Licenciamento (Backend)

**Criador:** Pedro Implacável  
**Contacto:** doppyskillz@gmail.com | 937 175 204

## Porquê este backend?

A validação de licenças **não deve depender do relógio nem do código do cliente**.  
Este servidor é a **autoridade** sobre:

- Validade e expiração (usa a data/hora do servidor)
- Vínculo HWID
- Revogação / bloqueio
- Limite de 300 licenças
- Código administrativo (nunca confiar só no HTML)

## Instalação

```bash
cd backend
npm install
npm start
```

API em: `http://localhost:3847`

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Estado do serviço + hora do servidor |
| GET | `/api/time` | UTC do servidor |
| POST | `/api/license/validate` | Validar chave + HWID (cliente) |
| GET | `/api/admin/licenses` | Listar licenças (header `x-admin-code`) |
| POST | `/api/admin/licenses` | Criar licença |
| PATCH | `/api/admin/licenses/:key` | revogar / bloquear / renovar / excluir |
| GET/POST | `/api/admin/payments` | Pagamentos |

### Exemplo — validar licença

```bash
curl -X POST http://localhost:3847/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{"key":"SEC-XXXX-XXXX-XXXX","hwid":"HWID-ABC123"}'
```

### Exemplo — criar licença (admin)

```bash
curl -X POST http://localhost:3847/api/admin/licenses \
  -H "Content-Type: application/json" \
  -H "x-admin-code: 00999" \
  -d '{"cliente":"João","tipo":"30d"}'
```

## Produção

1. Altere `ADM_CODE` e `API_SECRET` por variáveis de ambiente.
2. Use HTTPS e um domínio real.
3. No HTML do bot, defina:
   ```js
   localStorage.setItem('saagl_api_url', 'https://api.seudominio.com');
   ```
4. Opcional: base de dados (PostgreSQL/MySQL) em vez de JSON em disco.
5. API de pagamentos (Stripe/PayPal/Multicaixa) pode chamar `POST /api/admin/payments` após confirmação do webhook.

## Dados

Ficheiros em `backend/data/`:

- `licencas.json`
- `pagamentos.json`
- `access.log`
