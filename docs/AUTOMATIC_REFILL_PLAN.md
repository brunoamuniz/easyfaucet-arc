# 📋 Plano de Implementação: Refill Automático de Faucets

## 🎯 Objetivo

Criar um processo automatizado (Cron Job) que executa a cada 15 minutos para:
1. Verificar os saldos dos contratos USDC e EURC
2. Detectar quando os saldos estão abaixo de um threshold
3. Fazer refill automático dos contratos quando necessário
4. Registrar logs e enviar alertas

---

## 🏗️ Arquitetura e Opções de Implementação

### Opção 1: Vercel Cron Jobs (Recomendado) ⭐

**Vantagens:**
- ✅ Integrado com a plataforma de deploy (Vercel)
- ✅ Não precisa de servidor próprio
- ✅ Fácil de configurar via `vercel.json`
- ✅ Suporta autenticação via headers
- ✅ Logs integrados no dashboard da Vercel
- ✅ Escalável automaticamente

**Desvantagens:**
- ⚠️ Limite de execução: 10 segundos (Hobby), 60 segundos (Pro)
- ⚠️ Pode precisar de upgrade de plano para execuções mais longas

**Implementação:**
- Criar API route: `app/api/cron/refill/route.ts`
- Configurar em `vercel.json` com schedule
- Usar variáveis de ambiente para autenticação

---

### Opção 2: GitHub Actions (Alternativa)

**Vantagens:**
- ✅ Gratuito para repositórios públicos
- ✅ Execução mais longa (até 6 horas)
- ✅ Pode usar secrets do GitHub
- ✅ Logs visíveis no GitHub

**Desvantagens:**
- ⚠️ Requer repositório no GitHub
- ⚠️ Execução menos frequente (mínimo 5 minutos)
- ⚠️ Depende do GitHub estar disponível

**Implementação:**
- Criar workflow: `.github/workflows/refill-faucets.yml`
- Usar `schedule` com cron expression
- Executar scripts via `cast` ou Node.js

---

### Opção 3: Servidor Próprio / VPS

**Vantagens:**
- ✅ Controle total sobre execução
- ✅ Sem limites de tempo
- ✅ Pode rodar scripts bash diretamente
- ✅ Flexível para customizações

**Desvantagens:**
- ⚠️ Precisa manter servidor rodando
- ⚠️ Custos de infraestrutura
- ⚠️ Precisa configurar cron manualmente
- ⚠️ Manutenção adicional

**Implementação:**
- Configurar crontab: `*/15 * * * * /path/to/refill-script.sh`
- Usar scripts bash existentes (`fund-faucet.sh`, `fund-eurc-faucet.sh`)

---

### Opção 4: Railway / Render Cron Jobs

**Vantagens:**
- ✅ Similar ao Vercel
- ✅ Suporte a cron jobs nativo
- ✅ Fácil configuração

**Desvantagens:**
- ⚠️ Plataforma adicional para gerenciar
- ⚠️ Custos podem variar

---

## 🎯 Recomendação: Vercel Cron Jobs

**Por quê:**
- A aplicação já está no Vercel
- Integração nativa
- Fácil de configurar e manter
- Logs centralizados

---

## 📐 Estrutura da Solução

### 1. API Route para Refill (`app/api/cron/refill/route.ts`)

**Funcionalidades:**
- Verificar saldo do contrato USDC
- Verificar saldo do contrato EURC
- Verificar saldo da wallet (fonte de fundos)
- Calcular quanto precisa refillar
- Executar transferências se necessário
- Registrar logs estruturados
- Retornar status JSON

**Autenticação:**
- Usar header `Authorization` com token secreto
- Ou usar `x-vercel-cron` header (automático do Vercel)

**Estrutura:**
```typescript
export async function GET(request: NextRequest) {
  // 1. Verificar autenticação
  // 2. Verificar saldos dos contratos
  // 3. Verificar saldo da wallet
  // 4. Calcular necessidade de refill
  // 5. Executar refills se necessário
  // 6. Retornar relatório
}
```

---

### 2. Configuração de Thresholds

**Configuração sugerida:**

```typescript
// lib/config/refill.ts
export const REFILL_CONFIG = {
  USDC: {
    minBalance: 500, // Mínimo antes de refill (em USDC)
    refillAmount: 1000, // Quantidade a refillar (em USDC)
    maxBalance: 10000, // Máximo para evitar over-funding
  },
  EURC: {
    minBalance: 250, // Mínimo antes de refill (em EURC)
    refillAmount: 1000, // Quantidade a refillar (em EURC)
    maxBalance: 5000, // Máximo para evitar over-funding
  },
  // Configurações gerais
  walletMinBalance: {
    USDC: 2000, // Mínimo na wallet antes de tentar refill
    EURC: 2000, // Mínimo na wallet antes de tentar refill
  },
};
```

