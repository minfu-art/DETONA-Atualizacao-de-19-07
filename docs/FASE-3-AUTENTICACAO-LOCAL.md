# Fase 3 — autenticação local e isolamento por usuário

## Escopo e limite de segurança

Esta fase implementa uma autenticação demonstrativa, totalmente local e isolada
atrás de `AuthService`. Senhas não são armazenadas: o aplicativo persiste apenas
uma derivação PBKDF2-SHA-256 com sal aleatório e 210.000 iterações.

Isso não equivale a autenticação de produção. Como não há servidor confiável,
uma pessoa com acesso ao dispositivo, às ferramentas do navegador ou ao código
da aplicação pode alterar o estado local. A interface informa essa limitação.
Uma integração futura pode substituir os adapters de usuário e sessão por
Supabase Auth sem acoplar as telas ao provedor.

## Armazenamento

- `DetonaConcursosAuthDB`: contas locais e sessões.
- `DetonaConcursosDB__user__<id>`: um banco de progresso completo por usuário.
- `DetonaConcursosDB`: banco legado, mantido intacto como origem de migração.

Separar fisicamente os bancos preserva as chaves e índices atuais e impede que
XP, níveis, rotina, edital, bem-estar, cartas e histórico de questões sejam
consultados por outra conta através do repositório de progresso.

## Migração do legado

No primeiro cadastro, e somente nele, `LegacyDataMigrationService` verifica o
banco legado. Se houver dados e o banco do usuário estiver vazio, cria um
snapshot e o importa no destino. A origem não é apagada. O destino nunca é
sobrescrito se já contiver um jogador, tornando a operação segura e idempotente.
Se não houver legado, o seed normal cria uma jornada nova.

## Fronteiras

- `AuthService`: cadastro, login, restauração e logout.
- `UserRepository`: persistência de contas.
- `SessionService`: sessões opacas restauráveis e com expiração local.
- `ProgressRepository`: único acesso das telas aos dados de progresso.
- `LegacyDataMigrationService`: compatibilidade com o banco anterior.

## Evolução futura

O passo seguinte é implementar adapters remotos para identidade e sessão,
definir recuperação/verificação de conta no servidor e criar uma outbox de
sincronização. A senha local não deve ser enviada nem convertida automaticamente
em credencial de produção.
