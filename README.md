# Controle Financeiro

App web (PWA) de organização financeira pessoal. Ele lê a fatura do cartão em PDF, separa os lançamentos por cartão e por pessoa, e cruza tudo com as rendas e as contas fixas. O resultado é quanto sobra neste mês e nos próximos, e quando cada parcela termina.

## Como rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # testes unitários (Vitest)
npm run lint         # checagem de tipos
npm run build        # build de produção + servidor estático (dist/server.cjs)
npm run test:e2e     # testes ponta a ponta (Playwright)
```

O compartilhamento entre aparelhos usa o Firebase Realtime Database. Copie `.env.example` para `.env` e preencha as variáveis `VITE_FIREBASE_*`. Sem elas, o app funciona normalmente, só que sem compartilhamento.

## Estrutura

```
src/
  domain/      Regras de negócio puras (sem React, sem storage) + testes
    money.ts         dinheiro em centavos inteiros
    month.ts         meses "AAAA-MM"
    projection.ts    cálculo do mês, projeção, "o que está acabando"
    categories.ts    categorização automática dos lançamentos
    invoice/         leitura da fatura: layout → linhas → lançamentos
  data/        Persistência e integrações
    patch.ts         alterações como "caminho → valor"
    persistence.ts   localStorage (estado, fila offline, preferências)
    legacy.ts        migração dos formatos antigos do app
    backup.ts        backup completo (v3) e importação de backups antigos
    sync/            sincronização com o Firebase
    pdf/             extração do texto do PDF (pdf.js, no navegador)
  app/         Store central, ações (casos de uso), rotas
  features/    Telas: dashboard, invoices, bills, plans, reports, settings, onboarding
  ui/          Design system: botões, campos, folhas (dialog), toasts, cards
```

## Decisões importantes

**Dinheiro em centavos.** Todos os valores são inteiros em centavos (`amountCents`). Isso elimina os erros de ponto flutuante nas somas. Os campos de valor usam a máscara de banco (só números), então a vírgula nunca é confundida com ponto.

**Leitura da fatura.** O pdf.js extrai o texto de *todas* as páginas com a posição de cada trecho. O app detecta o layout em duas colunas e lê os blocos de cada portador (`NOME  530034******1234`), que continuam de uma coluna para a outra e de uma página para a outra. O mês da fatura vem da data de vencimento. No fim, a soma dos lançamentos é comparada com o total impresso, e o app avisa se não bater.

**Quem conta no orçamento.** Cada portador pode contar ou não. O titular da conta começa desligado, para o caso de o cartão principal ser de outra pessoa. Os adicionais começam ligados. Lançamentos avulsos podem ser marcados como "não é meu".

**Projeção realista.** Para os meses sem fatura, o cartão previsto soma duas partes:

- as parcelas que ainda caem naquele mês;
- a média dos gastos à vista das últimas 3 faturas.

As compras planejadas também entram, nos meses em que caem.

**Sincronização.** Os dados ficam em `sync_rooms/<código>/v3`, com um caminho por item (`bills/<id>`, `invoices/<id>/purchases/<id>`…). Cada edição é um patch enviado com `update()`, que grava só os caminhos alterados. Assim, duas pessoas editando coisas diferentes não se sobrescrevem. As alterações feitas offline ficam numa fila persistida e são enviadas quando a conexão volta. Na primeira vez que um aparelho entra em um código, os dados locais são somados aos da sala, sem apagar nada. Se a sala ainda estiver no formato antigo, ela é convertida automaticamente.

**Backup.** O arquivo JSON leva tudo: rendas, contas, faturas com lançamentos e marcações, e compras planejadas. A importação também aceita os backups do formato antigo.