**Lógica de Refill:**
- Se `contractBalance < minBalance` E `walletBalance >= walletMinBalance + refillAmount`:
  - Executar refill
- Se `contractBalance >= maxBalance`:
  - Não fazer nada (já está bem fundado)
- Se `walletBalance < walletMinBalance + refillAmount`:
  - Enviar alerta (wallet precisa de fundos)

---

### 3. Verificação de Saldos

**Métodos:**

1. **Via viem (recomendado):**
   ```typescript
   const balance = await publicClient.readContract({
     address: FAUCET_CONTRACT_ADDRESS,
     abi: ARCTESTNET_FAUCET_ABI,
     functionName: "faucetBalance",
   });
   ```

2. **Via cast (alternativa):**
   ```bash
   cast call $CONTRACT "faucetBalance()(uint256)" --rpc-url $RPC_URL
   ```

**Tokens a verificar:**
- USDC Faucet: `0x554F2856926326dE250f0e855654c408E2822430`
- EURC Faucet: `0x8b14f3Aa7182243e95C8a8BAE843D33EE6f3B539`
- Wallet USDC: `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343`
- Wallet EURC: `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343`

---

### 4. Execução de Refills

**Opções:**

**A) Reutilizar scripts bash existentes:**
- Chamar `scripts/fund-faucet.sh` e `scripts/fund-eurc-faucet.sh`
- Via `child_process.exec()` ou `execSync()`

**B) Implementar lógica direta em TypeScript:**
- Usar `viem` para fazer transferências
- Mais controle e melhor logging
- Melhor tratamento de erros

**Recomendação: Opção B (TypeScript direto)**

---

### 5. Logging e Monitoramento

**Logs estruturados:**
```typescript
{
  timestamp: "2025-01-15T14:30:00Z",
  executionId: "uuid",
  checks: {
    usdc: {
      contractBalance: 450,
      walletBalance: 5000,
      needsRefill: true,
      refillAmount: 1000,
      action: "refilled" | "skipped" | "insufficient_wallet"
    },
    eurc: {
      contractBalance: 200,
      walletBalance: 3000,
      needsRefill: true,
      refillAmount: 1000,
      action: "refilled" | "skipped" | "insufficient_wallet"
    }
  },
  transactions: [
    {
      token: "USDC",
      txHash: "0x...",
      amount: 1000,
      status: "success" | "failed"
    }
  ],
  errors: []
}
```

**Armazenamento:**
- Console logs (Vercel logs)
- Opcional: Database (Vercel Postgres, Supabase)
- Opcional: Webhook para notificações (Discord, Slack, Email)

---

### 6. Alertas e Notificações

**Cenários para alertar:**

1. **Wallet com saldo baixo:**
   - Quando `walletBalance < walletMinBalance + refillAmount`
   - Alerta: "Wallet precisa de fundos para refill automático"

2. **Refill falhou:**
   - Quando transação falha
   - Alerta: "Falha ao refillar contrato USDC/EURC"

3. **Contrato com saldo crítico:**
   - Quando `contractBalance < minBalance / 2` (muito baixo)
   - Alerta: "Contrato USDC/EURC com saldo crítico"

4. **Múltiplas falhas consecutivas:**
   - Quando refill falha 3 vezes seguidas
   - Alerta: "Refill automático com problemas recorrentes"

**Canais de notificação:**
- Email (via SendGrid, Resend, etc.)
- Discord webhook
- Slack webhook
- Telegram bot

---

## 🔒 Segurança

### 1. Autenticação do Cron Job

**Vercel Cron Jobs:**
- Header automático: `x-vercel-cron: 1`
- Verificar este header na API route
- Adicionar token secreto adicional (opcional)

**Implementação:**
```typescript
const cronSecret = request.headers.get("x-vercel-cron");
const authToken = request.headers.get("authorization");

if (cronSecret !== "1" && authToken !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### 2. Proteção de Private Key

- ✅ Usar variável de ambiente `PRIVATE_KEY`
- ✅ Nunca commitar no código
- ✅ Usar Vercel Environment Variables
- ✅ Considerar usar wallet separada apenas para refills

### 3. Rate Limiting

- Limitar execuções (máximo 1 por 15 minutos)
- Prevenir execuções manuais acidentais
- Validar origem da requisição

---

## 📊 Estrutura de Arquivos

```
app/
  api/
    cron/
      refill/
        route.ts          # API route para refill automático

