# Análise de Segurança: Rate Limiting por IP

## Data da Análise
2025-01-20

## Problema Reportado
Volume muito grande de claims sendo realizados, apesar do limite de 20 claims por IP por dia.

## Problemas Críticos Identificados

### 1. **FAIL OPEN - Problema Crítico de Segurança**

O código atual implementa uma estratégia de "fail open" que **permite todas as requisições quando o Redis está indisponível**. Isso é extremamente perigoso e explica o volume alto de claims.

#### Localização do Problema

**Arquivo:** `app/api/claim/route.ts`

**Linhas 83-87:** Se a conexão com Redis falhar, o sistema permite a requisição:
```typescript
} catch (error) {
  console.error("Redis connection error in checkRateLimit:", error);
  // Fail open - allow request if Redis is unavailable (but log the error)
  const resetTime = Date.now() + (RATE_LIMIT_WINDOW * 1000);
  return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
}
```

**Linhas 97-101:** Se a leitura do Redis falhar, o sistema permite a requisição:
```typescript
} catch (error) {
  console.error("Redis get error:", error);
  // Fail open - allow request if Redis read fails
  const resetTime = Date.now() + (RATE_LIMIT_WINDOW * 1000);
  return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime };
}
```

**Linhas 157-159:** Se o incremento do contador falhar, ele retorna silenciosamente sem incrementar:
```typescript
} catch (error) {
  console.error("Redis connection error in incrementRateLimit:", error);
  return; // Fail silently - don't break the claim if Redis is unavailable
}
```

### 2. **Consequências do Fail Open**

1. **Se o Redis estiver offline ou com problemas de conexão:**
   - TODAS as requisições são permitidas
   - Nenhum limite é aplicado
   - O volume de claims pode explodir

2. **Se o Redis falhar durante a leitura:**
   - Cada requisição é permitida
   - O sistema não consegue verificar limites anteriores

3. **Se o incremento falhar:**
   - O claim é processado, mas o contador não é atualizado
   - Mesmo que o Redis volte, os limites não refletem a realidade
   - Múltiplos claims podem ser feitos sem contabilização

### 3. **Outros Problemas Identificados**

#### A. Extração de IP pode ser manipulada
```typescript
const forwardedFor = request.headers.get("x-forwarded-for");
const ip = forwardedFor 
  ? forwardedFor.split(",")[0].trim() 
  : request.headers.get("x-real-ip") || 
    request.ip || 
    "unknown";
```

**Problema:** O header `x-forwarded-for` pode ser falsificado por clientes maliciosos. Em produção no Vercel, deve-se confiar apenas em `x-real-ip` ou `request.ip`.

#### B. Falta de validação quando IP é "unknown"
Se o IP não puder ser determinado, o sistema usa "unknown" como chave, o que significa que todos os usuários sem IP detectável compartilham o mesmo limite.

#### C. Timeouts muito curtos
- Conexão: 3 segundos
- Leitura: 2 segundos
- Escrita: 2 segundos

Em ambientes serverless com cold starts, esses timeouts podem ser muito curtos, causando falhas frequentes.

## Como Verificar os Logs no Vercel

### 1. Acesse o Dashboard do Vercel
1. Vá para https://vercel.com
2. Acesse o projeto `easyfaucet-arc`
3. Vá para a aba "Logs" ou "Functions"

### 2. Procure por:
- `Redis connection error`
- `Redis get error`
- `Redis setEx error`
- `Rate limit exceeded`
- `[CLAIM]` logs

### 3. Filtros Úteis:
- Filtre por função: `/api/claim`
- Filtre por nível: `error` e `warn`
- Período: últimas 24 horas

### 4. Métricas a Observar:
- Quantidade de erros de Redis
- Quantidade de rate limits bloqueados (status 429)
- Quantidade de claims bem-sucedidos
- Tempo de resposta do Redis

## Recomendações de Correção

### 1. **Mudar de FAIL OPEN para FAIL CLOSED (CRÍTICO)**

O sistema deve **bloquear requisições** quando o Redis estiver indisponível, não permitir.

```typescript
// ANTES (FAIL OPEN - PERIGOSO):
} catch (error) {
  console.error("Redis connection error in checkRateLimit:", error);
  return { allowed: true, ... }; // ❌ PERMITE TUDO
}

// DEPOIS (FAIL CLOSED - SEGURO):
} catch (error) {
  console.error("Redis connection error in checkRateLimit:", error);
  // ❌ BLOQUEIA quando Redis está indisponível
  return { 
    allowed: false, 
    remainingRequests: 0, 
    resetTime: Date.now() + (RATE_LIMIT_WINDOW * 1000),
    error: "Rate limiting service unavailable"
  };
}
```

### 2. **Melhorar Extração de IP**

```typescript
// Confiar apenas em headers confiáveis do Vercel
const ip = request.headers.get("x-real-ip") || 
           request.ip || 
           null;

if (!ip || ip === "unknown") {
  return NextResponse.json(
    { error: "Unable to determine IP address" },
    { status: 400 }
  );
}
```

### 3. **Aumentar Timeouts e Adicionar Retry**

```typescript
const REDIS_CONNECTION_TIMEOUT = 5000; // 5 segundos
const REDIS_OPERATION_TIMEOUT = 3000; // 3 segundos
const REDIS_MAX_RETRIES = 2;
```

### 4. **Adicionar Monitoramento e Alertas**

- Alertar quando Redis está offline
- Monitorar taxa de erros de Redis
- Alertar quando rate limit está sendo bypassado

### 5. **Adicionar Fallback com Cache Local (Opcional)**

Para alta disponibilidade, pode-se usar um cache local (in-memory) como fallback, mas com limites mais restritivos:

```typescript
// Cache local apenas para emergências, com limite mais baixo
const localCache = new Map<string, { count: number; resetTime: number }>();
const LOCAL_CACHE_MAX_REQUESTS = 5; // Limite mais baixo no fallback
```

## Outras Travas no Sistema

### 1. **Cooldown do Contrato (Funcionando)**
- Linha 302-326: Verifica `canClaim` no contrato
- Esta trava está funcionando corretamente
- Limita por endereço de carteira, não por IP

### 2. **Validação de Endereço (Funcionando)**
- Linha 257-269: Valida formato do endereço
- Funcionando corretamente

### 3. **Rate Limit por IP (COM PROBLEMA)**
- Linha 220: Verifica rate limit
- **PROBLEMA:** Fail open permite bypass quando Redis falha

## Ação Imediata Necessária

1. **URGENTE:** Mudar fail open para fail closed
2. Verificar logs do Vercel para confirmar se Redis está falhando
3. Verificar se `REDIS_URL` está configurado corretamente no Vercel
4. Monitorar métricas de Redis após a correção

## Próximos Passos

1. Implementar correções de fail closed
2. Testar em ambiente de staging
3. Deploy em produção
4. Monitorar logs e métricas
5. Adicionar alertas para falhas de Redis


