# Relatório de análise — Organização Financeira

Data: 17/10/2026 · Escopo: código, produto, UX/UI, acessibilidade, ferramentas.
Não alterei nenhum código. As referências de linha valem para o commit `117addd`.

---

## 1. Resumo

O app tem uma proposta boa e bem focada: ler a fatura do Carrefour, cruzar com rendas e contas fixas e projetar o saldo dos próximos meses. O problema não está nas funcionalidades. Está na **base**: foram várias gerações de código geradas por IA empilhadas umas sobre as outras. Isso deixou três formatos de armazenamento convivendo, dois parsers de fatura, módulos duplicados e uma sincronização que, por causa disso, **perde edições**.

Prioridades, em ordem:

1. **Corrigir a sincronização.** Achei a causa concreta das falhas (seção 2.1).
2. **Proteger os dados.** O Firebase provavelmente está aberto e o backup não salva as faturas.
3. **Consolidar a arquitetura.** Uma única fonte de verdade, sem pastas duplicadas.
4. Só depois disso: redesign visual e funcionalidades novas.

---

## 2. Bugs e riscos críticos

### 2.1 Por que o compartilhamento falha (causa raiz)

As rendas e as contas fixas são **salvas numa chave** do localStorage e **enviadas ao Firebase a partir de outra**:

- O app salva em `fin_v2:transacoes_fixas` (`storageService.ts:232`, chamado por `saveAllData` e por `App.tsx:139`).
- A sincronização lê de `fin_fixed_bills` e `fin_incomes` (`syncService.ts:136-148`). Essas chaves **só são gravadas quando chega um dado remoto** (`resolveConflicts`, linha 280).

**Consequência:** quando você edita uma conta fixa ou uma renda, o push envia a versão antiga. Quando chega uma atualização da sua esposa, ela é mesclada com essa lista antiga, e não com a sua lista atual. Às vezes funciona (quando a outra pessoa já tinha gravado a chave antiga), às vezes não. É exatamente o comportamento de "falhas estranhas". Faturas e parcelas usam a mesma chave nos dois lados, por isso devem funcionar melhor.

Outros problemas da sincronização:

| Problema | Onde | Efeito |
|---|---|---|
| A persistência acontece **duas vezes**: dentro do `setState` do hook (efeito colateral dentro do updater, com closures antigas de outros domínios) **e** de novo nos `useEffect` do App | `useFinancialState.ts:52-82`, `App.tsx:136-175` | Gravações duplicadas, timestamps `updatedAt` mudam sem motivo e o push sobe dado antigo. No StrictMode o updater roda 2 vezes |
| O anti-eco `incomingDomains` só remove `"fixedBills"`. Quando chega `"incomes"`, ele fica preso no Set para sempre | `App.tsx:144, 190` | Pushes de eco e loops ocasionais |
| A resolução de conflito usa `Date.now()` de cada aparelho | `storageService.ts:55` | Se um celular estiver com o relógio adiantado, ele "ganha" sempre |
| Cada push sobrescreve a **lista inteira** do domínio (`update` em `domains/invoices`) | `syncService.ts:166` | Duas edições quase simultâneas: uma some até o próximo ciclo de merge |
| O listener ignora o snapshot inteiro quando `_writtenBy === DEVICE_ID` | `syncService.ts:334` | Se você e ela gravarem em sequência rápida, você pode perder o estado intermediário |
| O `DEVICE_ID` fica no `sessionStorage` | `syncService.ts:35` | Cada aba ou reabertura do PWA vira um "dispositivo" novo |
| O status começa como `"synced"` sem ter sincronizado nada | `useSyncEngine.ts:22` | O indicador mente |

**Recomendação:** trocar a modelagem. Em vez de "lista inteira por domínio", gravar **um nó por item** no Firebase (`rooms/{code}/fixedBills/{id}`) e usar `onChildAdded/Changed/Removed`. Assim o próprio Firebase faz o merge por item, sem lógica caseira de tombstone. Uma alternativa melhor é migrar para o **Firestore** com cache offline nativo (`persistentLocalCache`). O Firestore já resolve offline, fila de escrita e tempo real, e permite apagar ~400 linhas de sync/storage. Usar `serverTimestamp()` em vez do relógio local.

### 2.2 Segurança dos dados financeiros

