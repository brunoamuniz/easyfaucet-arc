# 📋 Plano: Migração Auto-Refill para Backend (Vercel Cron Jobs)

## 🎯 Objetivo

Migrar o script Python de auto-refill (`scripts/auto-refill-faucets.py`) para uma API route do Next.js que será executada automaticamente via Vercel Cron Jobs a cada 10 minutos.

## ✅ Vantagens

- ✅ Não precisa de máquina rodando 24/7
- ✅ Usa infraestrutura do Vercel (serverless)
- ✅ Mais fácil de gerenciar e monitorar
- ✅ Logs integrados no Vercel Dashboard
- ✅ Mesma stack do projeto (TypeScript/Next.js)
- ✅ Reutiliza código existente (viem, contratos, etc.)

## 🔒 Verificação de Dados Sensíveis

### ✅ Dados que JÁ estão no Backend (Seguros)

1. **PRIVATE_KEY** ✅
   - **Status**: Já usado em `app/api/claim/route.ts`
   - **Localização**: Variável de ambiente (`.env.local` / Vercel)
   - **Uso**: Para assinar transações gasless
   - **Ação**: Reutilizar a mesma variável

2. **Contratos e Tokens** ✅
   - **Status**: Já configurados em `lib/config/faucet.ts`
   - **Endereços**: Públicos (não sensíveis)
   - **Ação**: Reutilizar configurações existentes

3. **RPC URL** ✅
   - **Status**: Já configurado
   - **Ação**: Reutilizar `arcTestnet` de `lib/config/chains.ts`

### ⚠️ Dados que NÃO devem ser commitados

- ❌ `PRIVATE_KEY` - Já está no `.gitignore` via `.env.local`
- ❌ `REDIS_URL` - Já está no `.gitignore`
- ❌ Script Python - Já está no `.gitignore`

## 📐 Arquitetura Proposta

### 1. Nova API Route: `/app/api/refill/route.ts`

**Endpoint**: `GET /api/refill`

**Funcionalidades**:
- Verifica saldos dos contratos USDC e EURC
- Reabastece se saldo < threshold
- Retorna status JSON
- Logs estruturados

**Autenticação**:
- Usar `Authorization` header com secret (opcional, mas recomendado)
- Ou usar Vercel Cron Job secret (mais seguro)

### 2. Vercel Cron Job Configuration

**Arquivo**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/refill",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Schedule**: `*/10 * * * *` = A cada 10 minutos

### 3. Variáveis de Ambiente

**Já existentes** (reutilizar):
- `PRIVATE_KEY` - Para assinar transações
- `ARC_TESTNET_RPC_URL` - RPC endpoint (opcional, tem default)
- `REDIS_URL` - Para logs/estatísticas (opcional)

**Novas** (adicionar no Vercel):
- `USDC_THRESHOLD` - Default: 4000
- `EURC_THRESHOLD` - Default: 2000
- `USDC_REFILL_AMOUNT` - Default: 2000
- `EURC_REFILL_AMOUNT` - Default: 1000
- `REFILL_CRON_SECRET` - Secret para autenticar chamadas do cron (opcional)

## 🔧 Implementação Técnica

### Estrutura de Arquivos

```
app/
  api/
    refill/
      route.ts          # Nova API route para auto-refill
lib/
  services/
    refill-service.ts  # Lógica de negócio (opcional, para organização)
  contracts/
    ERC20.abi.ts       # ABI do ERC20 (transfer, balanceOf)
```

### Dependências

**Já instaladas**:
- ✅ `viem` - Para interagir com blockchain
- ✅ `@/lib/config/faucet` - Configurações dos contratos
- ✅ `@/lib/config/chains` - Configuração da chain

**Não precisa instalar nada novo!**

### Lógica de Migração

#### Python → TypeScript

| Python (web3.py) | TypeScript (viem) |
|------------------|-------------------|
| `Web3(HTTPProvider(RPC_URL))` | `createPublicClient({ chain, transport: http() })` |
| `w3.eth.account.from_key()` | `privateKeyToAccount()` |
| `contract.functions.balanceOf()` | `readContract({ functionName: 'balanceOf' })` |
| `contract.functions.transfer()` | `writeContract({ functionName: 'transfer' })` |
| `w3.eth.get_transaction_count()` | `getTransactionCount()` |
| `w3.eth.send_raw_transaction()` | `sendTransaction()` |
| `w3.eth.wait_for_transaction_receipt()` | `waitForTransactionReceipt()` |

### Código Base

