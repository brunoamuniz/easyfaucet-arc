# 📋 Plano de Implementação EURC (EURO-C)

## 🎯 Objetivo

Implementar suporte para EURC (EURO-C) no faucet **sem alterar o contrato USDC existente**, criando um novo contrato dedicado para EURC.

## 📊 Situação Atual

### Contrato USDC (Existente)
- **Endereço do Contrato:** `0x554F2856926326dE250f0e855654c408E2822430`
- **Token USDC:** `0x3600000000000000000000000000000000000000`
- **Status:** ✅ Funcionando e em produção
- **Saldo Atual:** 10,000 USDC

### Contrato EURC (A Implementar)
- **Endereço do Contrato:** `0x0000000000000000000000000000000000000000` (placeholder - será preenchido após deploy)
- **Token EURC:** `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` ✅
  - [ArcScan](https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a)
- **Wallet com EURC:** `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343` ✅
- **Claim Amount:** 50 EURC (ao invés de 100)
- **Status:** ⏳ Pendente

## 🏗️ Arquitetura da Solução

### Estratégia: Contratos Separados

Em vez de modificar o contrato existente, vamos:

1. **Deploy de um novo contrato idêntico** ao `ArcTestnetFaucet.sol`, mas configurado para EURC
2. **Manter o contrato USDC intacto** - zero alterações
3. **Frontend dinâmico** - seleciona o contrato correto baseado na escolha do usuário (USDC/EURC)
4. **API route atualizada** - aceita parâmetro de token e usa o contrato apropriado
5. **Configuração centralizada** - ambos os endereços em `lib/config/faucet.ts`

### Vantagens desta Abordagem

✅ **Zero risco** para o contrato USDC em produção  
✅ **Isolamento completo** - problemas em um não afetam o outro  
✅ **Flexibilidade** - pode ter configurações diferentes (claim amount, cooldown)  
✅ **Manutenção independente** - pode pausar/fundar um sem afetar o outro  
✅ **Rollback fácil** - se algo der errado, apenas desabilita o EURC no frontend  

---

## 📝 FASE 1: Preparação e Configuração

### 1.1 Obter Endereço do Token EURC no ARC Testnet

**Status:** ✅ **CONCLUÍDO**

**Endereço do Token EURC:**
- **Contrato:** `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- **ArcScan:** [Ver no ArcScan](https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a)
- **Wallet com EURC:** `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343` ✅

**Ação:**
- [x] Endereço do token EURC obtido: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- [ ] Verificar decimais do token EURC (usar `cast call` para verificar `decimals()`)
- [ ] Verificar saldo de EURC na wallet usando `cast call` ou ArcScan
- [ ] Atualizar `EURC_TESTNET_ADDRESS` em `lib/config/faucet.ts`

**Referências:**
- ARC Testnet Explorer: https://testnet.arcscan.app
- Token EURC: [0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a](https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a)
- Wallet com EURC: `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343`

### 1.2 Verificar Decimais do EURC

**Status:** ✅ **CONCLUÍDO**

**Resultado:**
- **Decimais:** 6 (igual ao USDC) ✅
- **Claim Amount:** `50000000` (50 EURC com 6 decimais)
- **Saldo na Wallet:** 187.048620 EURC (187048620 com 6 decimais) ✅

**Ação:**
- [x] Decimais confirmados: 6 (igual ao USDC)
- [x] Saldo verificado na wallet: 187.048620 EURC
- [x] Claim amount definido: 50 EURC = 50000000 (com 6 decimais)

---

## 🔨 FASE 2: Deploy do Contrato EURC

### 2.1 Criar Script de Deploy para EURC

**Arquivo:** `scripts/deploy-eurc-faucet.sh`

**Conteúdo:**
```bash
#!/bin/bash
# Deploy ArcTestnetFaucet para EURC no ARC Testnet
#
# Usage:
#   export PRIVATE_KEY="0x..."
#   ./scripts/deploy-eurc-faucet.sh

