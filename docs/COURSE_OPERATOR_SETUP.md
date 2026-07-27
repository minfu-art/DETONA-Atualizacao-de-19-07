# Configuração do Operador de Cursos DETONA

## Componentes

```text
GPT privado
  → Action OpenAPI autenticada
  → detona-course-provisioner
  → admin-contests / admin-editorial / admin-media
  → Supabase detona-staging
```

A função externa nunca recebe `service_role`. Ela valida a sessão Supabase e exige `profiles.role = developer`. As funções administrativas existentes continuam responsáveis pelas escritas de domínio.

## Configuração manual no editor do GPT

1. Crie um GPT privado chamado **Operador de Cursos DETONA**.
2. Cole o conteúdo de `detona-course-operator-gpt-instructions.md` em Instruções.
3. Envie os arquivos de `docs/course-operator-knowledge/` como Conhecimento.
4. Em Actions, importe `detona-course-provisioner-openapi.yaml`.
5. Configure autenticação do tipo **Bearer** com uma sessão temporária Supabase pertencente a um perfil `developer`.
6. Nunca envie `service_role`, senha ou refresh token.
7. Teste primeiro `verify_course_bundle`; depois teste `validate_course_bundle` com fixture local.
8. Não teste `apply` com PP RN ou concurso fictício no staging.

A documentação oficial da OpenAI informa que GPT Actions exigem autenticação e schema OpenAPI; o editor aceita chave de API Bearer ou OAuth. Esta primeira versão usa Bearer temporário. Quando houver um provedor OAuth administrativo estável, migre para OAuth para evitar renovação manual da sessão.

## Arquivos e Base64

Assets chegam no campo `content_base64`. PNG e WebP têm limite de 8 MB no provisionador. O GPT deve transformar apenas o arquivo fornecido pelo proprietário; nunca gerar ou substituir arte sem solicitação.

## Confirmação humana

`validate_course_bundle` devolve um token válido por 15 minutos e uma frase em `required_confirmation`. O token é armazenado somente como SHA-256, é vinculado ao hash do bundle e pode ser consumido uma vez.

## Operação e recuperação

O journal privado registra:

- `validated`;
- `applying`;
- `completed`;
- `failed`;
- passos concluídos;
- relatório sanitizado.

Após falha, valide novamente o mesmo bundle para obter novo token. O apply relê o estado remoto e reaproveita apenas conteúdo idêntico. Divergências são bloqueadas.

## Restrições

- endpoint fixo de staging;
- produção não existe no OpenAPI;
- sem publicação;
- sem entitlement;
- sem exclusão;
- sem acesso direto às tabelas;
- CORS de navegador restrito;
- chamadas server-to-server exigem JWT;
- rate limit de 20 requisições por minuto por developer.

Referência oficial: https://help.openai.com/en/articles/9442513
