# Fase 10B — fundação comercial

O DETONA usa Mercado Pago Checkout Pro por redirecionamento. O navegador envia somente o concurso e uma chave idempotente. Preço, moeda e disponibilidade são lidos novamente no servidor.

O retorno do navegador nunca concede acesso. A Edge Function `commercial-webhook` valida a assinatura HMAC, consulta o pagamento diretamente no Mercado Pago e chama a função transacional `apply_verified_commerce_payment`. Somente o estado `approved` cria ou reativa o entitlement.

Pedidos concorrentes do mesmo aluno e concurso são serializados no PostgreSQL. Existe somente um pedido `pending` válido, e um lease recuperável determina qual chamada cria a preferência; as demais aguardam e reutilizam a mesma URL. Pedidos expirados ou sem preferência há mais de cinco minutos deixam de bloquear uma tentativa nova.

## Configuração de staging (não versionar valores)

Segredos das Edge Functions:

- `MERCADO_PAGO_ACCESS_TOKEN` — credencial de teste;
- `MERCADO_PAGO_WEBHOOK_SECRET` — assinatura secreta do webhook de teste;
- `CHECKOUT_MODE=test`;
- `CHECKOUT_RETURN_BASE_URL` — URL HTTPS do Preview de staging;
- `CHECKOUT_WEBHOOK_URL` — URL da função `commercial-webhook`;
- `STUDENT_ALLOWED_ORIGINS` — origens autorizadas do app.

Variável pública da Vercel em Preview:

- `CHECKOUT_PROVIDER=mercado_pago`.

Enquanto essa flag estiver `disabled`, a Biblioteca mantém a compra bloqueada. Não colocar access token, assinatura do webhook ou `service_role` na Vercel/browser.

## Homologação de staging

Um pagamento feito com credencial de teste do Mercado Pago não é evidência suficiente, isoladamente, de que a entrega automática por webhook funciona. A homologação deve validar separadamente:

1. Checkout Pro sandbox;
2. simulação de Webhook em **Suas integrações**;
3. consulta server-side do pagamento;
4. atualização do pedido;
5. concessão do entitlement somente após `approved`.

## Política ainda obrigatória antes da produção

Pagamentos `refunded` e `charged_back` ficam registrados, mas não revogam automaticamente o acesso até a política comercial de reembolso ser formalmente aprovada. Produção deve permanecer desativada até homologação do checkout de teste, webhook idempotente, e-mails, domínio, termos e observabilidade.