EURC_TOKEN="0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"  # ✅ Endereço confirmado
CLAIM_AMOUNT="50000000"  # 50 EURC (6 decimais confirmados) - REDUZIDO DE 100 PARA 50
COOLDOWN="86400"           # 24 horas em segundos
RPC_URL="https://rpc.testnet.arc.network"

# ... (similar ao deploy-faucet.sh)
```

**Checklist:**
- [ ] Criar `scripts/deploy-eurc-faucet.sh`
- [ ] Tornar executável: `chmod +x scripts/deploy-eurc-faucet.sh`
- [ ] Testar deploy em testnet
- [ ] Verificar contrato no ArcScan

### 2.2 Executar Deploy

**Ação:**
- [ ] Configurar `PRIVATE_KEY` no ambiente
- [ ] Executar `./scripts/deploy-eurc-faucet.sh`
- [ ] Salvar o endereço do contrato deployado
- [ ] Verificar no ArcScan que o contrato está correto

### 2.3 Atualizar Configuração

**Arquivo:** `lib/config/faucet.ts`

**Alterações:**
```typescript
// EURC testnet token address on ARC Testnet
export const EURC_TESTNET_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const; // ✅ Preenchido

// EURC faucet contract address on ARC Testnet
export const EURC_FAUCET_ADDRESS = "0x..." as const; // ✅ Preencher após deploy
```

**Checklist:**
- [x] Atualizar `EURC_TESTNET_ADDRESS` com endereço real: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- [ ] Atualizar `EURC_FAUCET_ADDRESS` com endereço do contrato deployado
- [ ] Remover comentários `TODO` após deploy do contrato

---

## 💰 FASE 3: Funding do Contrato EURC

### 3.1 Criar Script de Funding para EURC

**Arquivo:** `scripts/fund-eurc-faucet.sh`

**Conteúdo:**
```bash
#!/bin/bash
# Script para fundar o contrato EURC faucet com EURC tokens
#
# Usage:
#   export PRIVATE_KEY="0x..."
#   ./scripts/fund-eurc-faucet.sh [amount]

EURC_TOKEN="0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"  # ✅ Endereço confirmado
FAUCET_CONTRACT="0x..."  # Será preenchido após deploy
RPC_URL="https://rpc.testnet.arc.network"

# ... (similar ao fund-faucet.sh, mas para EURC)
```

**Checklist:**
- [ ] Criar `scripts/fund-eurc-faucet.sh`
- [ ] Tornar executável
- [ ] Testar transferência de EURC para o contrato

### 3.2 Obter EURC no ARC Testnet

**Status:** ✅ EURC já está na wallet `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343`

**Ação:**
- [x] EURC já disponível na wallet
- [ ] Verificar saldo de EURC na wallet usando ArcScan ou `cast call`
- [ ] Confirmar que há EURC suficiente para fundar o contrato

### 3.3 Fundar o Contrato

**Ação:**
- [ ] Decidir quantidade inicial (ex: 3800 EURC, similar ao USDC)
- [ ] Executar `./scripts/fund-eurc-faucet.sh 3800`
- [ ] Verificar saldo do contrato no ArcScan
- [ ] Testar `faucetBalance()` do contrato

---

## 🔌 FASE 4: Atualização da API Route

### 4.1 Modificar API Route para Suportar Token Parameter

**Arquivo:** `app/api/claim/route.ts`

**Alterações Necessárias:**

1. **Adicionar parâmetro `token` no body:**
```typescript
const { address, token } = body; // token: "USDC" | "EURC"
```

2. **Selecionar contrato baseado no token:**
```typescript
import { USDC_FAUCET_ADDRESS, EURC_FAUCET_ADDRESS } from "@/lib/config/faucet";

const faucetAddress = token === "EURC" 
  ? EURC_FAUCET_ADDRESS 
  : USDC_FAUCET_ADDRESS;
