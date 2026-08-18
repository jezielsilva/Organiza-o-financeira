# Controle Financeiro Pessoal — Arquitetura & Decisões Técnicas

> Sistema de gestão financeira pessoal com Inteligência Artificial para parsing de faturas de cartão, projeção orçamentária de 12 meses e sincronização em tempo real.

---

## 🏛️ Decisões de Arquitetura e Design System (ADR)

Este documento registra as principais decisões arquiteturais tomadas para garantir alta manutenibilidade, extensibilidade e resiliência na aplicação.

### 1. Aplicação RÍGIDA dos Princípios SOLID

Com a evolução da base de código, aplicamos os princípios SOLID para resolver o acoplamento excessivo e a duplicação de lógica:

- **Single Responsibility Principle (SRP):**
  - **`invoiceLineParser.ts`**: Isola totalmente a lógica de parsing via Expressões Regulares de faturas PDF/Texto.
  - **`reportCalculator.ts`**: Focado exclusivamente em agregações e consolidação de relatórios de projeção.
  - **`calculationEngine.ts`**: Motor puro para projeção orçamentária de 12 meses (sem dependências de UI ou LocalStorage).
  - **`financialHealth.ts`**: Avalia a saúde financeira utilizando o modelo de regra 50-30-20.
  - **`useFinancialState.ts`**: Custom Hook responsável por isolar a gestão de estado e sincronização com o repositório local.

- **Open/Closed Principle (OCP) & Dependency Inversion (DIP):**
  - Definidos contratos estritos de interface em `src/core/domain/types.ts`:
    - **`IStorageRepository`**: Abstração da camada de persistência. Permite substituir a implementação do LocalStorage sem alterar os hooks ou componentes de apresentação.
    - **`ISyncProvider`**: Contrato para provedores de sincronização (ex: Firebase, WebSockets).
    - **`IInvoiceParser`**: Interface para parsers de fatura (ex: `PdfJsInvoiceParser` no client-side ou microserviço Python no server-side).

- **Liskov Substitution Principle (LSP) & Interface Segregation (ISP):**
  - Interfaces desacopladas e pequenas que evitam que classes ou componentes dependam de métodos que não utilizam.

---

### 2. Arquitetura Modular em Camadas (Enterprise Feature-Driven Layers)

Para organizar o projeto pensando em escala corporativa, estruturamos a base de código separando **Camadas** (responsabilidade arquitetural) e **Módulos** (funcionalidade de negócio/domínio):

```
src/
├── core/                         # Núcleo Transversal Compartilhado
│   ├── domain/
│   │   └── types.ts              # Entidades puras e contratos SOLID
│   ├── infrastructure/
│   │   └── backupService.ts      # Serviços de infraestrutura (Backup/Restore)
│   └── shared/
│       └── formatters.ts         # Utilitários puros de moeda (BRL) e datas
│
├── application/                  # Camada de Aplicação (Casos de Uso)
│   └── hooks/
│       └── useFinancialState.ts  # Gerenciamento global de estado financeiro
│
├── modules/                      # Módulos por Domínio de Negócio
│   ├── fixed-bills/              # Gestão de Rendas e Contas Fixas
│   │   └── presentation/
│   │       └── FixedBills.tsx
│   ├── invoices/                 # Gestão de Faturas e Compras de Cartão
│   │   └── presentation/
│   │       ├── CardInvoices.tsx
│   │       ├── InvoiceUploadZone.tsx
│   │       └── PurchaseFormModal.tsx
│   ├── projection/               # Motor de Cálculo e Relatórios de 12 Meses
│   │   ├── application/
│   │   │   └── reportCalculator.ts
│   │   ├── domain/
│   │   │   └── calculationEngine.ts
│   │   └── presentation/
│   │       ├── Dashboard.tsx
│   │       ├── Reports.tsx
│   │       └── PlannedInstallments.tsx
│   ├── sync/                     # Sincronização em Tempo Real (Firebase)
│   │   ├── application/
│   │   │   └── useSyncEngine.ts
│   │   └── presentation/
│   │       ├── SyncManager.tsx
│   │       └── SyncPage.tsx
│   └── onboarding/               # Wizard de Primeiro Acesso
│       └── presentation/
│           └── Onboarding.tsx
│
├── services/                     # Implementações de serviços e persistência
├── components/                   # Stubs de reexportação (Retrocompatibilidade)
└── hooks/                        # Stubs de reexportação (Retrocompatibilidade)
```

> **Retrocompatibilidade:** Para evitar a quebra de imports antigos durante o refactoring, os diretórios `src/components/` e `src/hooks/` atuam como pontos de reexportação transparente para a nova estrutura modular em `src/modules/`.

---

### 3. Estratégia de Testabilidade e Alta Confiança

Foi implementada uma arquitetura de testes em 4 níveis para garantir a resiliência do sistema:

1. **Testes Unitários (Vitest):**
   - Cobertura completa do motor de cálculo (`calculationEngine.test.ts`).
   - Validação do parser de faturas (`invoiceLineParser.test.ts`).
   - Regras da saúde financeira (`financialHealth.test.ts`).
2. **Testes de Integração (Vitest + Testing Library):**
   - Persistência e tolerância a falhas de cota no LocalStorage (`storageService.test.ts`).
   - Comportamento reativo dos Hooks (`useFinancialState.test.ts`).
3. **Testes de API (Supertest):**
   - Endpoints HTTP do servidor Express (`server.test.ts`).
4. **Testes End-to-End (Playwright):**
   - Fluxo completo do usuário do Onboarding até relatórios (`e2e/app.spec.ts`).

---

## 🚀 Como Rodar o Projeto

### Pré-requisitos
- Node.js (v18+)
- Python 3.x (necessário caso queira utilizar o parser local de faturas com `pdfplumber`)

### 1. Instalação de Dependências
```bash
npm install
```

### 2. Executar em Modo de Desenvolvimento
```bash
npm run dev
```

### 3. Scripts de Verificação e Testes
```bash
# Validação de Tipagem TypeScript (0 erros)
npm run lint

# Executar Testes Unitários, de Integração e de API
npm test

# Executar Testes em Modo Interativo (Watch)
npm run test:watch

# Executar Testes End-to-End no Navegador
npm run test:e2e
```

---

## 🛡️ Segurança e Resiliência

- **Execução Segura no Servidor:** Chamadas ao microserviço Python em `server.ts` utilizam `execFile` sem interpolação de shell, prevenindo riscos de injeção de comandos.
- **Tolerância a Falhas de Storage:** Tratamento explícito de `QuotaExceededError` ao salvar dados pesados no LocalStorage.
- **Sincronização Anti-Loop:** Mecanismo de timestamps por domínio e controle de eco (`incomingDomains`) para evitar loops infinitos em alterações sincronizadas via Firebase.
