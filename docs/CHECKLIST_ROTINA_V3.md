# Checklist — Rotina V3

Legenda: ✅ feito (Fase 0–1) · 🔶 parcial · ⏳ fase futura

## Hoje

- [x] Saudação + data + concurso ativo  
- [x] Contagem regressiva inline (se data da prova)  
- [x] Progresso do dia (anel %)  
- [x] Próxima ação clara (“Comece por aqui”)  
- [x] Blocos do dia (iniciar / concluir / parcial / reagendar / ignorar / abrir módulo)  
- [x] Tempo planejado / executado e questões  
- [x] Botão principal “Começar agora”  
- [ ] Revisões previstas como KPI dedicado (Fase 5)  
- [ ] Modo produtivo dedicado (Fase 4)  
- [ ] Modo “dia difícil” além de “pouco tempo” (Fase 4)  

## Semana

- [x] Grade semanal dinâmica  
- [x] Navegação semana anterior / próxima / hoje  
- [x] Carga por dia + badge sobrecarga / descanso  
- [x] Status dos blocos + tipo de atividade  
- [x] Alertas de planejamento  
- [x] Resumo: planejado, executado, adesão  
- [ ] Drag-and-drop de blocos (quando viável)  
- [ ] Copiar dia / duplicar / recorrência UI completa  

## Mês

- [x] Grade mensal com dias fora do mês  
- [x] Navegação mês anterior / próximo / este mês  
- [x] Minutos / dots (planejado, cumprido, revisão, descanso)  
- [x] Destaque dia da prova e “hoje”  
- [x] Detalhe ao tocar no dia  
- [x] Indicador de sobrecarga por célula  
- [ ] Filtro por tipo de atividade (Fase 5)  

## Data da prova / contagem

- [x] Cadastro data, horário, local, notas, início da preparação  
- [x] Contagem em dias e semanas  
- [x] Percentual percorrido e restante  
- [x] Faixa “reta final”  
- [x] Uso sem data (empty state + rotina continua)  

## Jornada + avatar chibi

- [x] Trilha temporal até a prova  
- [x] Avatar posicionado por `positionPct`  
- [x] Marcos intermediários  
- [x] Mensagens leves (sem culpa)  
- [x] Explicitamente **não é XP**  
- [x] `prefers-reduced-motion`  
- [ ] Sprites chibi custom (opcional)  

## Modo produtivo / dia difícil

- [ ] Entrar no modo produtivo (Fase 4)  
- [x] “Tenho pouco tempo” / plano reduzido (base V2)  
- [ ] “Hoje estou sem energia” completo (Fase 4)  

## Integrações

- [x] Bloco → módulo (questões, revisão, etc.)  
- [x] `revisao_fila` não altera fila  
- [ ] Sugestões de pontos fracos do edital na UI de plano (Fase 5)  
- [ ] Assistente de planejamento completo (Fase 5)  

## Backup / restauração

- [x] Stores de rotina no backup schema (V2)  
- [x] Profile com exam* normalizado  
- [ ] Teste explícito restore exam* + journey (expandir Fase 6)  

## Offline / PWA / isolamento

- [x] Cálculos locais (sem IA externa)  
- [x] Isolamento userId + contestId  
- [x] Sem alteração IndexedDB destrutiva  

## Mobile / desktop / a11y

- [x] Abas scrolláveis no mobile  
- [x] Grade semana 1 coluna no mobile / 7 no desktop  
- [x] Células mês com área de toque razoável  
- [x] focus-visible em células  
- [x] Labels aria em navegação e trilha  
- [x] Redução de movimento  

## Regra XP (obrigatória)

- [x] Rotina não concede XP  
- [x] Não altera nível / estrelas / domínio  
- [x] Testes anti-XP V2 + V3  

## Testes

- [x] Suite V2 regressão  
- [x] Calendário semana / mês / shift  
- [x] Contagem + jornada + chibi  
- [x] Serviço month/week/exam meta  
- [ ] Cobertura completa dos 34 itens do spec (fases 2–6)  

## Documentação

- [x] `docs/ROTINA_V3_JORNADA_PROVA.md`  
- [x] `docs/MIGRACAO_ROTINA_V3.md`  
- [x] `docs/CHECKLIST_ROTINA_V3.md`  
