# Checklist de regressão — Rotina Inteligente V2

Use este guia em **celular** e **desktop**. Marque cada item após validar.

## Ambiente

- [ ] Abrir via `http://` (não `file://`)
- [ ] Service worker ativo / PWA instalável
- [ ] Login com usuário A e concurso PC/AL

## Planejamento

- [ ] Primeiro acesso mostra setup (leve/equilibrada/intensa)
- [ ] Pular setup funciona (padrão leve)
- [ ] Semana gera blocos
- [ ] Regenerar semana preserva blocos concluídos
- [ ] Adicionar bloco rápido
- [ ] Pausar / retomar rotina
- [ ] Alertas de sobrecarga aparecem como sugestão (não bloqueiam)

## Hoje / sessão

- [ ] KPIs do dia (minutos, questões, meta mínima, sequência)
- [ ] Iniciar próxima sessão
- [ ] Cronômetro countdown e count-up
- [ ] Pausar / continuar
- [ ] Registrar distração
- [ ] Encerrar com tempo **real** (não inventa minutos se não rodou)
- [ ] Concluir / parcial / ignorar com motivo opcional
- [ ] “Tenho pouco tempo” (10/20/30) **sem** apagar plano original
- [ ] Reagendar: preview + confirmação
- [ ] Abrir módulo (review / mapa) a partir do bloco

## Sequência

- [ ] Cumprir meta mínima aumenta sequência
- [ ] Dia de descanso não zera sequência
- [ ] Só abrir o app não conta dia
- [ ] Proteção após 7 dias (máx. 2)
- [ ] Mensagem de retomada sem tom punitivo

## Revisão semanal / progresso

- [ ] Aba Progresso mostra consistência (não XP)
- [ ] Revisão semanal salva respostas
- [ ] Sugestão de carga exige confirmação

## Revisão inteligente (fila)

- [ ] Bloco `revisao_fila` leva à tela de revisão
- [ ] Fila sem duplicar itens
- [ ] Revisão **não** altera XP / estrelas / domínio

## Backup

- [ ] Exportar Kafra após usar rotina
- [ ] Arquivo contém `routineProfiles` / `routineBlocks` (backup v4)
- [ ] Restaurar no mesmo concurso
- [ ] Backup de outro concurso é rejeitado
- [ ] Backup inválido não apaga dados atuais

## Offline / PWA

- [ ] App abre offline após cache
- [ ] Rotina acessível offline
- [ ] Ícone / install ainda funcionam

## Isolamento

- [ ] Usuário B não vê blocos do usuário A
- [ ] Mesmo usuário: concurso PC/AL ≠ PF/PRF (progresso separado)
- [ ] Trocar de concurso e voltar: rotina do PC/AL intacta

## Desktop vs celular

- [ ] Celular: abas roláveis, próxima ação em destaque
- [ ] Desktop: grade semanal com 7 colunas
- [ ] Teclado: foco visível nos botões da rotina
- [ ] `prefers-reduced-motion` respeitado em scrolls da UI

## Não-regressão geral

- [ ] Home, mapa, batalha, forja (dev), grimório, bem-estar
- [ ] Autenticação / biblioteca
- [ ] Botão instalar PWA
- [ ] `.phase5-work` **não** foi alterada