- O código de compartilhamento tem **6 caracteres de `Math.random`**, e o app não usa autenticação. Não há `database.rules.json` no repositório. Se as regras do Realtime Database estiverem `.read: true`, **qualquer pessoa pode ler `sync_rooms` inteiro**, com os dados de todo mundo. Vale conferir no console do Firebase hoje.
- Correção: usar Firebase Auth (login com Google, ou pelo menos anônimo), associar a sala a `uid`s membros e escrever regras como `auth.uid in members`. O código de convite passa a servir só para entrar na sala, e não para dar acesso direto.
- `invoiceParserClient.ts:142` tem **nomes reais hardcoded** (`KNOWN_PORTADORES`). Isso é dado pessoal no repositório, e o parser não funciona para outros portadores. O ideal é detectar o portador por padrão (linha em caixa alta + final do cartão), ou deixar isso configurável.
- `server.ts` tem endpoints `/api/sync/:code` sem autenticação, gravando em disco. É código morto (o sync usa Firebase), mas fica exposto se o server rodar. Remover.

### 2.3 Backup incompleto (risco de perda de dados)

`exportarBackupDoApp` só exporta configurações, rendas e contas fixas. **Faturas e parcelas simuladas não entram no backup.** O import também só restaura essas partes (`backupService.ts:88`). Se o iOS limpar o storage do PWA (isso acontece depois de ~7 dias sem uso no Safari), as faturas se perdem.

### 2.4 Cálculos

- **Dinheiro em `float`.** Somas como `0.1 + 0.2` acumulam erro. Use centavos inteiros (`number` em centavos) no domínio inteiro.
- **A projeção da fatura subestima os gastos futuros.** Ela projeta apenas as parcelas da última fatura (`reportCalculator.ts:33`). Assinaturas e gastos recorrentes (streaming, mercado, combustível) somem dos meses futuros, e o saldo projetado fica otimista demais. Sugestão: uma estimativa de "gasto variável médio" (a média das últimas 3 faturas sem as parcelas), exibida separadamente como *estimado*.
- O parser lê **só a primeira e a última página** do PDF (`invoiceParserClient.ts:177`). Uma fatura com lançamentos em mais de uma página perde transações sem avisar. É preciso varrer todas as páginas a partir de "LANÇAMENTOS".
- **Não existe checagem de consistência.** O app não compara a soma dos lançamentos lidos com o total da fatura. Esse é o melhor indicador de que o parser errou. Mostrar "Lidos R$ X de R$ Y (diferença R$ Z)" daria confiança imediata.
- `calculationEngine.ts` (projeção de 12 meses, `rotacionarJanelaTemporal`, `meses_calculados`) é praticamente **código morto**: a UI usa `calculateReport`. São dois motores de cálculo com regras diferentes de renda recorrente.
- O ano da compra (`getPurchaseFullDate`) precisa considerar compras de dezembro numa fatura de janeiro. Conferir esse caso nos testes.

---

## 3. Arquitetura e qualidade de código

**Diagnóstico:** existe uma tentativa de "Clean Architecture/modules" pela metade. Os arquivos de `src/components/*` e `src/hooks/*` são reexports de 8 linhas para `src/modules/*`. Já `src/services/*` contém a lógica de verdade, e `src/modules/*/application` reexporta de `services`. Há dois `formatters`, dois `useFinancialState`, dois `backupService`, `utils.ts` e `utils/formatters.ts`. Nomes misturam português e inglês (`rendas`/`incomes`, `contasFixas`/`fixedBills`) para os mesmos dados.

**Lixo e restos no repositório:**
- `microservices/invoice_parser` (Python) + `/api/parse-invoice` + Docker: o parser real é client-side (pdf.js). O Python é legado, e há um `.pyc` versionado.
- `src/components/InvoiceUploadZone.tsx` e `PurchaseFormModal.tsx` estão duplicados com conteúdo diferente do de `modules/`.
- `package.json` com `"name": "react-example"`, `metadata.json` e `.aistudio/`: restos do template.
- Dois workflows de CI (`ci.yml` e `main.yml`). Ver se ambos são necessários.
- `vite` aparece em dependencies e devDependencies.
- O worker do pdf.js vem de CDN (`cdnjs`). Se o CDN cair ou o app estiver offline, o PWA não lê faturas. Deve ser empacotado com `?url` do Vite.

**Componentes enormes:** `Onboarding` (539), `Reports` (544), `CardInvoices` (498), `FixedBills` (456). Cada um mistura estado de formulário, regra de negócio e layout. `CardInvoices` tem 7 `useState` só para o formulário de compra.

**Estrutura proposta (simples, para um app pessoal):**

