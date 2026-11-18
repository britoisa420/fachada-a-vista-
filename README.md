# Fachada em Vista · Delta

Simulador de fachadas: o lojista envia a foto da loja e paga. A equipe da Delta monta as propostas, publica tudo pelo painel e entrega um link privado ao cliente.

## Rodar

```bash
npm install
npm start            # http://localhost:3000
```

Requer Node 22.13 ou mais novo, porque usa o SQLite embutido (`node:sqlite`).

- Painel: `/painel`. Na primeira execução, o acesso é **equipe@delta.local / delta-demo-2026**. Troque a senha em Configurações ou defina `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
- Teste ponta a ponta: `python3 tests/make-fixtures.py tests/fixtures && npm run test:e2e`. São 70 verificações, feitas no Chromium com Playwright.

## Rotas principais

| Quem | Rota | O que faz |
|---|---|---|
| Público | `/` | Página de vendas, com antes e depois interativo (toque e teclado) |
| Público | `/simular` | Pedido avulso, com anexos e prévia, depois `/pedido/:id?t=…` e checkout |
| Público | `/pacote` | Compra do pacote, depois `/pacote/:token` (saldo e briefings) |
| Público | `/pagamento/retorno` | Mostra "Aguardando confirmação" e consulta o status no servidor |
| Cliente | `/e/:token` | Entrega privada: favorita, ajuste, downloads e compartilhamento |
| Equipe | `/painel` | Pedidos por status, propostas, publicação, WhatsApp, links e pacotes |
| Provedor | `POST /webhooks/mercadopago` | Confirmação automática do pagamento |

## O que está em modo demonstração e o que conectar

| Item | Estado atual | Para receber pedidos reais |
|---|---|---|
| **Pagamento** | Checkout **de demonstração** (nada é cobrado) | Em Configurações › Pagamento, escolha **Mercado Pago** e defina `MP_ACCESS_TOKEN` (e, de preferência, `MP_WEBHOOK_SECRET`) no servidor. Cadastre o webhook mostrado no painel. Outra opção é **Link de pagamento** de qualquer provedor, com confirmação manual no painel. |
| **Banco de dados** | SQLite real, salvo em `DATA_DIR/app.db` | Hospede com **disco persistente** e faça backup de `DATA_DIR`. |
| **Armazenamento de fotos** | Disco local privado (`DATA_DIR/uploads`), servido só com login ou token | O mesmo disco persistente. Para escalar, troque por um bucket privado (S3/R2). |
| **Endereço público** | Usa o host da requisição | Preencha "Endereço público" no painel ou `PUBLIC_URL` (precisa de HTTPS). |
| **Acesso ao painel** | Senha de demonstração | Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes do primeiro start, ou troque a senha no painel. |
| **Avisos por e-mail** | Não implementado | O aviso ao cliente é feito pelo botão de WhatsApp do painel. Para e-mail automático, conecte um serviço como Resend, SES ou SMTP. |

Veja `.env.example`.

## Segurança e consistência

- Os anexos são validados pelo conteúdo real do arquivo (JPG, PNG, WEBP; SVG e PDF só para logo), com limite de tamanho e resolução mínima. Ficam fora da pasta pública.
- Os links de entrega usam tokens de 192 bits, não são indexados e podem ser revogados e regerados pelo painel.
- O painel exige login (cookie HttpOnly e SameSite), checa a origem dos POSTs e limita as tentativas de login.
- Cada formulário tem uma chave de idempotência, então envios repetidos não duplicam pedidos, pacotes, briefings nem propostas. O checkout é reaproveitado. Cada pagamento é registrado uma única vez (provedor + id). Os créditos são descontados dentro de uma transação, e o saldo nunca fica negativo.
- O retorno do checkout nunca confirma o pagamento. A confirmação só vem do webhook, da consulta ao provedor ou do registro manual no painel.
