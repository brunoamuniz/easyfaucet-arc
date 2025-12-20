# Plano de Implementação - Easy Faucet Arc Testnet

## 📋 Visão Geral

Este documento detalha o plano completo para implementar:
1. Smart Contract ERC-20 Faucet em Solidity
2. Integração do Frontend com wallet connection (wagmi + RainbowKit)
3. Substituição da lógica mock por interações on-chain reais
4. Atualização de todos os textos para 100 USDC

---

## 🎯 FASE 1: SMART CONTRACT (Solidity)

### 1.1 Estrutura de Arquivos
- [ ] Criar diretório `contracts/` na raiz do projeto
- [ ] Criar arquivo `contracts/ArcTestnetFaucet.sol`
- [ ] Criar arquivo `contracts/interfaces/` (se necessário para interfaces customizadas)

### 1.2 Implementação do Contrato

#### 1.2.1 Imports e Declarações
- [ ] Importar OpenZeppelin:
  - `@openzeppelin/contracts/token/ERC20/IERC20.sol`
  - `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`
  - `@openzeppelin/contracts/access/Ownable.sol`
  - `@openzeppelin/contracts/security/ReentrancyGuard.sol`
- [ ] Declarar versão do Solidity: `^0.8.20`
- [ ] Declarar nome do contrato: `ArcTestnetFaucet`

#### 1.2.2 State Variables
- [ ] `IERC20 public token;` (USDC testnet)
- [ ] `uint256 public claimAmount;` (default: 100 * 10^6)
- [ ] `uint256 public cooldown;` (default: 24 * 60 * 60 segundos)
- [ ] `bool public paused;`
- [ ] `mapping(address => uint256) public lastClaimAt;`

#### 1.2.3 Custom Errors
- [ ] `error CooldownActive(uint256 remainingSeconds);`
- [ ] `error FaucetEmpty();`
- [ ] `error InsufficientFaucetBalance(uint256 currentBalance, uint256 requiredAmount);`
- [ ] `error Paused();`

#### 1.2.4 Events
- [ ] `event Claimed(address indexed user, uint256 amount, uint256 timestamp);`

#### 1.2.5 Constructor
- [ ] Parâmetros: `address _token`, `uint256 _claimAmount`, `uint256 _cooldown`
- [ ] Validações:
  - `require(_claimAmount > 0, "Claim amount must be > 0");`
  - `require(_cooldown > 0, "Cooldown must be > 0");`
- [ ] Inicialização:
  - `token = IERC20(_token);`
  - `claimAmount = _claimAmount;`
  - `cooldown = _cooldown;`
  - `paused = false;`

#### 1.2.6 Função claim()
- [ ] Modifiers: `nonReentrant`
- [ ] Verificar se está pausado → revert `Paused()`
- [ ] Verificar cooldown:
  - Calcular `remainingSeconds = (lastClaimAt[msg.sender] + cooldown) - block.timestamp`
  - Se `block.timestamp < lastClaimAt[msg.sender] + cooldown` → revert `CooldownActive(remainingSeconds)`
- [ ] Verificar saldo do faucet:
  - `uint256 balance = token.balanceOf(address(this));`
  - Se `balance == 0` → revert `FaucetEmpty()`
  - Se `balance < claimAmount` → revert `InsufficientFaucetBalance(balance, claimAmount)`
- [ ] Atualizar estado: `lastClaimAt[msg.sender] = block.timestamp;`
- [ ] Transferir tokens: `SafeERC20.safeTransfer(token, msg.sender, claimAmount);`
- [ ] Emitir evento: `emit Claimed(msg.sender, claimAmount, block.timestamp);`

#### 1.2.7 Funções Admin (onlyOwner)
- [ ] `setClaimAmount(uint256 newAmount)` - validar `newAmount > 0`
- [ ] `setCooldown(uint256 newCooldown)` - validar `newCooldown > 0`
- [ ] `setToken(address newToken)` - atualizar token address
- [ ] `setPaused(bool _paused)` - pausar/despausar
- [ ] `withdrawTokens(address to, uint256 amount)` - retirar tokens

#### 1.2.8 View Functions
- [ ] `canClaim(address user) external view returns (bool allowed, uint256 remainingSeconds)`
  - Se não há cooldown: `(true, 0)`
  - Se há cooldown: `(false, remainingSeconds)`
- [ ] `faucetBalance() external view returns (uint256)`
  - Retornar `token.balanceOf(address(this))`

### 1.3 Configuração de Build (Opcional - para referência)
- [ ] Criar `hardhat.config.js` ou `foundry.toml` (comentado com TODOs)
- [ ] Documentar dependências necessárias (OpenZeppelin)

---

## 🎯 FASE 2: CONFIGURAÇÃO DO FRONTEND

### 2.1 Instalação de Dependências
- [ ] Instalar `@rainbow-me/rainbowkit` e `@rainbow-me/rainbowkit/wagmi`
- [ ] Instalar `viem` (peer dependency do wagmi)
- [ ] Verificar se `wagmi` já está instalado (já está no package.json)

