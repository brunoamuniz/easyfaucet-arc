# 📋 Plano de Implementação: Alertas Telegram Event-Driven

## 🎯 Objetivo

Criar um sistema de alertas que:
1. **Dispara após cada claim bem-sucedido** (não usa Cron Job)
2. **Verifica saldo do contrato** imediatamente após o claim
3. **Envia alerta Telegram** se saldo estiver abaixo do threshold
4. **Executa de forma assíncrona** (não bloqueia resposta ao usuário)
5. **Usa Bot do Telegram** (não conta pessoal)

---

## 🏗️ Arquitetura: Event-Driven (Não Cron)

### Diferença das Abordagens

**Cron Job (abordagem anterior):**
- Executa periodicamente (a cada X minutos)
- Verifica eventos mesmo sem atividade
- Pode ter delay entre claim e verificação

**Event-Driven (esta abordagem):**
- Dispara apenas quando há claim bem-sucedido
- Verificação imediata após o claim
- Mais eficiente (só executa quando necessário)
- Sem delay desnecessário

---

## 📐 Fluxo de Funcionamento

### Fluxo Completo:

```
1. Usuário faz claim
   ↓
2. API processa claim
   ↓
3. Transação confirmada com sucesso
   ↓
4. API retorna sucesso para usuário (não bloqueia)
   ↓
5. [ASSÍNCRONO] Verificar saldo do contrato
   ↓
6. [ASSÍNCRONO] Comparar com threshold
   ↓
7. [ASSÍNCRONO] Se < threshold → Enviar alerta Telegram
   ↓
8. [ASSÍNCRONO] Log do processo
```

### Ponto de Integração:

**Local:** `app/api/claim/route.ts`
- Após confirmar transação bem-sucedida
- Antes de retornar resposta ao usuário
- Executar verificação de forma assíncrona (não await)

---

## 🔧 Implementação Técnica

### 1. Estrutura de Arquivos

```
app/
  api/
    claim/
      route.ts                    # API route existente (modificar)
    telegram/
      notify.ts                   # API route para enviar notificação (opcional)

lib/
  services/
    telegram-bot.ts               # Serviço para enviar mensagens via Bot API
    balance-checker.ts            # Serviço para verificar saldos
  config/
    telegram-bot.ts               # Configuração do bot (token, chat ID)
    thresholds.ts                 # Configuração de thresholds
```

---

### 2. Serviço de Telegram Bot (`lib/services/telegram-bot.ts`)

**Funcionalidades:**
- Enviar mensagens via Bot API
- Formatar mensagens de alerta
- Tratar erros graciosamente

**Implementação:**
```typescript
// lib/services/telegram-bot.ts
export async function sendTelegramAlert(
  token: string,
  chatId: string,
  message: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown', // Para formatação
        }),
      }
    );
    
    if (!response.ok) {
      console.error('Failed to send Telegram alert:', await response.text());
    }
  } catch (error) {
    console.error('Error sending Telegram alert:', error);
    // Não lançar erro - não queremos quebrar o fluxo principal
  }
}
```

**Características:**
- ✅ Não lança erros (não quebra fluxo principal)
- ✅ Logs de erro para debugging
- ✅ Timeout configurável
- ✅ Retry opcional (para falhas temporárias)

---

### 3. Serviço de Verificação de Saldo (`lib/services/balance-checker.ts`)

**Funcionalidades:**
- Verificar saldo de um contrato
- Comparar com threshold
- Retornar se precisa alerta

**Implementação:**
```typescript
// lib/services/balance-checker.ts
export async function checkBalanceAndAlert(
  contractAddress: string,
  token: 'USDC' | 'EURC',
  thresholds: ThresholdConfig
): Promise<{ needsAlert: boolean; balance: bigint; message?: string }> {
  // 1. Ler saldo do contrato
  const balance = await publicClient.readContract({
    address: contractAddress,
    abi: ARCTESTNET_FAUCET_ABI,
    functionName: 'faucetBalance',
  });
  
  // 2. Converter para unidades legíveis
  const balanceInUnits = Number(balance) / 1_000_000; // 6 decimals
  const threshold = token === 'USDC' 
    ? thresholds.USDC 
    : thresholds.EURC;
  
  // 3. Verificar se precisa alerta
  if (balanceInUnits < threshold) {
    const claimAmount = token === 'USDC' ? 100 : 50;
    const remainingClaims = Math.floor(balanceInUnits / claimAmount);
    
    return {
      needsAlert: true,
      balance,
      message: formatAlertMessage(token, balanceInUnits, threshold, remainingClaims),
    };
  }
  
  return { needsAlert: false, balance };
}
```

