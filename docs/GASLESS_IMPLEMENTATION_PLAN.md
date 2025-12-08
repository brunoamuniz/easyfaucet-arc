# Plano de Implementação - Sistema Gasless Controlado pelo Owner

## 🎯 Objetivo

Implementar um sistema onde:
- Usuário **não precisa pagar gas** (gasless)
- Usuário **não precisa assinar transação** (apenas requisição HTTP)
- Apenas o **owner do contrato** pode executar claims
- Interface mantém conexão de wallet para **auto-preenchimento** do endereço
- Usuário pode **digitar manualmente** o endereço destino
- Interface clara mostrando as duas opções

## 📋 Arquitetura

```
┌─────────────┐
│   Frontend  │
│  (Next.js)  │
└──────┬──────┘
       │ HTTP Request
       │ POST /api/claim
       │ { address: "0x..." }
       ▼
┌─────────────┐
│   Backend   │
│  (API Route)│
│  - Valida   │
│  - Rate limit│
│  - Executa  │
└──────┬──────┘
       │ Transaction
       │ claimFor(address)
       │ (paga gas como owner)
       ▼
┌─────────────┐
│   Contrato  │
│  (Smart     │
│   Contract) │
└─────────────┘
```

## 🔧 Implementação

### 1. Modificar Contrato (`ArcTestnetFaucet.sol`)

**Adicionar função `claimFor` (onlyOwner):**

```solidity
/**
 * @notice Owner can claim tokens for a recipient address
 * @dev Only owner can call this function. Used for gasless claims.
 * @param recipient The address that will receive the faucet USDC
 */
function claimFor(address recipient) external onlyOwner nonReentrant {
    // Check if paused
    if (paused) {
        revert Paused();
    }

    // Validate recipient
    require(recipient != address(0), "Recipient cannot be zero address");

    // Check cooldown per recipient
    uint256 lastClaim = lastClaimAt[recipient];
    if (lastClaim > 0) {
        uint256 nextClaimTime = lastClaim + cooldown;
        if (block.timestamp < nextClaimTime) {
            uint256 remainingSeconds = nextClaimTime - block.timestamp;
            revert CooldownActive(remainingSeconds);
        }
    }

    // Check faucet balance
    uint256 balance = token.balanceOf(address(this));
    if (balance == 0) {
        revert FaucetEmpty();
    }
    if (balance < claimAmount) {
        revert InsufficientFaucetBalance(balance, claimAmount);
    }

    // Update state (Effects) - cooldown is per recipient
    lastClaimAt[recipient] = block.timestamp;

    // Transfer tokens to recipient (Interactions)
    token.safeTransfer(recipient, claimAmount);

    // Emit event with recipient
    emit Claimed(recipient, claimAmount, block.timestamp);
}
```

**Manter `claimTo` pública** (para compatibilidade, mas não será usada no frontend)

### 2. Criar API Route (`app/api/claim/route.ts`)

**Estrutura:**
- Valida endereço recebido
- Verifica cooldown via `canClaim` do contrato
- Rate limiting (opcional: por IP, endereço, etc.)
- Executa `claimFor` como owner
- Retorna sucesso/erro

**Variáveis de ambiente necessárias:**
- `PRIVATE_KEY` - Chave privada do owner
- `FAUCET_CONTRACT_ADDRESS` - Endereço do contrato
- `ARC_TESTNET_RPC_URL` - URL do RPC

### 3. Modificar Frontend (`app/page.tsx`)

**Mudanças principais:**

1. **Remover necessidade de wallet conectada para claim:**
   - Remover verificação `isConnected` e `isWrongNetwork` do `handleClaim`
   - Wallet é opcional (apenas para auto-preenchimento)

2. **Modificar `handleClaim`:**
   - Trocar `writeContract` por `fetch('/api/claim', ...)`
   - Enviar `{ address: destinationAddress }`
   - Processar resposta (sucesso/erro)

3. **Atualizar interface:**
   - Adicionar texto explicativo: "Connect your wallet to auto-fill address, or enter manually below"
   - Manter `ConnectButton` (para auto-preenchimento)
   - Manter input de endereço destino
   - Atualizar labels e mensagens

4. **Atualizar validações:**
   - Remover `isConnected` e `isWrongNetwork` de `isClaimDisabled`
   - Manter validação de endereço

5. **Atualizar mensagens de erro:**
   - Remover alertas de "no_wallet" e "wrong_network"
   - Adicionar tratamento de erros da API

## 📁 Arquivos a Modificar/Criar

### Criar:
- `app/api/claim/route.ts` - API Route para processar claims
- `.env.local` - Variáveis de ambiente (PRIVATE_KEY, etc.)

### Modificar:
- `contracts/ArcTestnetFaucet.sol` - Adicionar `claimFor`
- `app/page.tsx` - Modificar lógica de claim para usar API
- `lib/config/faucet.ts` - Adicionar variáveis se necessário

## 🔒 Segurança

### Backend (API Route):
- ✅ Validação de endereço
- ✅ Verificação de cooldown no contrato
- ✅ Rate limiting (por IP, endereço, etc.)
- ✅ Tratamento de erros do contrato
- ✅ Logs de requisições

### Contrato:
- ✅ `onlyOwner` garante que apenas owner executa
- ✅ Validações de cooldown e saldo mantidas
- ✅ `nonReentrant` para segurança

## 🚀 Fluxo do Usuário

1. Usuário acessa a página
2. **Opção A:** Conecta wallet → endereço preenchido automaticamente
3. **Opção B:** Digita endereço manualmente
4. Usuário clica em "Claim"
5. Frontend faz `POST /api/claim` com `{ address: "0x..." }`
6. Backend valida e executa `claimFor` como owner
7. Tokens são enviados para o endereço
8. Frontend mostra sucesso/erro

## 📝 Checklist de Implementação

### Contrato:
- [ ] Adicionar função `claimFor(address recipient) onlyOwner`
- [ ] Testar função localmente
- [ ] Deploy do contrato atualizado (ou atualizar existente)
- [ ] Atualizar ABI

### Backend:
- [ ] Criar `app/api/claim/route.ts`
- [ ] Implementar validação de endereço
- [ ] Implementar verificação de cooldown (via contrato)
- [ ] Implementar rate limiting
- [ ] Implementar execução de transação (viem/wagmi)
- [ ] Tratamento de erros
- [ ] Configurar variáveis de ambiente

### Frontend:
- [ ] Remover verificação de wallet conectada do `handleClaim`
- [ ] Modificar `handleClaim` para usar API
- [ ] Atualizar `isClaimDisabled` (remover wallet checks)
- [ ] Adicionar texto explicativo sobre opções
- [ ] Atualizar mensagens de erro
- [ ] Testar fluxo completo

## ⚠️ Considerações

1. **Custo de Gas:** Owner precisa manter fundos para pagar gas de todas as transações
2. **Rate Limiting:** Implementar para evitar abuso
3. **Monitoramento:** Monitorar uso e custos
4. **Backup:** Manter `claimTo` pública como fallback (opcional)

## 🔄 Próximos Passos

1. Implementar modificações no contrato
2. Criar API Route
3. Atualizar frontend
4. Testar localmente
5. Deploy e teste em testnet
