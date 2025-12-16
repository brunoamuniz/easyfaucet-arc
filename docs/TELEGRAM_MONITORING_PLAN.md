# 📋 Plano de Implementação: Monitoramento via Telegram (Conta Pessoal)

## 🎯 Objetivo

Criar um sistema de monitoramento que:
1. **Monitora novos claims** nos contratos USDC e EURC
2. **Verifica saldos** dos contratos após cada claim
3. **Envia alertas via Telegram** (usando conta pessoal, não bot) quando saldos estão abaixo de thresholds
4. **Fornece informações** sobre o estado dos faucets

## 🔑 Diferença: Conta Pessoal vs Bot

**Bot (abordagem anterior):**
- Usa Bot API do Telegram
- Requer criar bot via @BotFather
- Limitado a comandos e mensagens simples
- Não pode enviar para qualquer chat

**Conta Pessoal (esta abordagem):**
- Usa MTProto API (API nativa do Telegram)
- Usa sua conta pessoal existente
- Pode enviar mensagens para você mesmo ou qualquer chat
- Mais flexível e similar ao Telethon (Python)
- Usa biblioteca **GramJS** (equivalente JavaScript do Telethon)

---

## 🏗️ Arquitetura e Opções de Implementação

### Opção 1: Webhook de Eventos do Contrato (Recomendado) ⭐

**Como funciona:**
- Escuta eventos `Claimed` emitidos pelos contratos
- Quando um claim acontece, verifica saldo imediatamente
- Se saldo < threshold, envia alerta no Telegram

**Vantagens:**
- ✅ Tempo real (reage imediatamente a claims)
- ✅ Eficiente (só verifica quando há atividade)
- ✅ Não precisa polling constante
- ✅ Usa menos recursos

**Desvantagens:**
- ⚠️ Precisa manter conexão WebSocket ou polling de eventos
- ⚠️ Pode perder eventos se serviço estiver offline

**Implementação:**
- Usar `viem` para escutar eventos
- WebSocket connection para eventos em tempo real
- Ou polling de eventos recentes a cada X segundos

---

### Opção 2: Polling de Eventos (Alternativa)

**Como funciona:**
- Verifica eventos `Claimed` a cada X minutos (ex: 5 minutos)
- Compara com última verificação
- Se novos claims detectados, verifica saldos

**Vantagens:**
- ✅ Mais simples de implementar
- ✅ Não precisa manter conexão ativa
- ✅ Funciona bem com serverless (Vercel)

**Desvantagens:**
- ⚠️ Não é tempo real (delay de até X minutos)
- ⚠️ Pode verificar múltiplas vezes sem necessidade

**Implementação:**
- API route que roda periodicamente (Vercel Cron)
- Verifica últimos eventos desde última execução
- Compara com cache de última verificação

---

### Opção 3: Híbrido: Webhook + Polling

**Como funciona:**
- WebSocket para monitoramento em tempo real (quando possível)
- Polling como fallback se WebSocket falhar
- Melhor dos dois mundos

**Vantagens:**
- ✅ Tempo real quando possível
- ✅ Resiliente a falhas
- ✅ Funciona em qualquer ambiente

**Desvantagens:**
- ⚠️ Mais complexo de implementar
- ⚠️ Pode ter duplicação de verificações

---

## 🎯 Recomendação: Opção 2 (Polling de Eventos)

**Por quê:**
- Mais compatível com Vercel (serverless)
- Simples de implementar e manter
- Delay de 5 minutos é aceitável para alertas
- Não precisa manter conexão ativa

---

## 📐 Estrutura da Solução

### 1. API Route para Monitoramento (`app/api/cron/telegram-monitor/route.ts`)

**Funcionalidades:**
- Buscar eventos `Claimed` recentes (últimos 5-10 minutos)
- Verificar se são novos eventos (comparar com cache)
- Para cada novo claim:
  - Verificar saldo do contrato correspondente
  - Comparar com threshold
  - Enviar alerta se necessário
