# Payments Microservice (`payments-ms`)

A NestJS microservice operating strictly as a private, event-driven worker on **NATS Messaging**. It manages Stripe payment processing, checkout session creation, cryptographic raw body HMAC-SHA256 signature verification, and payment lifecycle event emission.

## Features

- **100% NATS Event-Driven Worker**: Runs without exposing HTTP ports. Receives commands and emits domain events exclusively over NATS.
- **Stripe Checkout Sessions**: Creates secure Stripe Checkout sessions with order metadata, items, unit conversions (cents), and success/cancel URLs.
- **HMAC Webhook Verification via Base64**: Reconstructs original raw byte buffers from Base64 payloads forwarded by the API Gateway to safely verify `stripe-signature` headers without packet corruption.
- **Event-Driven Lifecycle**: Emits `payment.succeeded` and `payment.failed` domain events to NATS for asynchronous order fulfillment and saga compensation in `orders-ms`.
- **Environment Validation**: Validates secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNATURE_SECRET`, `NATS_SERVERS`) with `joi`.

---

## Environment Variables

Copy `.env.template` to `.env` and set your configuration variables:

```bash
cp .env.template .env
```

| Variable                          | Description                                                     | Example Value                                |
| :-------------------------------- | :-------------------------------------------------------------- | :------------------------------------------- |
| `STRIPE_SECRET_KEY`               | Stripe Secret API Key                                           | `sk_test_...`                                |
| `STRIPE_SUCCESS_URL`              | Redirect URL after successful payment (pointing to Gateway)     | `http://localhost:3000/api/payments/success` |
| `STRIPE_CANCEL_URL`               | Redirect URL when payment is canceled (pointing to Gateway)     | `http://localhost:3000/api/payments/cancel`  |
| `STRIPE_WEBHOOK_SIGNATURE_SECRET` | Secret key used to verify Stripe webhook signature authenticity | `whsec_...`                                  |
| `NATS_SERVERS`                    | Comma-separated list of NATS broker URLs                        | `nats://localhost:4222`                      |

---

## NATS Communication Contracts

`payments-ms` communicates exclusively via NATS.

### Request-Reply Patterns (`@MessagePattern`)

| Pattern                  | Payload                                                                     | Response                                                 | Description                                                               |
| :----------------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------- | :------------------------------------------------------------------------ |
| `create.payment.session` | `PaymentSessionDto` (`{ orderId: string, currency: string, items: [...] }`) | `{ cancelUrl: string, successUrl: string, url: string }` | Creates Stripe Checkout session and returns the checkout URL              |
| `verify.stripe.webhook`  | `{ rawBody: string (base64), signature: string }`                           | `{ received: boolean }`                                  | Verifies cryptographic HMAC-SHA256 signature and triggers internal events |

### Events Emitted (`@EventPattern` / `client.emit`)

| Event Topic         | Payload                                                            | Handled By  | Action                                               |
| :------------------ | :----------------------------------------------------------------- | :---------- | :--------------------------------------------------- |
| `payment.succeeded` | `{ stripePaymentId: string, orderId: string, receiptUrl: string }` | `orders-ms` | Marks order as `PAID` and creates `OrderReceipt`     |
| `payment.failed`    | `{ orderId: string, reason: string }`                              | `orders-ms` | Marks order as `CANCELLED` and triggers compensation |

---

## Running the Microservice

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod
```

---

## Tech Stack

- **Framework**: [NestJS](https://nestjs.com/) (NATS Microservice Transport)
- **Payment Provider**: [Stripe SDK](https://stripe.com/)
- **Validation**: `class-validator` & `class-transformer`
- **Configuration & Validation**: `dotenv` & [Joi](https://joi.dev/)