```

3. **Usar `faucetAddress` dinâmico:**
```typescript
// Substituir todas as ocorrências de FAUCET_CONTRACT_ADDRESS
// por faucetAddress nas chamadas de contrato
```

**Checklist:**
- [ ] Adicionar validação do parâmetro `token`
- [ ] Implementar lógica de seleção de contrato
- [ ] Atualizar todas as chamadas de contrato para usar `faucetAddress`
- [ ] Manter backward compatibility (default para USDC se `token` não fornecido)
- [ ] Testar com ambos os tokens

### 4.2 Validação e Error Handling

**Ações:**
- [ ] Validar que `token` é "USDC" ou "EURC"
- [ ] Validar que o contrato selecionado não é `0x0000...` (placeholder)
- [ ] Adicionar logs para debugging
- [ ] Manter mensagens de erro claras

---

## 🎨 FASE 5: Atualização do Frontend

### 5.1 Reativar Token Selector

**Arquivo:** `app/page.tsx`

**Alterações:**

1. **Remover o `{false && ...}` que esconde o token selector:**
```typescript
// De:
{false && (
  <Tabs value={selectedToken} onValueChange={(v) => setSelectedToken(v as "USDC" | "EURC")}>
    ...
  </Tabs>
)}

// Para:
<Tabs value={selectedToken} onValueChange={(v) => setSelectedToken(v as "USDC" | "EURC")}>
  ...
</Tabs>
```

2. **Ajustar posicionamento do token selector:**
   - O selector deve estar **acima do botão de claim** (não acima do destination address)
   - Manter o mesmo estilo e altura do connect wallet button (48px)

**Checklist:**
- [ ] Remover o `{false && ...}` do token selector
- [ ] Verificar que o selector está posicionado corretamente (acima do botão de claim)
- [ ] Verificar altura do selector (deve ser 48px, igual ao connect wallet button)
- [ ] Testar alternância entre USDC e EURC
- [ ] Verificar responsividade em mobile

### 5.2 Atualizar Chamada da API

**Arquivo:** `app/page.tsx`

**Alterações:**

1. **Adicionar `token` no body da requisição:**
```typescript
const response = await fetch("/api/claim", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    address: destinationAddress,
    token: selectedToken, // ✅ Adicionar
  }),
});
```

**Checklist:**
- [ ] Adicionar `token: selectedToken` no body da requisição
- [ ] Verificar que o token é enviado corretamente
- [ ] Testar claims para ambos os tokens

### 5.3 Atualizar Textos Dinâmicos

**Arquivo:** `app/page.tsx`

**Alterações:**

1. **Adicionar constante para claim amounts no topo do componente:**
```typescript
// Adicionar após as importações ou no início do componente
const CLAIM_AMOUNTS = {
  USDC: 100,
  EURC: 50, // ✅ REDUZIDO PARA 50
} as const;
```

2. **Botão de Claim (linha ~696):**
```typescript
// De:
`Claim 100 ${selectedToken} (testnet)`

// Para:
`Claim ${CLAIM_AMOUNTS[selectedToken]} ${selectedToken} (testnet)`
```

3. **Mensagem de Sucesso (linha ~557):**
```typescript
// De:
<strong>100 {selectedToken} (testnet)</strong> has been sent to the selected address.

// Para:
<strong>{CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet)</strong> has been sent to the selected address.
```

4. **Descrição do Header (linha ~463):**
```typescript
// De:
Get up to 100 USDC (testnet) to develop on the ARC Network. The official faucet only provides 1 USDC per hour.

// Para:
Get up to {CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet) to develop on the ARC Network. The official faucet only provides 1 {selectedToken} per hour.
```

5. **Twitter Share Text (linha ~439):**
```typescript
// De:
`I'm claiming 100 ${selectedToken} on ARC testnet using Easy Faucet Arc to power my dApp testing! 🚀`

// Para:
`I'm claiming ${CLAIM_AMOUNTS[selectedToken]} ${selectedToken} on ARC testnet using Easy Faucet Arc to power my dApp testing! 🚀`
```

6. **Faucet Information Section (linhas ~783 e ~791):**
```typescript
// De:
<span>This faucet provides up to 100 USDC per day.</span>
<span>Maximum amount: 100 USDC (testnet) per claim.</span>