- Atualizar cache de última verificação

**Estrutura:**
```typescript
export async function GET(request: NextRequest) {
  // 1. Verificar autenticação (Vercel Cron)
  // 2. Buscar eventos Claimed recentes (USDC e EURC)
  // 3. Filtrar novos eventos (comparar com cache)
  // 4. Para cada novo claim:
  //    a. Verificar saldo do contrato
  //    b. Comparar com threshold
  //    c. Enviar alerta Telegram se necessário
  // 5. Atualizar cache
  // 6. Retornar relatório
}
```

---

### 2. Integração com Telegram Bot API

**Criar Bot no Telegram:**
1. Falar com [@BotFather](https://t.me/botfather)
2. Criar novo bot: `/newbot`
3. Obter token: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
4. Configurar comandos (opcional)
5. Salvar token em variável de ambiente: `TELEGRAM_BOT_TOKEN`

**Obter Chat ID:**
1. Falar com [@userinfobot](https://t.me/userinfobot) para obter seu ID
2. Ou criar grupo e adicionar bot, depois obter group ID
3. Salvar em variável de ambiente: `TELEGRAM_CHAT_ID`

**API do Telegram:**
- Base URL: `https://api.telegram.org/bot{token}/`
- Enviar mensagem: `POST https://api.telegram.org/bot{token}/sendMessage`

**Biblioteca recomendada:**
- `node-telegram-bot-api` (npm package)
- Ou fazer requests HTTP diretos (mais leve)

---

### 3. Configuração de Thresholds

**Configuração sugerida:**

```typescript
// lib/config/telegram-monitor.ts
export const TELEGRAM_MONITOR_CONFIG = {
  USDC: {
    threshold: 500, // Alerta se saldo < 500 USDC
    claimAmount: 100, // Quantidade por claim
    minClaimsBeforeRefill: 5, // Alerta se faltam < 5 claims
  },
  EURC: {
    threshold: 250, // Alerta se saldo < 250 EURC
    claimAmount: 50, // Quantidade por claim
    minClaimsBeforeRefill: 5, // Alerta se faltam < 5 claims
  },
  // Configurações gerais
  checkInterval: 5 * 60 * 1000, // Verificar a cada 5 minutos
  eventLookback: 10 * 60, // Buscar eventos dos últimos 10 minutos
};
```

**Lógica de Alerta:**
- Se `contractBalance < threshold`:
  - Calcular quantos claims restam: `Math.floor(balance / claimAmount)`
  - Se `remainingClaims < minClaimsBeforeRefill`:
    - Enviar alerta crítico
  - Senão:
    - Enviar alerta informativo

---

### 4. Buscar Eventos do Contrato

**Usando viem:**

```typescript
// Buscar eventos Claimed recentes
const events = await publicClient.getLogs({
  address: FAUCET_CONTRACT_ADDRESS,
  event: parseAbiItem('event Claimed(address indexed user, uint256 amount, uint256 timestamp)'),
  fromBlock: 'latest' - 100, // Últimos ~100 blocos
  toBlock: 'latest',
});

// Filtrar eventos recentes (últimos 10 minutos)
const recentEvents = events.filter(event => {
  const eventTime = Number(event.args.timestamp) * 1000;
  const now = Date.now();
  return (now - eventTime) < (10 * 60 * 1000);
});
```

**Alternativa: Polling de totalClaims:**
- Ler `totalClaims` do contrato periodicamente
- Comparar com valor anterior
- Se aumentou, houve novo claim
- Mais simples, mas menos informações

---

### 5. Cache de Última Verificação

**Onde armazenar:**
- **Opção A: Variável de ambiente (Vercel)**
  - Não persiste entre execuções serverless
  - Não recomendado

- **Opção B: Arquivo local (não funciona em serverless)**
  - Não funciona no Vercel

- **Opção C: Database (Vercel Postgres, Supabase)**
  - Persiste entre execuções
  - Pode armazenar histórico
  - Recomendado para produção

- **Opção D: Vercel KV (Redis)**
  - Key-value store
  - Perfeito para cache simples
  - Recomendado para MVP

- **Opção E: Headers/Query params**
  - Passar timestamp da última verificação
  - Funciona, mas limitado

**Recomendação: Vercel KV ou Database**

**Estrutura do cache:**
```typescript
{
  lastCheckTimestamp: 1705320000000,
  lastTotalClaims: {
    USDC: 150,
    EURC: 75,
  },
  lastBalances: {
    USDC: 5000,
    EURC: 2500,
  }
}
```

---

### 6. Mensagens do Telegram

**Formato de mensagem:**

**Alerta Crítico (saldo muito baixo):**
```
🚨 ALERTA CRÍTICO - Faucet USDC

Saldo atual: 450 USDC
Threshold: 500 USDC
Claims restantes: ~4

⚠️ Faucet precisa de refill urgente!
```

**Alerta Informativo (saldo baixo mas ainda ok):**
```
⚠️ Alerta - Faucet EURC

Saldo atual: 300 EURC
Threshold: 250 EURC
Claims restantes: ~6

💡 Considere fazer refill em breve.
```

**Resumo Diário (opcional):**
```
📊 Resumo Diário - Faucets

USDC:
  Saldo: 5,000 USDC
  Claims hoje: 12
  Status: ✅ OK

EURC:
  Saldo: 2,500 EURC
  Claims hoje: 8
  Status: ✅ OK
```

**Formatação:**
- Usar Markdown ou HTML (Telegram suporta)
- Emojis para melhor visualização
- Links para ArcScan quando relevante

---

### 7. Comandos via Mensagens (Opcional)

**Comandos úteis (enviar mensagem para você mesmo):**

Como você pode enviar mensagens para você mesmo, pode criar um sistema simples:
- Enviar mensagem com comando: `/status`
- Processar mensagem recebida
- Responder com informações

**Implementação:**
- Escutar mensagens recebidas (via `client.addEventHandler`)
- Processar comandos
- Responder automaticamente

**Exemplo:**
```typescript
// Escutar mensagens recebidas
client.addEventHandler(async (event) => {
  const message = event.message;
  if (message.text === '/status') {
    const balances = await getFaucetBalances();
    await client.sendMessage('me', {
      message: `📊 Status dos Faucets:\n\nUSDC: ${balances.usdc}\nEURC: ${balances.eurc}`
    });
  }
});
```

**Nota:** Para comandos, pode ser mais simples criar um bot separado ou usar a conta pessoal apenas para receber alertas.

---

## 🔒 Segurança

### 1. Autenticação da Conta Pessoal

- ✅ API ID e API Hash em variáveis de ambiente
- ✅ Session string em variável de ambiente (após primeiro login)
- ✅ Session file (`.session`) não commitar no git
- ✅ Adicionar `.session` ao `.gitignore`
- ✅ Considerar usar StringSession (mais fácil para serverless)
- ✅ Reautenticação automática se sessão expirar

### 2. Proteção da API Route

- ✅ Verificar header `x-vercel-cron` (Vercel Cron)
- ✅ Token secreto adicional (opcional)
- ✅ Validar que é chamada apenas pelo cron

### 3. Validação de Dados

- ✅ Validar saldos antes de enviar alertas
- ✅ Validar eventos do contrato
- ✅ Tratar erros graciosamente

---

## 📊 Estrutura de Arquivos

```
app/
  api/
    cron/
      telegram-monitor/
        route.ts              # API route principal
    telegram/
      webhook/
        route.ts              # Webhook para comandos (opcional)

lib/
  config/
    telegram-monitor.ts       # Configurações de thresholds
    telegram.ts               # Configuração (API ID, API Hash, session)
  services/
    telegram.ts               # Serviço para enviar mensagens (GramJS)
    contract-monitor.ts       # Serviço para monitorar contratos

docs/
  TELEGRAM_MONITORING_PLAN.md # Este documento

vercel.json                   # Configuração do cron job
```

---

## ⚙️ Configuração do Vercel Cron

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/telegram-monitor",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Schedule:**
- `*/5 * * * *` = A cada 5 minutos (recomendado)
- `*/10 * * * *` = A cada 10 minutos (menos frequente)
- `*/1 * * * *` = A cada minuto (muito frequente, pode ser excessivo)

---

## 🧪 Fluxo de Funcionamento

### Execução Normal:

1. **Cron dispara** (`*/5 * * * *`)
2. **API route executa:**
   - Busca eventos `Claimed` dos últimos 10 minutos
   - Compara com cache (última verificação)
   - Identifica novos claims
3. **Para cada novo claim:**
   - Lê saldo do contrato correspondente
   - Compara com threshold
   - Se abaixo: envia alerta Telegram
4. **Atualiza cache:**
   - Salva timestamp da verificação
   - Salva totalClaims atual
   - Salva saldos atuais
5. **Retorna status** (logs)

### Exemplo de Execução:

```
14:00:00 - Cron dispara
14:00:01 - Busca eventos (últimos 10 min)
14:00:02 - Encontra 2 novos claims:
           - USDC: 0x123... claimou 100 USDC
           - EURC: 0x456... claimou 50 EURC
14:00:03 - Verifica saldo USDC: 450 USDC (< 500) → Alerta!
14:00:04 - Verifica saldo EURC: 300 EURC (> 250) → OK
14:00:05 - Envia mensagem Telegram para USDC
14:00:06 - Atualiza cache
14:00:07 - Retorna sucesso
```

---

## 📈 Informações a Monitorar

### Por Claim:
- Endereço que claimou
- Quantidade claimada
- Timestamp do claim
- Token (USDC/EURC)
- Saldo do contrato após claim
- Transaction hash

### Agregado:
- Total de claims hoje
- Total de claims por token
- Saldo atual de cada contrato
- Claims restantes (estimado)
- Último claim (timestamp)

---

## 🚨 Tipos de Alertas

### 1. Alerta Crítico
**Quando:** `balance < threshold` E `remainingClaims < 5`
**Prioridade:** Alta
**Ação:** Refill urgente necessário

### 2. Alerta Informativo
**Quando:** `balance < threshold` mas `remainingClaims >= 5`
**Prioridade:** Média
**Ação:** Planejar refill

### 3. Alerta de Wallet Baixa
**Quando:** Wallet de refill com saldo baixo
**Prioridade:** Alta
**Ação:** Adicionar fundos à wallet

### 4. Resumo Periódico
**Quando:** Diário ou semanal
**Prioridade:** Baixa
**Ação:** Informativo apenas

---

## 🔄 Alternativas e Melhorias Futuras

### 1. WebSocket em Tempo Real
- Conexão WebSocket com node RPC
- Escuta eventos em tempo real
- Alerta imediato (sem delay)

### 2. Dashboard Web
- Interface web para visualizar status
- Histórico de claims
- Gráficos de uso

### 3. Múltiplos Canais
- Telegram + Discord
- Telegram + Email
- Telegram + Slack

### 4. Alertas Inteligentes
- Aprender padrões de uso
- Prever quando precisa refill
- Alertas proativos

---

## 📝 Checklist de Implementação

### Preparação
- [ ] Obter API ID e API Hash em https://my.telegram.org/apps
- [ ] Instalar GramJS: `npm install gramjs`
- [ ] Criar script de autenticação inicial
- [ ] Fazer primeiro login e obter session string
- [ ] Configurar variáveis de ambiente (API_ID, API_HASH, SESSION)
- [ ] Adicionar `.session` ao `.gitignore`
- [ ] Definir thresholds iniciais

### Desenvolvimento
- [ ] Criar `lib/config/telegram-monitor.ts`
- [ ] Criar `lib/services/telegram.ts` (usando GramJS)
  - [ ] Implementar inicialização do cliente
  - [ ] Implementar função de envio de mensagem
  - [ ] Implementar gerenciamento de sessão
- [ ] Criar `lib/services/contract-monitor.ts` (buscar eventos)
- [ ] Criar `app/api/cron/telegram-monitor/route.ts`
- [ ] Criar script de autenticação inicial (`scripts/telegram-auth.ts`)
- [ ] Implementar busca de eventos
- [ ] Implementar verificação de saldos
- [ ] Implementar envio de alertas
- [ ] Implementar cache (Vercel KV ou DB)

### Configuração
- [ ] Configurar `vercel.json` com cron
- [ ] Configurar variáveis de ambiente no Vercel
- [ ] Testar execução manual
- [ ] Verificar mensagens no Telegram

### Testes
- [ ] Testar busca de eventos
- [ ] Testar detecção de novos claims
- [ ] Testar envio de mensagens
- [ ] Testar alertas com saldo baixo
- [ ] Testar cache

### Melhorias (Opcional)
- [ ] Adicionar comandos do bot (`/status`, etc.)
- [ ] Adicionar webhook para comandos
- [ ] Adicionar formatação rica (Markdown)
- [ ] Adicionar links para ArcScan
- [ ] Adicionar resumos periódicos

---

## 🎯 Próximos Passos

1. **Revisar este plano** e decidir abordagem
2. **Criar bot no Telegram** e obter credenciais
3. **Definir thresholds** iniciais
4. **Implementar MVP** (buscar eventos + alertas básicos)
5. **Testar em testnet**
6. **Iterar e melhorar**

---

## 📚 Referências

- [GramJS Documentation](https://gram.js.org/)
- [GramJS GitHub](https://github.com/gram-js/gramjs)
- [Telegram API Documentation](https://core.telegram.org/api)
- [Telethon (Python) - Referência similar](https://docs.telethon.dev/)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [viem Event Logs](https://viem.sh/docs/actions/public/getLogs)
- [Vercel KV (Redis)](https://vercel.com/docs/storage/vercel-kv)
- [Obter API ID e Hash](https://my.telegram.org/apps)

---

## 💡 Exemplo de Mensagem Telegram

```
🚨 ALERTA - Faucet USDC

📉 Saldo atual: 450 USDC
⚠️ Threshold: 500 USDC
📊 Claims restantes: ~4

🔗 Contrato: https://testnet.arcscan.app/address/0x554F2856926326dE250f0e855654c408E2822430

💡 Ação recomendada: Fazer refill de 1,000 USDC
```

## 🔐 Autenticação Inicial (Primeira Vez)

**Script de autenticação (`scripts/telegram-auth.ts`):**

```typescript
import { TelegramClient } from 'gramjs';
import { StringSession } from 'gramjs/sessions';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string) => 
  new Promise<string>(resolve => rl.question(query, resolve));

async function authenticate() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID!);
  const apiHash = process.env.TELEGRAM_API_HASH!;
  
  const client = new TelegramClient(
    new StringSession(''),
    apiId,
    apiHash,
    {}
  );

  await client.start({
    phoneNumber: async () => await question('Digite seu número de telefone: '),
    password: async () => await question('Digite sua senha 2FA (se tiver): '),
    phoneCode: async () => await question('Digite o código recebido: '),
    onError: (err) => console.error('Erro:', err),
  });

  const sessionString = client.session.save() as unknown as string;
  console.log('\n✅ Autenticação bem-sucedida!');
  console.log('\n📋 SESSION STRING (adicione ao .env.local):');
  console.log(sessionString);
  console.log('\n⚠️  IMPORTANTE: Não compartilhe esta string!');
  
  await client.disconnect();
  rl.close();
}

authenticate();
```

**Uso:**
```bash
# Configurar variáveis de ambiente
export TELEGRAM_API_ID=12345678
export TELEGRAM_API_HASH=abcdef...

# Executar script
npx tsx scripts/telegram-auth.ts

# Copiar SESSION STRING para .env.local
```

---

**Última atualização:** 2025-01-15  
**Status:** 📋 Planejamento