### 2.2 Estrutura de Arquivos de Configuração
- [ ] Criar `lib/config/faucet.ts` - configuração do contrato
- [ ] Criar `lib/config/chains.ts` - configuração da chain ARC Testnet
- [ ] Criar `lib/contracts/ArcTestnetFaucet.abi.ts` - ABI do contrato
- [ ] Criar `app/providers.tsx` - Provider do wagmi + RainbowKit

### 2.3 Configuração da Chain ARC Testnet
- [ ] Criar definição customizada da chain em `lib/config/chains.ts`
- [ ] Incluir TODOs para:
  - `chainId` (placeholder: 999999)
  - `rpcUrls.default.http[0]` (TODO: preencher RPC URL)
  - `blockExplorers.default.url` (TODO: preencher explorer URL)
  - `nativeCurrency` (name, symbol, decimals)

### 2.4 Configuração do Contrato
- [ ] Em `lib/config/faucet.ts`:
  - `FAUCET_CONTRACT_ADDRESS` (TODO: preencher após deploy)
  - `USDC_TESTNET_ADDRESS` (TODO: preencher endereço USDC testnet)
  - `ARC_TESTNET_CHAIN_ID` (TODO: preencher chainId real)
  - Exportar ABI do contrato

### 2.5 ABI do Contrato
- [ ] Extrair ABI do contrato compilado
- [ ] Criar `lib/contracts/ArcTestnetFaucet.abi.ts` com o ABI completo
- [ ] Incluir todas as funções: `claim`, `canClaim`, `faucetBalance`, admin functions

### 2.6 Provider Setup (wagmi + RainbowKit)
- [ ] Criar `app/providers.tsx`:
  - Configurar `WagmiProvider` com chains
  - Configurar `RainbowKitProvider`
  - Incluir tema dark (para combinar com UI atual)
- [ ] Atualizar `app/layout.tsx` para incluir o Provider

---

## 🎯 FASE 3: INTEGRAÇÃO WALLET CONNECTION

### 3.1 Remover Lógica Mock
- [ ] Remover `mockAddress` e `mockChainId` do estado
- [ ] Remover funções `handleConnect`, `handleDisconnect`, `handleSwitchNetwork` mock

### 3.2 Integrar wagmi Hooks
- [ ] Usar `useAccount()` para obter `address` e `isConnected`
- [ ] Usar `useChainId()` para obter `chainId` atual
- [ ] Usar `useConnect()` para conectar wallet
- [ ] Usar `useDisconnect()` para desconectar
- [ ] Usar `useSwitchChain()` para trocar de network

### 3.3 Integrar RainbowKit
- [ ] Adicionar `ConnectButton` do RainbowKit no lugar do botão mock
- [ ] Configurar tema dark do RainbowKit
- [ ] Testar conexão com MetaMask e outras wallets

### 3.4 Verificação de Network
- [ ] Comparar `chainId` atual com `ARC_TESTNET_CHAIN_ID`
- [ ] Mostrar alerta "Wrong network" quando necessário
- [ ] Implementar botão "Switch Network" usando `switchChain()`

---

## 🎯 FASE 4: INTEGRAÇÃO DO CONTRATO

### 4.1 Hooks de Leitura (Read)
- [ ] Usar `useReadContract` para:
  - `canClaim(address)` - verificar se pode fazer claim
  - `faucetBalance()` - verificar saldo do faucet
  - `paused()` - verificar se está pausado
  - `lastClaimAt(address)` - verificar último claim

### 4.2 Hook de Escrita (Write)
- [ ] Usar `useWriteContract` para função `claim()`
- [ ] Usar `useWaitForTransactionReceipt` para aguardar confirmação
- [ ] Gerenciar estados: `idle`, `loading`, `success`, `error`

### 4.3 Função handleClaim Atualizada
- [ ] Substituir `simulateFaucetClaim` por chamada real ao contrato
- [ ] Usar `writeContract` do hook `useWriteContract`
- [ ] Aguardar confirmação com `waitForTransactionReceipt`
- [ ] Capturar `transactionHash` da resposta
- [ ] Atualizar localStorage após sucesso

### 4.4 Atualização do Estado
- [ ] Remover lógica de simulação
- [ ] Usar dados reais do contrato para verificar cooldown
- [ ] Sincronizar cooldown do contrato com localStorage (device cooldown)

---

## 🎯 FASE 5: TRATAMENTO DE ERROS

### 5.1 Decodificação de Custom Errors
- [ ] Criar função helper `decodeContractError(error: Error)`
- [ ] Mapear custom errors:
  - `CooldownActive(uint256)` → status "cooldown" + remainingSeconds
  - `FaucetEmpty()` → status "no_funds"
  - `InsufficientFaucetBalance(uint256, uint256)` → status "no_funds"
  - `Paused()` → status "paused" (novo status)

### 5.2 Novos Status
- [ ] Adicionar `"paused"` ao tipo `FaucetStatus`
- [ ] Criar alerta para status "paused"

### 5.3 Mensagens de Erro
- [ ] Mapear cada erro para mensagem apropriada
- [ ] Exibir tempo restante de cooldown de forma legível (horas/minutos)
- [ ] Tratar erros genéricos com mensagem padrão