```
src/
  domain/        tipos, money (centavos), cálculos puros + testes
  data/          repositório único (Firestore c/ cache offline) + migração do localStorage
  features/
    dashboard/  invoices/  bills/  simulations/  reports/  sharing/
  ui/            design system: Button, Card, Sheet, Field, MoneyInput, Toast, EmptyState
  app/           App, rotas, providers
```

- Um único store (Zustand, ou `useReducer` + Context) com `actions` nomeadas (`addBill`, `importInvoice`...) em vez de passar `setX` para cada tela.
- Roteamento real (`react-router` ou um hash simples): o botão "voltar" do Android funciona, você pode abrir uma aba direto e o estado sobrevive ao refresh.
- `zod` para validar o backup e os dados vindos do Firebase. Isso substitui o validador manual.
- Testes: os de domínio estão no caminho certo. Faltam testes do parser com **um PDF real anonimizado** (fixture), que é o teste mais valioso do app.

---

## 4. Heurísticas de Nielsen (UX)

| # | Heurística | Situação | O que fazer |
|---|---|---|---|
| 1 | Visibilidade do status | O badge de sync mostra "Sincronizado" sem ter sincronizado. O loading do parser alterna 2 mensagens fixas. Não aparece "última sincronização há X min" | Status real com horário, toast ao receber alterações da outra pessoa ("Ana editou Luz") |
| 2 | Correspondência com o mundo real | "Parcelas Simuladas", "Conciliação", "Projetado" são termos técnicos. O cabeçalho diz "Pessoal & IA" e não há IA | "Compras planejadas", "Isso já apareceu na fatura?", "Estimado" |
| 3 | Controle e liberdade | A exclusão usa `confirm()` nativo e não tem desfazer. Enviar uma fatura nova **substitui a anterior do mês sem perguntar** (`CardInvoices.tsx:66`). O botão voltar do Android sai do app | Toast com "Desfazer" (5s), confirmação ao substituir a fatura, rotas |
| 4 | Consistência e padrões | Três padrões de modal, `alert()` misturado com banners, labels em CAIXA ALTA de 9px. A bottom bar mostra só a primeira palavra ("Renda", "Fatura", "Parcelas", "Relatórios") | Design system único, labels curtos e pensados para a bottom bar |
| 5 | Prevenção de erros | O valor é digitado como `parseFloat` (vírgula brasileira quebra: "12,50" vira 12). Não há máscara de moeda. A fatura enviada no mês errado não é detectada | `MoneyInput` com máscara BRL e `inputmode="decimal"`. Ler o mês de vencimento do próprio PDF e sugerir o mês correto |
| 6 | Reconhecer em vez de lembrar | A fatura não mostra de qual mês ou vencimento ela é. Categoria fica sempre "Geral" | Categorização automática por palavra-chave (iFood, Posto, Drogasil...) com aprendizado pelas edições |
| 7 | Flexibilidade e eficiência | O FAB rola até o elemento via `setTimeout`. Não há busca nem filtro por portador | Busca e filtro por portador/categoria, ações rápidas que abrem a sheet direto |
| 8 | Estética e minimalismo | Tudo tem o mesmo peso visual (cards brancos, bordas zinc, texto de 9–11px) e o número mais importante compete com 4 cards | Hierarquia: um número herói, um gráfico, uma lista |
| 9 | Recuperação de erros | Erros do parser são técnicos e não dizem o que fazer. "Armazenamento cheio" não diz o que apagar | Mensagens com ação: "Não achei lançamentos. Esta é a fatura Carrefour? [Adicionar manualmente]" |
| 10 | Ajuda e documentação | Existe o onboarding, mas não há explicação de como o saldo é calculado | Um "?" no saldo que abre a composição: renda − fixas − fatura − planejadas |

---

## 5. Acessibilidade e mobile

