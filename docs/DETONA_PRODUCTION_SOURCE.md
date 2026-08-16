# Fonte canônica de produção do DETONA

Auditoria concluída em 16 de agosto de 2026.

| Item | Fonte oficial |
| --- | --- |
| Produto | DETONA CONCURSOS APP |
| Repositório | `minfu-art/DETONA-Atualizacao-de-19-07` |
| Aplicação de produção | `https://app.detonaconcursos.com` |
| Branch canônica | `main` |
| Commit auditado em produção | `aaec1f732899455cc69d8648d4bc010312213791` |
| Commit auditado em `origin/main` | `aaec1f732899455cc69d8648d4bc010312213791` |
| Projeto Vercel | `detona-staging` (equipe `min-fu-projetos`) |
| Deployment Vercel auditado | `EDqe6TwTvKkmYcjsfgxqLCjwv4oy` |

## Conclusão da auditoria

O deployment de produção e `origin/main` apontavam para o mesmo SHA no momento da auditoria. Portanto, `main` é a única base canônica para trabalho novo. Não foi necessária reconciliação de histórico.

Branches de PC BA e de banco de questões contêm trabalho útil ainda não integrado. Elas devem ser comparadas e aproveitadas seletivamente, nunca mescladas às cegas. O curso PC AL e os cursos já ativos não podem ser removidos nem substituídos durante esse aproveitamento.

## Fluxo obrigatório

1. Atualizar `main` a partir de `origin/main`.
2. Criar uma branch de trabalho a partir desse `main` atualizado.
3. Fazer commit e push somente na branch de trabalho.
4. Validar testes e o Preview da Vercel.
5. Só mesclar ou promover para produção após aprovação explícita.

A única frase válida para autorizar produção é:

> APROVADO PARA PRODUÇÃO

Qualquer outra confirmação serve apenas para continuar em branch ou Preview e não autoriza publicação em produção.

> Nenhuma nova tarefa do Codex deve ser iniciada utilizando apenas o estado da pasta local como referência. Antes de trabalhar, executar fetch e confirmar que a branch foi criada a partir da main remota canônica.