lib/
  config/
    refill.ts             # Configurações de thresholds e amounts
    faucet.ts             # (já existe) Endereços dos contratos

scripts/
  refill-faucets.sh       # Script bash alternativo (se necessário)

docs/
  AUTOMATIC_REFILL_PLAN.md  # Este documento

vercel.json               # Configuração do cron job
```

---

## ⚙️ Configuração do Vercel Cron

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/refill",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Schedule:**
- `*/15 * * * *` = A cada 15 minutos
- `0 */1 * * *` = A cada hora
- `0 0 * * *` = Uma vez por dia (meia-noite)

---

## 🧪 Testes e Validação

### Testes Manuais

1. **Testar verificação de saldos:**
   - Chamar API manualmente
   - Verificar se retorna saldos corretos

2. **Testar lógica de refill:**
   - Simular saldo baixo
   - Verificar se calcula refill corretamente

3. **Testar execução de refill:**
   - Executar refill em testnet
   - Verificar transação no explorer

4. **Testar alertas:**
   - Simular saldo baixo na wallet
   - Verificar se alerta é enviado

### Testes Automatizados

- Unit tests para lógica de cálculo
- Integration tests para API route
- E2E tests para fluxo completo

---

## 📈 Métricas e Monitoramento

### Métricas a rastrear:

1. **Frequência de refills:**
   - Quantas vezes refillou por dia/semana
   - Qual token precisa mais refills

2. **Saldo médio dos contratos:**
   - Saldo médio antes de refill
   - Saldo médio após refill

3. **Taxa de sucesso:**
   - % de refills bem-sucedidos
   - % de falhas

4. **Custos de gas:**
   - Gas usado por refill
   - Custo total por período

---

## 🚀 Fases de Implementação

### Fase 1: MVP (Mínimo Viável)
- [ ] Criar API route básica
- [ ] Verificar saldos dos contratos
- [ ] Lógica simples de refill (se < threshold, refill)
- [ ] Logs básicos no console
- [ ] Configurar Vercel Cron

### Fase 2: Melhorias
- [ ] Adicionar configuração de thresholds
- [ ] Verificar saldo da wallet antes de refill
- [ ] Melhorar logs estruturados
- [ ] Tratamento de erros robusto

### Fase 3: Alertas
- [ ] Implementar sistema de alertas
- [ ] Notificações por email/webhook
- [ ] Dashboard de monitoramento (opcional)

### Fase 4: Otimizações
- [ ] Histórico de refills (database)
- [ ] Análise de padrões de uso
- [ ] Ajuste automático de thresholds
- [ ] Métricas e relatórios

---

## ⚠️ Considerações Importantes

### 1. Custos de Gas
- Cada refill custa gas
- Considerar frequência vs. custo
- Talvez refillar menos frequentemente mas em maior quantidade

### 2. Limites de Execução
- Vercel Hobby: 10 segundos máximo
- Vercel Pro: 60 segundos máximo
- Se precisar mais tempo, considerar GitHub Actions

### 3. Falhas e Retry
- Implementar retry logic para falhas temporárias
- Não fazer retry infinito (evitar spam)
- Registrar falhas para análise

### 4. Wallet de Refill
- Considerar wallet separada apenas para refills
- Limitar quantidade máxima por refill
- Monitorar saldo da wallet

---

## 📝 Checklist de Implementação

### Preparação
- [ ] Decidir plataforma (Vercel Cron recomendado)
- [ ] Configurar variáveis de ambiente
- [ ] Definir thresholds iniciais
- [ ] Configurar wallet de refill

### Desenvolvimento
- [ ] Criar `lib/config/refill.ts` com configurações
- [ ] Criar `app/api/cron/refill/route.ts`
- [ ] Implementar verificação de saldos
- [ ] Implementar lógica de refill
- [ ] Implementar logging
- [ ] Adicionar tratamento de erros

### Configuração
- [ ] Configurar `vercel.json` com cron schedule
- [ ] Configurar autenticação
- [ ] Testar execução manual
- [ ] Verificar logs

### Monitoramento
- [ ] Configurar alertas (opcional)
- [ ] Criar dashboard (opcional)
- [ ] Documentar processo

---

## 🔄 Próximos Passos

1. **Revisar este plano** e decidir abordagem
2. **Definir thresholds** iniciais
3. **Implementar Fase 1 (MVP)**
4. **Testar em testnet**
5. **Iterar e melhorar**

---

## 📚 Referências

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [viem Documentation](https://viem.sh/)
- [GitHub Actions Scheduled Events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)

---

**Última atualização:** 2025-01-15  
**Status:** 📋 Planejamento

