# Bundle de curso DETONA — versão 1

Esta pasta é o modelo oficial para cadastrar um concurso por dados, sem alterar o motor acadêmico.

## 1. Arquivos que você deve fornecer

Copie os arquivos `.example.json`, remova `.example` dos nomes e crie:

```text
meu-curso/
  contest.json
  curriculum.json
  questions/
    lote_001.json
  assets/
    battle-avatar.png
    success.png
    error.png
    attention.png
    cover.webp
```

`contest.json`, `curriculum.json` e o avatar principal são obrigatórios. A pasta de questões pode ficar vazia. Reações e capa são opcionais.

O avatar e as reações devem ser PNG ou WebP com transparência. A capa pode ser opaca. Cada arquivo pode ter no máximo 8 MB e deve usar nome simples, sem espaços ou caracteres especiais.

## 2. Campos que precisam ser preenchidos

Em `contest.json`, informe somente dados oficiais:

- identificador técnico, código e slug;
- nome do concurso;
- cargo;
- descrição;
- data da prova, se conhecida;
- cores.

Não invente preço, data, cargo, órgão ou disponibilidade. Quando não houver informação, mantenha:

- `exam_date: null`;
- `price_cents: 0`;
- `content_status: "preparing"`;
- `sales_status: "unavailable"`.

Use um `operation_id` novo e único para cada novo bundle. O mesmo identificador não pode representar conteúdos diferentes.

Em `curriculum.json`, o `contest_id` deve ser igual ao ID do manifesto. A hierarquia obrigatória é:

`cargo → disciplina → tópico → subtópico`

Cada ID deve ser único dentro do currículo. As questões só podem apontar para subtópicos desse arquivo.

## 3. Como pedir ao Codex para validar

Entregue a pasta do bundle e peça:

> Valide este bundle com o DETONA Course Provisioner somente no staging. Não aplique nada.

Ou execute localmente, com uma sessão developer temporária configurada:

```powershell
npm run course:provision -- --bundle "C:\caminho\meu-curso" --environment staging --mode validate
```

O resultado correto é `COURSE_PROVISION_VALID`. Leia concurso, contagens, hashes, conflitos, avisos e operações previstas.

## 4. Como autorizar a importação

Somente depois de revisar o relatório de validação, autorize explicitamente o `apply`:

```powershell
npm run course:provision -- --bundle "C:\caminho\meu-curso" --environment staging --mode apply
```

O provisionador exige que o mesmo bundle tenha sido validado antes. Ele usa apenas Edge Functions protegidas e importa currículo e questões como rascunho.

Se um currículo em rascunho já existir e precisar ser substituído, revise as diferenças e use `--allow-replace-draft`. Currículo ligado a pacote publicado nunca é substituído.

Para publicar somente a aparência durante o provisionamento, é necessária autorização adicional com `--publish-appearance`. O padrão é manter a aparência em rascunho.

## 5. Como conferir no Painel

Abra o Painel Central de staging e confirme:

1. concurso em Geral;
2. árvore em Currículo;
3. lotes e questões em estado `draft`;
4. avatar e assets em Aparência;
5. nenhum pacote novo em Publicação;
6. nenhum aluno recebeu acesso.

Também é possível comparar o bundle sem gravar:

```powershell
npm run course:provision -- --bundle "C:\caminho\meu-curso" --environment staging --mode verify
```

## 6. Como publicar

O provisionador não publica pacotes. No Painel Central:

1. revise e aprove as questões;
2. gere o snapshot editorial;
3. confira o checklist;
4. gere o pacote imutável;
5. revise a prévia;
6. publique usando a confirmação exibida.

## 7. Como retirar do ar

Use a aba Publicação do Painel Central e escolha **Retirar do ar**. Essa ação preserva pacote, hash, progresso e acessos, permitindo restauração posterior.

## Autenticação local

Nunca coloque credenciais dentro do bundle ou do repositório. Configure somente variáveis de ambiente da sessão:

- `DETONA_SUPABASE_URL`;
- `DETONA_SUPABASE_ANON_KEY`;
- `DETONA_ADMIN_ACCESS_TOKEN`; ou, temporariamente, `DETONA_ADMIN_EMAIL` e `DETONA_ADMIN_PASSWORD`;
- opcionalmente `DETONA_ADMIN_ORIGIN`.

Tokens e senhas não são impressos nem gravados no journal.