---

### 4. Integração na API Route (`app/api/claim/route.ts`)

**Modificação necessária:**

```typescript
// Após confirmar transação bem-sucedida
if (receipt.status === "success") {
  // Retornar resposta ao usuário IMEDIATAMENTE (não await)
  const response = NextResponse.json({
    success: true,
    transactionHash: hash,
    address,
  });
  
  // [ASSÍNCRONO] Verificar saldo e enviar alerta se necessário
  // Não usar await - executar em background
  checkBalanceAndNotify(faucetAddress, selectedToken).catch(error => {
    // Log erro mas não quebrar resposta
    console.error('Error in balance check/notification:', error);
  });
  
  return response;
}
```

**Função assíncrona:**
```typescript
async function checkBalanceAndNotify(
  contractAddress: string,
  token: 'USDC' | 'EURC'
): Promise<void> {
  try {
    // 1. Verificar saldo
    const result = await checkBalanceAndAlert(
      contractAddress,
      token,
      THRESHOLDS
    );
    
    // 2. Se precisa alerta, enviar
    if (result.needsAlert && result.message) {
      await sendTelegramAlert(
        process.env.TELEGRAM_BOT_TOKEN!,
        process.env.TELEGRAM_CHAT_ID!,
        result.message
      );
    }
  } catch (error) {
    // Log mas não propagar erro
    console.error('Error in checkBalanceAndNotify:', error);
  }
}
```

---

### 5. Configuração de Thresholds (`lib/config/thresholds.ts`)

```typescript
// lib/config/thresholds.ts
export const THRESHOLDS = {
  USDC: {
    alert: 500, // Alerta se saldo < 500 USDC
    claimAmount: 100, // Por claim
    minClaimsBeforeAlert: 5, // Alerta se < 5 claims restantes
  },
  EURC: {
    alert: 250, // Alerta se saldo < 250 EURC
    claimAmount: 50, // Por claim
    minClaimsBeforeAlert: 5, // Alerta se < 5 claims restantes
  },
} as const;
```

---

### 6. Formatação de Mensagens

**Formato de alerta:**

```typescript
function formatAlertMessage(
  token: 'USDC' | 'EURC',
  balance: number,
  threshold: number,
  remainingClaims: number
): string {
  const emoji = remainingClaims < 5 ? '🚨' : '⚠️';
  const severity = remainingClaims < 5 ? 'CRÍTICO' : 'Alerta';
  
  return `${emoji} *${severity} - Faucet ${token}*

📉 Saldo atual: ${balance.toFixed(2)} ${token}
⚠️ Threshold: ${threshold} ${token}
📊 Claims restantes: ~${remainingClaims}

🔗 Contrato: https://testnet.arcscan.app/address/${getContractAddress(token)}

💡 Ação recomendada: Fazer refill de ${token === 'USDC' ? '1,000' : '1,000'} ${token}`;
}
```

---

## ⚡ Garantindo Processo Assíncrono

### Opção 1: Fire-and-Forget (Recomendado)

```typescript
// Não usar await - executar em background
checkBalanceAndNotify(faucetAddress, selectedToken).catch(error => {
  console.error('Background task error:', error);
});
```

**Vantagens:**
- ✅ Simples
- ✅ Não bloqueia resposta
- ✅ Erros não afetam usuário

**Desvantagens:**
- ⚠️ Não há garantia de execução (se servidor reiniciar)
- ⚠️ Erros silenciosos (apenas logs)

---

### Opção 2: Queue System (Mais Robusto)

**Usar fila de tarefas:**
- Vercel Queue (se disponível)
- In-memory queue simples
- Database queue

