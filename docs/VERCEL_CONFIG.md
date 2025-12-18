# 🔧 Configuração da Vercel - Antes do Deploy

## ✅ Verificação de Segurança

### Arquivos Sensíveis Verificados

✅ **`.env.local`** - Está no `.gitignore` (não será commitado)
✅ **`scripts/fund-faucet.sh`** - Está no `.gitignore` (não será commitado)
✅ **`scripts/deploy-faucet.sh`** - Está no `.gitignore` (não será commitado)
✅ **Nenhum arquivo com chaves privadas está sendo rastreado pelo git**

### Arquivos Seguros para Commit

✅ Endereços de contratos (informação pública)
✅ Configurações de chain (informação pública)
✅ ABIs (informação pública)
✅ Código frontend/backend
✅ Arquivos de configuração públicos

---

## 🔐 Variáveis de Ambiente Necessárias na Vercel

### Obrigatórias

#### 1. `PRIVATE_KEY`
- **Descrição**: Chave privada da carteira que executa os claims (gasless)
- **Formato**: `0x...` (hexadecimal com 0x)
- **Onde obter**: Carteira que você usa para executar transações
- **⚠️ CRÍTICO**: Nunca compartilhe ou commite esta chave

#### 2. `REDIS_URL`
- **Descrição**: URL de conexão do Redis (para rate limiting)
- **Formato**: `redis://default:password@host:port` ou `rediss://...` (SSL)
- **Onde obter**: 
  - Vercel → Project → Storage → Redis
  - Ou Redis Labs (se configurado externamente)
- **Exemplo**: `redis://default:UpML4OHynDdLIQqm7tCr87ZY0yXmHukw@redis-15083.c10.us-east-1-2.ec2.cloud.redislabs.com:15083`

### Opcionais (mas recomendadas)

#### 3. `ARC_TESTNET_RPC_URL`
- **Descrição**: URL do RPC do ARC Testnet
- **Padrão**: `https://rpc.testnet.arc.network` (usado se não configurado)
- **Onde obter**: Documentação do ARC Network
- **Recomendação**: Deixar padrão ou usar RPC próprio se disponível

#### 4. `TELEGRAM_BOT_TOKEN`
- **Descrição**: Token do bot do Telegram para alertas de saldo
- **Formato**: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- **Onde obter**: [@BotFather](https://t.me/botfather) no Telegram
- **Opcional**: Só necessário se quiser receber alertas de saldo baixo

#### 5. `TELEGRAM_CHAT_ID`
- **Descrição**: ID do chat onde receber alertas do Telegram
- **Formato**: `123456789` (número)
- **Onde obter**: [@userinfobot](https://t.me/userinfobot) no Telegram
- **Opcional**: Só necessário se configurou `TELEGRAM_BOT_TOKEN`

#### 6. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- **Descrição**: Project ID do WalletConnect (para conexão de carteiras)
- **Onde obter**: [WalletConnect Cloud](https://cloud.walletconnect.com/)
- **Opcional**: Recomendado para melhor experiência de conexão

#### 7. `NEXT_PUBLIC_APP_URL`
- **Descrição**: URL pública da aplicação (para compartilhamento)
- **Formato**: `https://easyfaucetarc.xyz`
- **Padrão**: `https://easyfaucetarc.xyz` (usado se não configurado)
- **Opcional**: Só necessário se o domínio for diferente

---

## 📋 Passo a Passo - Configurar na Vercel

### 1. Acessar Configurações do Projeto

1. Acesse [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecione seu projeto (`easyfaucet-arc` ou nome do projeto)
3. Vá em **Settings** → **Environment Variables**

### 2. Adicionar Variáveis

Para cada variável obrigatória:

1. Clique em **Add New**
2. Preencha:
   - **Name**: Nome da variável (ex: `PRIVATE_KEY`)
   - **Value**: Valor da variável
   - **Environment**: Selecione:
     - ✅ **Production** (obrigatório)
     - ✅ **Preview** (recomendado para testar)
     - ✅ **Development** (opcional, para desenvolvimento local via `vercel dev`)

3. Clique em **Save**

### 3. Variáveis por Ambiente

#### Production (Obrigatório)
```
PRIVATE_KEY=0x...
REDIS_URL=redis://...
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network (ou deixar padrão)
```

#### Preview (Recomendado)
- Mesmas variáveis da Production
- Permite testar em branches antes de merge

#### Development (Opcional)
- Mesmas variáveis da Production
- Usado apenas com `vercel dev` localmente

---

## 🔍 Verificação Pós-Deploy

Após configurar as variáveis e fazer o deploy:

1. ✅ Verificar logs do deploy na Vercel
2. ✅ Testar um claim na aplicação
3. ✅ Verificar se o rate limiting está funcionando (Redis)
4. ✅ Verificar logs de erro (se houver)

---

## ⚠️ Checklist Antes do Commit

- [ ] ✅ Verificar que `.env.local` está no `.gitignore`
- [ ] ✅ Verificar que nenhum arquivo com `PRIVATE_KEY` está sendo commitado
- [ ] ✅ Verificar que scripts com chaves privadas estão no `.gitignore`
- [ ] ✅ Verificar que `REDIS_URL` não está hardcoded no código
- [ ] ✅ Verificar que todas as variáveis sensíveis usam `process.env.*`
- [ ] ✅ Verificar que endereços de contratos são públicos (ok para commit)
- [ ] ✅ Verificar que ABIs são públicos (ok para commit)

---

## 🚨 Se Algo Der Errado

### Erro: "PRIVATE_KEY not set"
- **Solução**: Adicionar `PRIVATE_KEY` nas variáveis de ambiente da Vercel

### Erro: "Redis connection timeout"
- **Solução**: Verificar se `REDIS_URL` está correto e acessível

### Erro: "Rate limit not working"
- **Solução**: Verificar se `REDIS_URL` está configurado e o Redis está acessível

### Erro: "Transaction failed"
- **Solução**: Verificar se `PRIVATE_KEY` tem saldo suficiente para gas

---

## 📝 Notas Importantes

1. **Nunca commite** variáveis de ambiente no código
2. **Sempre use** `process.env.VAR_NAME` para acessar variáveis
3. **Rotacione chaves** se acidentalmente expostas
4. **Use diferentes chaves** para produção e desenvolvimento (se possível)
5. **Monitore logs** após cada deploy para garantir que tudo está funcionando

---

## 🔗 Links Úteis

- [Vercel Environment Variables Docs](https://vercel.com/docs/concepts/projects/environment-variables)
- [ARC Testnet RPC](https://rpc.testnet.arc.network)
- [WalletConnect Cloud](https://cloud.walletconnect.com/)
- [Telegram Bot Setup](./TELEGRAM_SETUP.md)
