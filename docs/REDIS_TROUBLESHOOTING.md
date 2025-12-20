# 🔧 Troubleshooting Redis - Rate Limiting

## 🔍 Diagnóstico do Problema

Este guia ajuda a diagnosticar problemas de conexão Redis em ambientes serverless (Vercel).

## ✅ Verificações Realizadas

### Local
- ✅ Redis URL está configurado no `.env.local`
- ✅ Conexão local funciona (testado com ping)
- ✅ Código está usando `process.env.REDIS_URL`

### Produção (Vercel)
- ⚠️ Precisa verificar se `REDIS_URL` está configurado no Vercel Dashboard
- ⚠️ Precisa verificar se a URL está correta e acessível

## 🔧 Soluções

### 1. Verificar Variáveis de Ambiente no Vercel

**Via Dashboard:**
1. Acesse: https://vercel.com/dashboard
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Verifique se `REDIS_URL` está configurado para **Production**

**Via CLI:**
```bash
vercel env ls
```

### 2. Verificar Formato da REDIS_URL

A URL deve estar no formato:
```
redis://default:password@host:port
```

ou com SSL:
```
rediss://default:password@host:port
```

### 3. Testar Conexão Redis

**Localmente:**
```bash
# Carregar variáveis
source <(grep -v '^#' .env.local | sed 's/^/export /')

# Testar conexão
node -e "const { createClient } = require('redis'); const client = createClient({ url: process.env.REDIS_URL }); client.connect().then(() => { console.log('✅ Conectado'); client.quit(); }).catch(e => console.error('❌ Erro:', e.message));"
```

### 4. Verificar Logs de Produção

**No Vercel Dashboard:**
1. Vá em **Deployments** → Último deployment
2. Clique em **Functions** → `/api/claim`
3. Verifique logs para erros de Redis:
   - `Redis connection timeout`
   - `Redis Client Error`
   - `REDIS_URL not configured`

### 5. Verificar Comportamento de Falha

Em caso de falha na conexão Redis, o sistema pode ter diferentes comportamentos:
- **Fail Open**: Permite requisições quando Redis está indisponível (menos seguro, mas evita bloqueios)
- **Fail Closed**: Bloqueia requisições quando Redis está indisponível (mais seguro, mas pode causar downtime)

Verifique os logs para identificar qual comportamento está configurado e ajuste conforme necessário.

## 🚨 Ação Imediata Necessária

### Opção 1: Verificar e Configurar REDIS_URL no Vercel

1. **Acessar Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Selecione seu projeto
   - Settings → Environment Variables

2. **Verificar se REDIS_URL existe:**
   - Se não existir: Adicionar com o mesmo valor do `.env.local`
   - Se existir: Verificar se está correto

3. **Garantir que está em Production:**
   - ✅ Production
   - ✅ Preview (opcional)
   - ✅ Development (opcional)

4. **Fazer novo deploy após adicionar/atualizar**

### Opção 2: Ajustar Comportamento de Falha

Dependendo dos requisitos de segurança, você pode configurar o sistema para:
- **Fail Closed**: Bloquear requisições quando Redis está indisponível (mais seguro)
- **Fail Open**: Permitir requisições quando Redis está indisponível (mais tolerante a falhas)

**⚠️ Considerações**: Fail closed é mais seguro mas pode causar downtime. Fail open é mais tolerante mas pode permitir abusos temporários.

## 📊 Como Verificar se Está Funcionando

### 1. Verificar Logs do Vercel

Procure por:
- ✅ `Redis connected` - Redis conectou
- ✅ `Redis ready` - Redis está pronto
- ❌ `Redis connection timeout` - Timeout na conexão
- ❌ `Redis Client Error` - Erro do cliente Redis
- ❌ `REDIS_URL not configured` - Variável não configurada

### 2. Testar Rate Limiting

1. Fazer 20 claims de um mesmo IP
2. Tentar fazer o 21º claim
3. Deve retornar erro 429 (Rate limit exceeded)

### 3. Verificar Dados no Redis

Se tiver acesso ao Redis:
```bash
redis-cli -u "REDIS_URL"
> KEYS rate-limit:*
> GET rate-limit:IP_ADDRESS
```

## 🔗 Links Úteis

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Redis Labs Documentation](https://docs.redislabs.com/)
- [Vercel Redis/KV](https://vercel.com/docs/storage/vercel-kv)

## 📝 Checklist

- [ ] Verificar se `REDIS_URL` está no Vercel Dashboard
- [ ] Verificar se está configurado para Production
- [ ] Verificar formato da URL (redis:// ou rediss://)
- [ ] Testar conexão localmente
- [ ] Verificar logs do último deployment
- [ ] Fazer novo deploy após configurar
- [ ] Testar rate limiting em produção