**Implementação simples:**
```typescript
// lib/services/queue.ts
const taskQueue: Array<() => Promise<void>> = [];

export function enqueueTask(task: () => Promise<void>) {
  taskQueue.push(task);
  // Processar em background
  processQueue();
}

async function processQueue() {
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    if (task) {
      task().catch(error => console.error('Queue task error:', error));
    }
  }
}
```

**Uso:**
```typescript
// Enfileirar tarefa
enqueueTask(() => checkBalanceAndNotify(faucetAddress, selectedToken));
```

---

### Opção 3: Worker Thread (Node.js)

**Usar Worker Thread para processar em background:**
- Mais complexo
- Melhor isolamento
- Pode ser overkill para este caso

---

## 🔒 Segurança e Boas Práticas

### 1. Variáveis de Ambiente

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

**Onde configurar:**
- Vercel Environment Variables
- Nunca commitar no código
- Adicionar ao `.env.example` (sem valores reais)

---

### 2. Rate Limiting de Alertas

**Problema:** Múltiplos claims podem gerar múltiplos alertas

**Solução:** Cache de último alerta enviado

```typescript
// Cache simples (em memória ou Vercel KV)
const lastAlertSent = {
  USDC: 0, // Timestamp
  EURC: 0,
};

// Só enviar alerta se não enviou nos últimos 30 minutos
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutos

if (Date.now() - lastAlertSent[token] > ALERT_COOLDOWN) {
  await sendTelegramAlert(...);
  lastAlertSent[token] = Date.now();
}
```

---

### 3. Tratamento de Erros

**Regras:**
- ✅ Nunca lançar erro que quebre resposta ao usuário
- ✅ Logs detalhados para debugging
- ✅ Retry para falhas temporárias (opcional)
- ✅ Timeout para evitar espera infinita

---

### 4. Validação de Configuração

```typescript
// Verificar se Telegram está configurado (opcional)
const isTelegramConfigured = 
  process.env.TELEGRAM_BOT_TOKEN && 
  process.env.TELEGRAM_CHAT_ID;

if (!isTelegramConfigured) {
  console.warn('Telegram not configured - skipping alerts');
  return; // Não executar verificação
}
```

---

## 📊 Estrutura de Arquivos Detalhada

```
app/
  api/
    claim/
      route.ts                    # Modificar: adicionar verificação assíncrona

lib/
  services/
    telegram-bot.ts               # Enviar mensagens via Bot API
    balance-checker.ts            # Verificar saldos e comparar thresholds
    queue.ts                      # Sistema de fila (opcional)
  config/
    telegram-bot.ts               # Configuração do bot
    thresholds.ts                 # Thresholds de alerta

docs/
  TELEGRAM_EVENT_DRIVEN_PLAN.md   # Este documento
```

---

## 🧪 Fluxo de Teste

### Cenário 1: Claim bem-sucedido, saldo OK
```
1. Usuário faz claim
2. Transação confirmada
3. API retorna sucesso
4. [Background] Verifica saldo: 1000 USDC (> 500)
5. [Background] Não envia alerta
6. Usuário vê sucesso normalmente
```

### Cenário 2: Claim bem-sucedido, saldo baixo
```
1. Usuário faz claim
2. Transação confirmada
3. API retorna sucesso
4. [Background] Verifica saldo: 450 USDC (< 500)
5. [Background] Envia alerta Telegram
6. Usuário vê sucesso normalmente (não sabe do alerta)
7. Você recebe mensagem no Telegram
```

### Cenário 3: Múltiplos claims rápidos
```
1. Claim 1: Saldo 450 USDC → Alerta enviado
2. Claim 2: Saldo 350 USDC → Alerta não enviado (cooldown 30min)
3. Claim 3: Saldo 250 USDC → Alerta não enviado (cooldown 30min)
4. Após 30min, próximo claim abaixo do threshold → Novo alerta
```

---

## ⚠️ Considerações Importantes

### 1. Timing da Verificação

**Quando verificar saldo?**
- ✅ Após transação confirmada (melhor)
- ⚠️ Antes de retornar resposta (pode adicionar delay)
- ❌ Durante processamento (bloqueia usuário)