// Para:
<span>This faucet provides up to {CLAIM_AMOUNTS[selectedToken]} {selectedToken} per day.</span>
<span>Maximum amount: {CLAIM_AMOUNTS[selectedToken]} {selectedToken} (testnet) per claim.</span>
```

**Nota:** Todos os textos devem ser dinâmicos baseados no `selectedToken` e `CLAIM_AMOUNTS`.

**Checklist:**
- [ ] Criar constante `CLAIM_AMOUNTS` com valores: USDC=100, EURC=50
- [ ] Atualizar botão de claim (linha ~696)
- [ ] Atualizar mensagem de sucesso (linha ~557)
- [ ] Atualizar descrição do header (linha ~463)
- [ ] Atualizar Twitter share text (linha ~439)
- [ ] Atualizar Faucet Information section (linhas ~783 e ~791)
- [ ] Atualizar display de balance (já está dinâmico)
- [ ] Verificar que todos os textos são dinâmicos
- [ ] Testar alternância entre USDC e EURC para verificar textos

### 5.4 Validação de Contrato EURC

**Arquivo:** `app/page.tsx`

**Alterações:**

1. **Adicionar validação para EURC_FAUCET_ADDRESS:**
```typescript
// Verificar se o contrato EURC está configurado antes de permitir seleção
const isEurcAvailable = EURC_FAUCET_ADDRESS !== "0x0000000000000000000000000000000000000000";
```

2. **Desabilitar tab EURC se não disponível:**
```typescript
<TabsTrigger value="EURC" disabled={!isEurcAvailable}>
  EURC