### 5.4 Verificação Pré-Claim
- [ ] Verificar `paused` antes de permitir claim
- [ ] Verificar `canClaim` antes de habilitar botão
- [ ] Verificar `faucetBalance` antes de permitir claim

---

## 🎯 FASE 6: ATUALIZAÇÃO DE TEXTOS E UI

### 6.1 Textos para 100 USDC
- [ ] Atualizar subtítulo: "Get up to **100 USDC** (testnet)..."
- [ ] Atualizar botão: "Claim **100 USDC** (testnet)"
- [ ] Atualizar mensagem de sucesso: "Up to **100 USDC** (testnet) has been sent..."
- [ ] Atualizar seção de informações:
  - "This faucet provides up to **100 USDC** per day."
  - "Maximum amount: **100 USDC** (testnet) per claim."

### 6.2 Remover Alert de Preview Mode
- [ ] Remover ou atualizar alerta "Preview Mode" após integração real

### 6.3 Melhorias de UX
- [ ] Adicionar link para explorer quando mostrar txHash
- [ ] Formatar tempo restante de cooldown (ex: "2h 30m remaining")
- [ ] Adicionar loading state mais informativo durante claim

---

## 🎯 FASE 7: DEVICE COOLDOWN (localStorage)

### 7.1 Manter Lógica Existente
- [ ] Manter função `getDeviceId()`
- [ ] Manter função `checkCooldown(address)`
- [ ] Atualizar localStorage após claim bem-sucedido

### 7.2 Sincronização
- [ ] Verificar cooldown do contrato (fonte da verdade)
- [ ] Verificar cooldown do localStorage (camada extra)
- [ ] Usar o mais restritivo entre os dois

---

## 🎯 FASE 8: ESTRUTURA FINAL DE ARQUIVOS

### 8.1 Arquivos Criados
```
contracts/
  └── ArcTestnetFaucet.sol

lib/
  ├── config/
  │   ├── faucet.ts
  │   └── chains.ts
  ├── contracts/
  │   └── ArcTestnetFaucet.abi.ts
  └── utils/
      └── errorDecoder.ts (opcional)

app/
  ├── providers.tsx (novo)
  ├── layout.tsx (atualizado)
  └── page.tsx (atualizado)
```

### 8.2 Arquivos Atualizados
- [ ] `app/page.tsx` - remover mocks, adicionar wagmi hooks
- [ ] `app/layout.tsx` - adicionar Providers
- [ ] `package.json` - adicionar dependências (RainbowKit, viem)

---

## 🎯 FASE 9: TODOs E DOCUMENTAÇÃO

### 9.1 TODOs no Código
- [ ] Marcar todos os lugares que precisam de valores reais:
  - ARC Testnet chainId
  - ARC Testnet RPC URL
  - ARC Testnet Block Explorer
  - USDC Testnet token address
  - Faucet contract deployed address

### 9.2 Comentários
- [ ] Adicionar comentários explicativos onde necessário
- [ ] Documentar como preencher os TODOs

---

## 🎯 FASE 10: TESTES E VALIDAÇÃO

### 10.1 Validação Manual
- [ ] Testar conexão de wallet
- [ ] Testar troca de network
- [ ] Testar claim bem-sucedido
- [ ] Testar cooldown (esperar 24h ou modificar contrato temporariamente)
- [ ] Testar erro quando faucet está vazio
- [ ] Testar erro quando está pausado
- [ ] Testar erro de network errada

### 10.2 Verificações
- [ ] Todos os textos mostram 100 USDC
- [ ] localStorage funciona corretamente
- [ ] Erros são exibidos corretamente
- [ ] Loading states funcionam
- [ ] txHash é exibido e clicável (link para explorer)

---

## 📝 NOTAS IMPORTANTES

1. **Ordem de Implementação Sugerida:**
   - Fase 1 (Smart Contract) pode ser feita em paralelo ou antes
   - Fases 2-3 (Config + Wallet) devem vir antes da Fase 4 (Contrato)
   - Fase 4 depende das Fases 2 e 3
   - Fases 5-6 podem ser feitas em paralelo com Fase 4

2. **Dependências:**
   - Smart Contract precisa ser compilado e deployado antes de usar no frontend
   - ABI precisa ser extraído após compilação

3. **Valores Padrão:**
   - `claimAmount = 100 * 10^6` (assumindo 6 decimais para USDC)
   - `cooldown = 24 * 60 * 60` (86400 segundos)

4. **Segurança:**
   - Smart contract usa ReentrancyGuard
   - Smart contract usa SafeERC20
   - Frontend valida antes de chamar, mas contrato é fonte da verdade

---

## ✅ CHECKLIST FINAL

- [ ] Smart Contract implementado e testado
- [ ] ABI extraído e importado no frontend
- [ ] wagmi + RainbowKit configurados
- [ ] Wallet connection funcionando
- [ ] Network switching funcionando
- [ ] Claim funcionando on-chain
- [ ] Todos os erros tratados corretamente
- [ ] Todos os textos atualizados para 100 USDC
- [ ] localStorage cooldown funcionando
- [ ] TODOs marcados claramente
- [ ] Código limpo e documentado

