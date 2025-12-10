# 🔧 Configuração do Telegram Bot para Alertas

## 📋 Passo a Passo

### 1. Criar Bot no Telegram

1. Abra o Telegram e procure por [@BotFather](https://t.me/botfather)
2. Envie o comando: `/newbot`
3. Escolha um nome para o bot (ex: "Easy Faucet Monitor")
4. Escolha um username (deve terminar em `bot`, ex: `easy_faucet_monitor_bot`)
5. **Copie o token** fornecido pelo BotFather (formato: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Obter seu Chat ID

**Opção A: Via @userinfobot**
1. Procure por [@userinfobot](https://t.me/userinfobot) no Telegram
2. Envie qualquer mensagem
3. O bot responderá com seu Chat ID (ex: `123456789`)

**Opção B: Via grupo (se quiser receber em grupo)**
1. Crie um grupo no Telegram
2. Adicione o bot ao grupo
3. Envie uma mensagem no grupo
4. Acesse: `https://api.telegram.org/bot{SEU_TOKEN}/getUpdates`
5. Procure por `"chat":{"id":-123456789}` (o ID do grupo será negativo)

### 3. Configurar Variáveis de Ambiente

**Local (.env.local):**
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

**Vercel (Produção):**
1. Acesse seu projeto no Vercel
2. Vá em Settings → Environment Variables
3. Adicione:
   - `TELEGRAM_BOT_TOKEN` = seu token
   - `TELEGRAM_CHAT_ID` = seu chat ID
4. Deploy novamente

### 4. Testar

1. Faça um claim que deixe o saldo abaixo do threshold
2. Verifique se recebeu mensagem no Telegram
3. Verifique logs no Vercel para debugging

---

## ⚙️ Configuração de Thresholds

Os thresholds estão configurados em `lib/config/thresholds.ts`:

```typescript
USDC: {
  alert: 500,        // Alerta se saldo < 500 USDC
  claimAmount: 100,  // Por claim
  minClaimsBeforeAlert: 5,
}

EURC: {
  alert: 250,        // Alerta se saldo < 250 EURC
  claimAmount: 50,   // Por claim
  minClaimsBeforeAlert: 5,
}
```

Para alterar, edite o arquivo `lib/config/thresholds.ts`.

---

## 🔔 Rate Limiting

- **Cooldown:** 30 minutos entre alertas do mesmo token
- **Motivo:** Evitar spam de alertas
- **Configuração:** `lib/services/alert-cooldown.ts`

---

## 🧪 Como Testar

### Teste 1: Saldo OK (não deve alertar)
1. Faça um claim quando saldo > threshold
2. Não deve receber alerta

### Teste 2: Saldo Baixo (deve alertar)
1. Faça um claim que deixe saldo < threshold
2. Deve receber alerta no Telegram

### Teste 3: Múltiplos Claims (cooldown)
1. Faça claim que gera alerta
2. Faça outro claim imediatamente (ainda abaixo do threshold)
3. Não deve receber segundo alerta (cooldown de 30min)

---

## 📝 Logs

Os logs aparecem no console do Vercel:
- `Alert sent for USDC - Balance: 450.00`
- `No alert needed for EURC - Balance: 300.00`
- `Alert for USDC skipped - in cooldown`

---

## ⚠️ Troubleshooting

### Não recebe alertas:
1. Verifique se `TELEGRAM_BOT_TOKEN` está configurado
2. Verifique se `TELEGRAM_CHAT_ID` está correto
3. Verifique logs no Vercel para erros
4. Teste enviando mensagem manualmente ao bot

### Alertas duplicados:
- Verifique se cooldown está funcionando
- Pode ser múltiplas instâncias serverless (considerar Vercel KV)

### Bot não responde:
- Verifique se o token está correto
- Verifique se o bot está ativo
- Teste via: `https://api.telegram.org/bot{TOKEN}/getMe`

---

## 🔒 Segurança

- ✅ Token nunca é exposto ao frontend
- ✅ Variáveis de ambiente não são commitadas
- ✅ Erros não quebram o fluxo principal
- ✅ Rate limiting previne spam