```typescript
// app/api/refill/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/config/chains";
import { USDC_FAUCET_ADDRESS, EURC_FAUCET_ADDRESS, USDC_TESTNET_ADDRESS, EURC_TESTNET_ADDRESS } from "@/lib/config/faucet";
import { ARCTESTNET_FAUCET_ABI } from "@/lib/contracts/ArcTestnetFaucet.abi";

// ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// Thresholds (configuráveis via env)
const USDC_THRESHOLD = BigInt(process.env.USDC_THRESHOLD || "4000") * BigInt(1_000_000);
const EURC_THRESHOLD = BigInt(process.env.EURC_THRESHOLD || "2000") * BigInt(1_000_000);
const USDC_REFILL_AMOUNT = BigInt(process.env.USDC_REFILL_AMOUNT || "2000") * BigInt(1_000_000);
const EURC_REFILL_AMOUNT = BigInt(process.env.EURC_REFILL_AMOUNT || "1000") * BigInt(1_000_000);

export async function GET(request: NextRequest) {
  // Verificar autenticação (opcional)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.REFILL_CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    usdc: { checked: false, refilled: false, balance: "0", threshold: USDC_THRESHOLD.toString() },
    eurc: { checked: false, refilled: false, balance: "0", threshold: EURC_THRESHOLD.toString() },
    errors: [] as string[],
  };

  try {
    // Inicializar clients
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
    });

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not configured");
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
    });

    // Verificar e reabastecer USDC
    try {
      const usdcBalance = await publicClient.readContract({
        address: USDC_FAUCET_ADDRESS,
        abi: ARCTESTNET_FAUCET_ABI,
        functionName: "faucetBalance",
      });

      results.usdc.checked = true;
      results.usdc.balance = usdcBalance.toString();

      if (usdcBalance < USDC_THRESHOLD) {
        // Verificar saldo da wallet
        const walletBalance = await publicClient.readContract({
          address: USDC_TESTNET_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        });

        if (walletBalance >= USDC_REFILL_AMOUNT) {
          // Transferir
          const txHash = await walletClient.writeContract({
            address: USDC_TESTNET_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [USDC_FAUCET_ADDRESS, USDC_REFILL_AMOUNT],
          });

          await publicClient.waitForTransactionReceipt({ hash: txHash });
          results.usdc.refilled = true;
        }
      }
    } catch (error: any) {
      results.errors.push(`USDC error: ${error.message}`);
    }

    // Verificar e reabastecer EURC (mesma lógica)
    // ...

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      ...results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        ...results,
      },
      { status: 500 }
    );
  }
}
```

## 📝 Checklist de Implementação

### Fase 1: Preparação
- [ ] Verificar que `PRIVATE_KEY` está configurado no Vercel
- [ ] Verificar que não há dados sensíveis no código
- [ ] Criar ERC20 ABI mínimo (ou reutilizar se já existir)

### Fase 2: Implementação
- [ ] Criar `app/api/refill/route.ts`
- [ ] Implementar lógica de verificação de saldo
- [ ] Implementar lógica de reabastecimento
- [ ] Adicionar tratamento de erros
- [ ] Adicionar logs estruturados

### Fase 3: Configuração Vercel
- [ ] Adicionar cron job no `vercel.json`
- [ ] Configurar variáveis de ambiente no Vercel Dashboard:
  - `USDC_THRESHOLD=4000`
  - `EURC_THRESHOLD=2000`
  - `USDC_REFILL_AMOUNT=2000`
  - `EURC_REFILL_AMOUNT=1000`
  - `REFILL_CRON_SECRET` (opcional, mas recomendado)

### Fase 4: Testes
- [ ] Testar endpoint manualmente (`GET /api/refill`)
- [ ] Verificar logs no Vercel Dashboard
- [ ] Verificar transações no ArcScan
- [ ] Monitorar execução do cron job

### Fase 5: Limpeza
- [ ] Documentar a nova implementação
- [ ] Atualizar README se necessário
- [ ] Manter script Python como backup (não deletar ainda)

## 🔐 Segurança

### Autenticação do Cron Job

**Opção 1: Authorization Header (Recomendado)**
```typescript
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.REFILL_CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Opção 2: Vercel Cron Secret (Automático)**
- Vercel adiciona automaticamente header `x-vercel-cron` nas requisições de cron jobs
- Verificar: `request.headers.get("x-vercel-cron") === "1"`

### Rate Limiting

- Vercel Cron Jobs têm limite de execução (10 minutos mínimo)
- Não precisa de rate limiting adicional (já é controlado pelo Vercel)

## 📊 Monitoramento

### Logs

- **Vercel Dashboard**: Logs automáticos de cada execução
- **Response JSON**: Status detalhado de cada verificação
- **ArcScan**: Transações on-chain para auditoria

### Métricas

- Tempo de execução
- Saldos verificados
- Reabastecimentos realizados
- Erros ocorridos

## ⚠️ Considerações

### Timeout

- Vercel Serverless Functions têm timeout de 10s (Hobby) ou 60s (Pro)
- Transações blockchain podem demorar
- **Solução**: Usar `waitForTransactionReceipt` com timeout menor ou fazer polling assíncrono

### Custos

- Vercel Cron Jobs são gratuitos no plano Hobby
- Cada execução conta como uma função serverless
- Estimativa: ~144 execuções/dia (a cada 10 min) = ~4320/mês

### Confiabilidade

- Vercel Cron Jobs são confiáveis, mas não garantem execução exata
- Pode haver atrasos de alguns minutos
- **Recomendação**: Manter thresholds conservadores

## 🚀 Próximos Passos

1. **Revisar este plano** com a equipe
2. **Implementar** a API route
3. **Testar** localmente
4. **Configurar** no Vercel
5. **Monitorar** primeiras execuções
6. **Ajustar** thresholds se necessário

## 📚 Referências

- [Vercel Cron Jobs Docs](https://vercel.com/docs/cron-jobs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [viem Documentation](https://viem.sh/)