</TabsTrigger>
```

**Checklist:**
- [ ] Adicionar validação de disponibilidade do EURC
- [ ] Desabilitar tab EURC se contrato não estiver configurado
- [ ] Mostrar mensagem informativa se EURC não disponível

---

## 🧪 FASE 6: Testes

### 6.1 Testes de Contrato

**Checklist:**
- [ ] Verificar deploy do contrato EURC no ArcScan
- [ ] Testar `canClaim()` para endereço válido
- [ ] Testar `faucetBalance()` retorna valor correto
- [ ] Testar `claimFor()` via script/API
- [ ] Verificar cooldown funciona corretamente
- [ ] Verificar `totalClaims` incrementa

### 6.2 Testes de API

**Checklist:**
- [ ] Testar `/api/claim` com `token: "USDC"` (deve usar contrato USDC)
- [ ] Testar `/api/claim` com `token: "EURC"` (deve usar contrato EURC)
- [ ] Testar `/api/claim` sem `token` (deve default para USDC)
- [ ] Testar validação de token inválido
- [ ] Testar rate limiting funciona para ambos
- [ ] Testar error handling para contrato pausado
- [ ] Testar error handling para saldo insuficiente

### 6.3 Testes de Frontend

**Checklist:**
- [ ] Testar alternância entre tabs USDC/EURC
- [ ] Verificar que o contrato correto é usado em cada tab
- [ ] Verificar que o balance correto é exibido
- [ ] Testar claim completo para USDC
- [ ] Testar claim completo para EURC
- [ ] Verificar que cooldown é independente entre tokens
- [ ] Testar responsividade do token selector
- [ ] Verificar animação de sucesso funciona para ambos

### 6.4 Testes de Integração

**Checklist:**
- [ ] Testar fluxo completo: selecionar EURC → claim → verificar recebimento
- [ ] Testar fluxo completo: selecionar USDC → claim → verificar recebimento
- [ ] Verificar que claims são independentes (pode claimar USDC e EURC separadamente)
- [ ] Testar edge cases (contrato pausado, saldo zero, etc.)

---

## 📚 FASE 7: Documentação

### 7.1 Atualizar README

**Arquivo:** `README.md`

**Alterações:**
- [ ] Adicionar seção sobre suporte multi-token
- [ ] Documentar endereços de ambos os contratos
- [ ] Atualizar instruções de deploy para incluir EURC
- [ ] Adicionar instruções de funding para EURC

### 7.2 Atualizar Configuração

**Arquivo:** `lib/config/faucet.ts`

**Alterações:**
- [ ] Remover todos os comentários `TODO`
- [ ] Adicionar comentários explicativos sobre cada endereço
- [ ] Adicionar links para ArcScan de ambos os contratos

---

## 🚀 FASE 8: Deploy e Monitoramento

### 8.1 Deploy em Produção

**Checklist:**
- [ ] Verificar que todas as variáveis de ambiente estão configuradas
- [ ] Deploy do frontend na Vercel
- [ ] Verificar que ambos os contratos estão acessíveis
- [ ] Testar em produção

### 8.2 Monitoramento

**Checklist:**
- [ ] Monitorar logs da API para erros
- [ ] Verificar saldos dos contratos regularmente
- [ ] Monitorar uso de cada token
- [ ] Configurar alertas para saldo baixo

---

## 📋 Resumo de Arquivos a Modificar

### Arquivos Novos
- [ ] `scripts/deploy-eurc-faucet.sh` - Script de deploy do contrato EURC
- [ ] `scripts/fund-eurc-faucet.sh` - Script para fundar o contrato EURC
- [ ] `docs/EURC_IMPLEMENTATION_PLAN.md` - Este documento

### Arquivos a Modificar
- [ ] `lib/config/faucet.ts` - Adicionar endereços reais de EURC
- [ ] `app/api/claim/route.ts` - Adicionar suporte a parâmetro `token`
- [ ] `app/page.tsx` - Reativar token selector e atualizar chamadas
- [ ] `README.md` - Documentar suporte multi-token

### Arquivos que NÃO Devem Ser Modificados
- ❌ `contracts/ArcTestnetFaucet.sol` - Contrato permanece igual
- ❌ Lógica de wallet connection
- ❌ Lógica de cooldown (já funciona por contrato)
- ❌ Estilos globais

---

## ⚠️ Pontos de Atenção

### 1. Cooldown Independente
- ✅ Cooldown é **por contrato**, então usuários podem claimar USDC e EURC independentemente
- ✅ Isso é intencional e desejável

### 2. Backward Compatibility
- ✅ API deve funcionar sem parâmetro `token` (default para USDC)
- ✅ Frontend deve funcionar mesmo se EURC não estiver configurado

### 3. Segurança
- ✅ Validar sempre que o endereço do contrato não é `0x0000...`
- ✅ Validar que `token` é apenas "USDC" ou "EURC"
- ✅ Manter rate limiting independente por token

### 4. Decimais
- ⚠️ Verificar se EURC usa 6 ou 18 decimais
- ⚠️ Ajustar `CLAIM_AMOUNT` se necessário

---

## 🎯 Próximos Passos Imediatos

1. **✅ EURC já está na wallet** `0xCa64ddA1Cf192Ac11336DCE42367bE0099eca343`
2. **Obter endereço do contrato do token EURC** (não a wallet, mas o contrato ERC20)
3. **Verificar decimais do EURC** (provavelmente 6, como USDC)
4. **Criar scripts de deploy e funding** (com claim amount = 50 EURC)
5. **Deploy do contrato EURC** (com 50 EURC de claim amount)
6. **Atualizar configuração** (`lib/config/faucet.ts`)
7. **Fundar o contrato** com EURC
8. **Reativar token selector** no frontend (remover `{false && ...}`)
9. **Atualizar todos os textos** para usar `CLAIM_AMOUNTS` dinâmico
10. **Atualizar API route** para suportar parâmetro `token`
11. **Testes completos**
12. **Deploy em produção**

---

## 📝 Notas Finais

- Este plano mantém **zero alterações** no contrato USDC existente
- A implementação é **modular** e permite fácil rollback
- O frontend já tem a estrutura básica (token selector está escondido)
- A API precisa de modificações mínimas (apenas adicionar parâmetro `token`)

**Estimativa de Tempo:** 2-4 horas de desenvolvimento + tempo para obter EURC no testnet