- **Fontes de 9–11px** em todo lugar (`text-[9px]`, `text-[10px]`). Falham na legibilidade e não respeitam o tamanho de fonte do sistema. O mínimo deve ser 12px para metadados e 14–16px para o corpo.
- **Contraste:** `text-zinc-400` sobre branco dá cerca de 2.8:1, abaixo do WCAG AA (4.5:1). Isso é muito usado nos rótulos.
- **Cor como única informação:** verde/vermelho para saldo sem ícone ou texto alternativo (há o "+", mas não há "−" explícito nem ícone).
- Só existe **um** `aria-label` no app inteiro. Botões só com ícone (meses, editar, excluir) não têm nome acessível, e `title` não serve para leitores de tela.
- Modais sem `role="dialog"`, sem foco preso, sem fechar com Esc e sem devolver o foco.
- `focus:outline-hidden` no FAB remove o indicador de foco.
- Não respeita `prefers-reduced-motion` (motion em todo troca de aba).
- **Não há modo escuro**, e para um app de finanças usado à noite isso faz falta.
- Mobile: o header fica apertado com mês + instalar + sync. A bottom bar tem 5 itens com 9px de texto. O `pb-safe-bottom` precisa de `env(safe-area-inset-bottom)` real e `viewport-fit=cover` no `index.html` para o iPhone.
- **Formulários em página em vez de bottom sheet**, que é o padrão nativo no mobile.

---

## 6. Proposta visual

Direção: **"calmo e confiável"**, no estilo dos apps de finanças pessoais bem avaliados (Copilot Money, Monarch, Revolut). Escrevi a partir do meu repertório desses apps e de padrões comuns em shots de finance no Dribbble. Não naveguei no Dribbble nesta sessão. Se quiser, posso pesquisar referências específicas e montar um moodboard.

- **Tela inicial = uma pergunta:** "Quanto sobra este mês?" Um número grande, com o valor animado (contando), e embaixo uma barra empilhada horizontal: renda dividida em fixas | fatura | planejadas | sobra.
- **Linha do tempo de 6 meses** (sparkline ou área) com o saldo projetado, marcando o mês em que cada parcela grande termina ("Em mar/27 libera R$ 420"). Isso responde direto ao "o que está acabando vs. longe de acabar", que é o coração do produto.
- **"Parcelas terminando"** em cards com anel de progresso (7/10), ordenados por quanto falta.
- **Fatura como "extrato de cartão"**: um cartão visual com o final do número e o vencimento, a lista agrupada por portador com avatar/inicial e chips de categoria.
- **Paleta:** fundo off-white quente / grafite profundo no escuro, um acento único (verde-azulado) e vermelho só para alerta. Números tabulares (`font-variant-numeric: tabular-nums`) em fonte como Inter/Geist.
- **Microinterações:** swipe para editar/excluir na lista, haptic (`navigator.vibrate`) ao confirmar, skeleton no lugar de spinner, transição compartilhada do card para o detalhe.
- **Presença de quem compartilha:** avatar "J" e "A" no topo e "editado por A há 2 min" nos itens.

---

## 7. Funcionalidades sugeridas (depois da base)

**Alto valor, pouco esforço**
1. Checagem do total da fatura (soma lida vs. total impresso).
2. Categorização automática + gráfico por categoria.
3. "Quando as parcelas terminam": calendário de alívio de orçamento.
4. Vencimentos das contas fixas com lembrete (push no PWA via Firebase Cloud Messaging) e marcação de "paga" por mês.
5. Backup completo + export CSV.

**Médio prazo**
6. Simulador "Posso comprar?": informe valor e nº de parcelas e veja o impacto nos próximos 12 meses antes de comprar. É uma evolução natural das "parcelas simuladas".
7. Orçamento por categoria com barra de consumo.
8. Gasto variável estimado (média das faturas) na projeção.
9. Metas e reserva de emergência ("faltam R$ X, no ritmo atual chega em jun/27").
10. Divisão do casal: quanto cada portador gastou e quem deve quanto.

**Exploratório**
11. Leitura de outros cartões (o código já tenta detectar bancos).
12. Importar o OFX/CSV do banco para a conta corrente.
13. Resumo mensal automático ("Em outubro vocês gastaram 12% menos com delivery").

---

## 8. Plano sugerido

| Fase | Entrega | Esforço |
|---|---|---|
| 0 — Emergência | Conferir as regras do Firebase. Corrigir a chave do sync de fixas/rendas. Backup completo | ~1 dia |
| 1 — Base | Auth + Firestore offline (ou RTDB por item), store único, migração do localStorage, apagar duplicatas e Python, valores em centavos, parser lendo todas as páginas + fixture de teste | 1–2 semanas |
| 2 — Design system | Tokens, modo escuro, componentes acessíveis, bottom sheets, MoneyInput, toasts com desfazer, rotas | 1 semana |
| 3 — Redesign | Dashboard novo, linha do tempo, parcelas terminando, fatura repaginada | 1–2 semanas |
| 4 — Funcionalidades | Itens da seção 7 conforme a sua prioridade | contínuo |
