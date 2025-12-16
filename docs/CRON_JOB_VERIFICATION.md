# Como Verificar se o Cron Job está Funcionando

Este documento explica várias formas de verificar se o Vercel Cron Job está funcionando corretamente para atualizar o cache dos projetos.

## 📋 Métodos de Verificação

### 1. **Dashboard do Vercel** (Recomendado)

1. Acesse o [Dashboard do Vercel](https://vercel.com/dashboard)
2. Selecione o projeto `easyfaucet-arc`
3. Vá para a aba **"Cron Jobs"** no menu lateral
4. Você verá:
   - Status do cron job (Ativo/Inativo)
   - Última execução
   - Próxima execução
   - Histórico de execuções
   - Logs de cada execução

### 2. **Function Logs no Vercel**

1. No Dashboard do Vercel, vá para **"Deployments"**
2. Selecione o deployment mais recente
3. Clique em **"Functions"** ou **"Logs"**
4. Procure por chamadas para `/api/projects/refresh`
5. Verifique os logs para ver:
   - Se a função foi executada
   - Tempo de resposta
   - Número de projetos carregados
   - Possíveis erros

### 3. **Teste Manual da Rota**

Você pode testar manualmente chamando a rota de refresh:

```bash
# Teste local (se estiver rodando localmente)
curl http://localhost:3000/api/projects/refresh

# Teste em produção
curl https://easyfaucetarc.xyz/api/projects/refresh
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "Cache refreshed successfully",
  "data": [...],
  "stats": {
    "projectCount": 10,
    "cacheAge": 0
  }
}
```

### 4. **Script de Teste Automatizado**

Use o script de teste que criamos:

```bash
# Teste local
node scripts/test-cron-job.js

# Teste em produção
node scripts/test-cron-job.js --url https://easyfaucetarc.xyz
```

O script testa:
- ✅ Se a rota de refresh está funcionando
- ✅ Se a rota de projetos está retornando dados
- ✅ Idade do cache
- ✅ Número de projetos carregados

### 5. **Verificar Idade do Cache**

A rota `/api/projects` retorna informações sobre o cache:

```bash
curl https://easyfaucetarc.xyz/api/projects
```

**Resposta inclui:**
```json
{
  "success": true,
  "data": [...],
  "cached": true,
  "stats": {
    "projectCount": 10,
    "cacheAge": 900000  // em milissegundos
  }
}
```

**Como interpretar:**
- `cacheAge: 0` = Cache acabou de ser atualizado
- `cacheAge: 900000` = Cache tem 15 minutos (900.000ms = 15min)
- Se `cacheAge` for maior que 15 minutos, o cron job pode não estar funcionando

### 6. **Monitorar Novos Projetos**

1. Adicione um novo projeto no Arc Index
2. Aguarde até 15 minutos
3. Verifique se o novo projeto aparece no Easy Faucet
4. Se aparecer, o cron job está funcionando! ✅

### 7. **Verificar Configuração no vercel.json**

Confirme que o `vercel.json` está configurado corretamente:

```json
{
  "crons": [
    {
      "path": "/api/projects/refresh",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Cron Schedule: `*/15 * * * *`**
- Executa a cada 15 minutos
- Formato: `minuto hora dia mês dia-da-semana`

## 🔍 Troubleshooting

### Cron Job não está executando?

1. **Verifique o plano do Vercel:**
   - Hobby: Máximo 2 cron jobs, 1x por dia
   - Pro: Até 40 cron jobs, ilimitado
   - Enterprise: Até 100 cron jobs, ilimitado

2. **Verifique se o deployment foi feito:**
   - O cron job só é ativado após o deploy
   - Verifique se o `vercel.json` está no commit

3. **Verifique os logs:**
   - Dashboard > Deployments > Logs
   - Procure por erros na execução

4. **Teste manualmente:**
   - Chame a rota `/api/projects/refresh` manualmente
   - Se funcionar manualmente, o problema é no agendamento

### Cache não está atualizando?

1. **Verifique se a API do Arc Index está acessível:**
   ```bash
   curl https://v0-arc-index.vercel.app/api/public/projects
   ```

2. **Verifique os logs da função:**
   - Pode haver erros ao buscar da API
   - Verifique se há rate limiting

3. **Teste o refresh manual:**
   ```bash
   curl https://easyfaucetarc.xyz/api/projects/refresh
   ```

## 📊 Monitoramento Contínuo

Para monitorar continuamente:

1. **Configure alertas no Vercel** (se disponível no seu plano)
2. **Use o script de teste periodicamente:**
   ```bash
   # Adicione ao crontab (exemplo)
   */30 * * * * cd /path/to/project && node scripts/test-cron-job.js --url https://easyfaucetarc.xyz
   ```

3. **Monitore a idade do cache:**
   - Se `cacheAge` sempre for > 15 minutos, há um problema

## ✅ Checklist de Verificação

- [ ] Cron job aparece no Dashboard do Vercel
- [ ] Status mostra "Ativo"
- [ ] Última execução foi há menos de 15 minutos
- [ ] Logs mostram execuções bem-sucedidas
- [ ] Rota `/api/projects/refresh` responde corretamente
- [ ] Rota `/api/projects` retorna dados
- [ ] `cacheAge` é atualizado regularmente
- [ ] Novos projetos aparecem em até 15 minutos

## 🔗 Links Úteis

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Dashboard do Projeto](https://vercel.com/brunoamuniz-9230s-projects/easyfaucet-arc)
- [Arc Index API](https://v0-arc-index.vercel.app/api/public/projects)