**Recomendação:** Após confirmar transação, mas antes de retornar resposta (assíncrono)

---

### 2. Precisão do Saldo

**Considerações:**
- Saldo verificado é do momento após o claim
- Pode haver outros claims simultâneos
- Saldo pode mudar entre verificação e alerta
- Aceitável para propósito de alerta

---

### 3. Performance

**Impacto:**
- Verificação de saldo: ~100-500ms
- Envio Telegram: ~200-1000ms
- Total: ~300-1500ms (em background, não afeta usuário)

**Otimizações:**
- Timeout de 5 segundos para cada operação
- Não esperar resposta do Telegram
- Cache de saldo recente (evitar múltiplas verificações)

---

### 4. Falhas e Resilência

**Cenários de falha:**
1. **Falha ao verificar saldo:**
   - Log erro
   - Não enviar alerta
   - Não afetar resposta ao usuário

2. **Falha ao enviar Telegram:**
   - Log erro
   - Não afetar resposta ao usuário
   - Retry opcional (mas não crítico)

3. **Servidor reinicia durante processamento:**
   - Tarefa pode ser perdida
   - Aceitável (próximo claim vai verificar novamente)

---

## 📝 Checklist de Implementação

### Preparação
- [ ] Criar bot no Telegram via @BotFather
- [ ] Obter token do bot
- [ ] Obter Chat ID (seu ID ou grupo)
- [ ] Configurar variáveis de ambiente
- [ ] Definir thresholds iniciais

### Desenvolvimento
- [ ] Criar `lib/config/thresholds.ts`
- [ ] Criar `lib/config/telegram-bot.ts`
- [ ] Criar `lib/services/telegram-bot.ts`
- [ ] Criar `lib/services/balance-checker.ts`
- [ ] Modificar `app/api/claim/route.ts`:
  - [ ] Adicionar verificação assíncrona após sucesso
  - [ ] Implementar fire-and-forget
  - [ ] Adicionar tratamento de erros
- [ ] Implementar rate limiting de alertas (cooldown)
- [ ] Adicionar logs para debugging

### Testes
- [ ] Testar claim com saldo OK (não deve alertar)
- [ ] Testar claim com saldo baixo (deve alertar)
- [ ] Testar múltiplos claims rápidos (cooldown)
- [ ] Testar falha na verificação (não quebra resposta)
- [ ] Testar falha no Telegram (não quebra resposta)
- [ ] Verificar que resposta ao usuário não é bloqueada

### Configuração
- [ ] Configurar variáveis de ambiente no Vercel
- [ ] Testar em produção
- [ ] Verificar mensagens recebidas
- [ ] Ajustar thresholds se necessário

---

## 🎯 Vantagens desta Abordagem

✅ **Event-Driven:** Só executa quando necessário  
✅ **Tempo Real:** Verificação imediata após claim  
✅ **Não Bloqueante:** Usuário não espera  
✅ **Eficiente:** Não verifica sem necessidade  
✅ **Simples:** Não precisa Cron Job  
✅ **Robusto:** Erros não afetam usuário  

---

## ⚠️ Limitações

⚠️ **Depende de claim:** Se ninguém claimar, não verifica  
⚠️ **Pode perder alertas:** Se servidor reiniciar durante processamento  
⚠️ **Não histórico:** Não mantém histórico de verificações  
⚠️ **Rate limiting:** Precisa cooldown para evitar spam  

---

## 🔄 Melhorias Futuras (Opcional)

1. **Histórico de Alertas:**
   - Armazenar quando alertas foram enviados
   - Database ou Vercel KV

2. **Alertas Escalonados:**
   - Primeiro alerta: Informativo
   - Segundo alerta (se não refillou): Crítico
   - Terceiro alerta: Urgente

3. **Dashboard de Status:**
   - API route para ver status atual
   - Últimos alertas enviados
   - Histórico de saldos

4. **Múltiplos Destinatários:**
   - Enviar para múltiplos chats
   - Grupos do Telegram
   - Canais

---

## 📚 Referências

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [viem readContract](https://viem.sh/docs/actions/public/readContract)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

**Última atualização:** 2025-01-15  
**Status:** 📋 Planejamento

