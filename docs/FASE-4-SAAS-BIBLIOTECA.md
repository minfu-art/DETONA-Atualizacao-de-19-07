# Fase 4 — fundação SaaS e biblioteca de concursos

## Resultado

A conta do aluno tornou-se global e a jornada de estudo passou a depender de um
contexto composto por `userId + contestId`. O login abre a biblioteca pessoal,
não diretamente um edital. Cada direito de acesso é um `Entitlement` separado.

## Limites desta fase

O checkout local apenas demonstra o contrato de compra e não realiza cobrança.
PF e PRF podem ser adicionados à biblioteca, mas ficam marcados como conteúdo
em preparação e não reutilizam dados do PC/AL. O PC/AL continua sendo o único
pacote editorial completo e funcional.

## Persistência

- conta e preferências globais: `DetonaConcursosAuthDB`;
- direitos: store `entitlements`;
- registros demonstrativos de aquisição: store `purchases`;
- progresso: `DetonaConcursosDB__user__<userId>__contest__<contestId>`.

Assim, o mesmo aluno compartilha identidade e biblioteca, enquanto player, XP,
rotina, estatísticas, edital, histórico e questões permanecem isolados por
concurso.

## Compatibilidade

O primeiro cadastro ainda pode importar o banco global original diretamente
para PC/AL. Contas criadas na fase 3 recebem uma segunda migração idempotente do
banco por usuário para o novo banco `user + contest`. Nenhuma origem é apagada.

## Contratos substituíveis

- `AuthService`: futuro adapter Supabase Auth;
- `UserRepository`: futuro perfil remoto;
- `EntitlementRepository`: direitos concedidos pelo backend;
- `CheckoutService`: orquestra compra;
- `LocalDemoCheckoutGateway`: substituir por gateway real;
- `LibraryService`: catálogo e biblioteca sem conhecer UI ou IndexedDB;
- `ProgressRepository`: futuro storage sincronizado/offline.

Em produção, somente webhooks validados no backend poderão conceder direitos.
O retorno do navegador nunca deverá ativar um concurso diretamente.
