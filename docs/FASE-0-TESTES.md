# Fase 0 — Base mínima de testes

Data da execução: 2026-07-13  
Escopo: caracterização e proteção das regras de negócio existentes.

## Objetivo

Criar uma base automatizada, leve e sem dependências externas para detectar
regressões nas principais regras de XP, progressão, edital, memória, batalha e
sequência de estudos.

Esta fase não corrige comportamentos, não altera telas, não modifica o banco de
questões, não muda o schema do IndexedDB e não muda o backup Kafra.

## Ferramenta escolhida

Foi utilizado o test runner nativo do Node.js (`node:test`) com
`node:assert/strict`.

Motivos:

- suporte nativo a ES Modules;
- nenhuma dependência para instalar;
- execução rápida;
- suficiente para testar as funções puras atuais;
- baixo custo de manutenção para a Fase 0.

Versão verificada: Node.js 24.18.0.

## Como executar

Na raiz do projeto:

```powershell
node --test
```

Também é possível usar:

```powershell
npm.cmd test
```

Não é necessário executar `npm install`.

## Regras protegidas

### 1. Cálculo de XP

- XP do próximo nível é `nível × 100`.
- XP insuficiente permanece acumulado.
- XP exato consome a meta e avança o nível.

### 2. Progressão de nível

- Um único ganho pode avançar múltiplos níveis.
- O XP remanescente é preservado.
- `xp_next_level` é atualizado após a progressão.

### 3. Trava do nível 90

- Com edital abaixo de 100%, o jogador permanece no nível 90.
- O XP continua acumulado enquanto a trava está ativa.
- Com edital em 100%, o mesmo XP permite avançar para o nível 91.

### 4. Conversão de acurácia em estrelas

- abaixo de 50%: 0 estrela;
- 50% a 69%: 1 estrela;
- 70% a 79%: 2 estrelas;
- 80% a 89%: 3 estrelas;
- 90% a 99%: 4 estrelas;
- 100%: 5 estrelas.

### 5. Três esferas de conclusão

- teoria exige `theory_status === "concluido"`;
- revisão exige `review_count >= 1`;
- domínio exige pelo menos 3 estrelas efetivas;
- o item somente fica completo quando as três condições são verdadeiras;
- memória congelada pode reduzir 3 estrelas brutas para 2 efetivas e apagar a
  esfera de domínio.

### 6. Percentual de conclusão do edital

- cálculo proporcional entre itens completos e total;
- arredondamento atual em duas casas decimais;
- edital vazio permanece em 0%;
- conclusão total retorna 100%.

### 7. Classificação da memória

- sem data: congelada;
- menos de 7 dias: quente;
- de 7 a menos de 14 dias: morna;
- de 14 a menos de 30 dias: fria;
- 30 dias ou mais: congelada.

### 8. Combos de batalha

- bônus de 10 XP no marco de 3 acertos;
- bônus de 30 XP no marco de 5 acertos;
- bônus de 100 XP no marco de 10 acertos;
- dez acertos geram 140 XP de combo e 240 XP durante as respostas;
- um erro zera o combo e reduz o HP visual do jogador em 8 pontos.

### 9. Bônus de batalha diária

- modo `daily` concede 150 XP;
- modo `subtopic` não recebe esse bônus.

### 10. Sequência de estudos

- primeiro estudo inicia sequência em 1;
- estudo no dia seguinte incrementa a sequência;
- dia perdido ativa brasas e uma missão de resgate;
- resgate concluído no dia seguinte restaura a sequência;
- outra batalha no mesmo dia não altera a sequência nem a missão pendente.

## Extrações mínimas realizadas

Foram extraídas três funções puras, e os fluxos originais passaram a chamá-las:

- `calculateEditalCompletionPercentage()` em `ssot.js`;
- `dailyBattleBonus()` em `battle.js`;
- `applyStudyStreak()` em `battle.js`.

As fórmulas e condições foram movidas sem alteração de comportamento.

## Resultado da execução

```text
tests:     29
passaram:  29
falharam:   0
cancelados: 0
ignorados:  0
```

Status: **todos os testes passaram**.

## Arquivos criados

- `package.json`
- `test/progression.test.js`
- `test/ssot-memory.test.js`
- `test/battle-rules.test.js`
- `docs/FASE-0-TESTES.md`

## Arquivos modificados

- `app/js/core/ssot.js`
- `app/js/core/battle.js`

## Bugs e comportamentos problemáticos registrados, não corrigidos

1. **Data em UTC:** a batalha ainda calcula hoje e ontem com
   `toISOString().slice(0, 10)`. No horário de Brasília, o dia pode mudar antes
   da meia-noite local e afetar sequência e metas.
2. **Resgate no mesmo dia:** após a sequência virar brasas, novas batalhas no
   mesmo dia não reduzem `rescue_missions_pending`, pois `last_study_date` já é
   igual a hoje. O teste preserva esse comportamento.
3. **Bônus diário repetível:** o bônus de 150 XP depende apenas do modo
   `daily`. Não existe, nesta regra, uma trava de uma recompensa por dia.
4. **Comentário divergente das estrelas:** o SSOT descreve 3 estrelas como
   equivalente a mais de 70%, mas a implementação exige 80%.
5. **Temperatura armazenada pode envelhecer:** `effectiveStars()` prioriza
   `memory_temperature` já armazenada. Se ela não for recalculada, pode divergir
   do tempo transcorrido desde `last_studied_at`.

Esses pontos devem ser tratados em tarefas próprias, com mudança explícita dos
testes de caracterização quando o novo comportamento for aprovado.

## Limites desta base

- Não há testes de DOM ou navegação.
- Não há testes reais de IndexedDB.
- `finalizeBattle()` não foi executada contra banco simulado; as regras puras
  extraídas são chamadas por ela e foram testadas isoladamente.
- Não há validação do conteúdo do banco de questões nesta tarefa.
- Não há teste do formato Kafra nesta tarefa.

Nenhuma fase posterior foi iniciada.
