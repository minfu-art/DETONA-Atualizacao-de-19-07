# Compra confirmada no Meta — primeira integração

O aplicativo guarda a referência do checkout retornada por `commercial-checkout`.
Ao carregar a biblioteca, consulta o pedido pelo cliente Supabase autenticado e
pelos filtros de pedido e proprietário. A política RLS existente continua aplicada.

Somente `approved`, com pagamento identificado, `paid_at`, BRL e valor positivo
inteiro em centavos produz `Purchase`. Preço e estado vêm do servidor; parâmetros
de retorno, posse de curso e cliques não confirmam vendas. Não há envio de nome,
e-mail ou dados de cartão nos parâmetros adicionais do evento. O próprio Pixel
continua sujeito ao comportamento de coleta da Meta e à política de privacidade.

## Ativação no hosting existente

Após publicar esta versão do app, configurar no ambiente de produção:

```
META_PIXEL_ID=2523798991419896
META_PURCHASE_TRACKING_ENABLED=true
```

O gerador de runtime mantém a integração desativada por padrão e em staging/dev.
Não colocar access token do Meta, Mercado Pago ou service-role no navegador.
Esta mudança não altera preços, pagamentos, liberação de curso ou orçamento.

## Validação e limites

- Testes automatizados usam objetos locais e um emissor simulado. Não enviam
  compras fictícias ao Meta nem alteram pedidos reais.
- Conferir no Events Manager uma compra real posterior à ativação e conciliar
  o valor com o pedido pago e Mercado Pago. Não reenviar pedidos antigos de teste.
- O `eventID` é estável por pedido. A marca local reduz repetições no mesmo
  navegador; limpar armazenamento ou usar vários dispositivos pode repetir o
  envio. Não equivale a deduplicação global no servidor.
- Esta é uma integração de navegador, não Conversions API. Depende de retorno
  à biblioteca, carregamento do Pixel e armazenamento. Sem retorno ao app ou
  com bloqueador, o evento pode não chegar. O retorno de `send` confirma apenas
  o encaminhamento ao Pixel, não recebimento ou atribuição pela Meta.
- Só acompanha a última referência de checkout por conta neste navegador,
  por até sete dias. Uma implementação posterior de outbox no servidor será
  necessária para garantir recuperação de todas as compras e retries duráveis.
- Se o pagamento ainda estiver pendente ao voltar, atualizar a biblioteca
  após confirmação permite nova consulta. Não há polling permanente.

Reverter: desabilitar `META_PURCHASE_TRACKING_ENABLED` e republicar o runtime.
