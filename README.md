# Payments Microservice (`payments-ms`)

A NestJS microservice that manages Stripe payment processing, checkout session creation, webhook event verification, and payment lifecycle callbacks.

## Features

- **Stripe Checkout Integration**: Creates secure Stripe Checkout sessions with order metadata, items, currency conversion to cents, and redirect URLs (`STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL`).
- **Webhook Processing & Security**: Validates incoming Stripe webhook signatures (`stripe-signature`) using raw body parsing to securely handle events (`charge.succeeded`, `payment_intent.payment_failed`, etc.).
- **Environment Configuration**: Robust environment variable schema validation using `joi`.
- **Strict Validation**: DTO validation with `class-validator` and `class-transformer`.

---

## Environment Variables

Copy `.env.template` to `.env` and set your configuration variables:

```bash
cp .env.template .env
```

Default variables:

| Variable                          | Description                                                     | Default / Example Value                  |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `PORT`                            | Microservice HTTP Port                                          | `3003`                                   |
| `STRIPE_SECRET_KEY`               | Stripe Secret API Key                                           | `sk_test_...`                            |
| `STRIPE_SUCCESS_URL`              | Redirect URL after successful payment                           | `http://localhost:3003/payments/success` |
| `STRIPE_CANCEL_URL`               | Redirect URL when payment is canceled                           | `http://localhost:3003/payments/cancel`  |
| `STRIPE_WEBHOOK_SIGNATURE_SECRET` | Secret key used to verify Stripe webhook signature authenticity | `whsec_...`                              |

---

## Credentials Setup (Stripe & Hookdeck)

### 1. Stripe Secret Key (`STRIPE_SECRET_KEY`)

1. Navigate to your [Stripe Dashboard API Keys](https://dashboard.stripe.com/test/apikeys).
2. Reveal and copy your **Secret key** (`sk_test_...`).
3. Set the value in your `.env` as `STRIPE_SECRET_KEY`.

### 2. Stripe Webhook Signature Secret (`STRIPE_WEBHOOK_SIGNATURE_SECRET`)

You can forward webhook events to your local environment using either **Hookdeck** or **Stripe CLI**:

#### Option A: Using Hookdeck (Recommended for Webhook Routing)

1. Go to the [Hookdeck Dashboard Connections](https://dashboard.hookdeck.com/connections).
2. Configure a connection with your Stripe Webhook Source or create a webhook endpoint in [Stripe Workbench Webhooks](https://dashboard.stripe.com/test/workbench/webhooks) pointing to your Hookdeck URL.
3. Retrieve your webhook signing secret (`whsec_...`) and set it as `STRIPE_WEBHOOK_SIGNATURE_SECRET` in `.env`.

#### Option B: Using Stripe CLI

1. Run the Stripe CLI forwarder:

    ```bash
      stripe listen --forward-to localhost:3003/payments/webhook
    ```

2. Copy the `whsec_...` signing secret printed in your terminal and set it as `STRIPE_WEBHOOK_SIGNATURE_SECRET` in `.env`.

---

## Webhook Forwarding in Development

To receive Stripe webhook events locally on your machine, keep a forwarder running in the background:

### Using Hookdeck CLI

```bash
# Listen and forward webhook events to the local endpoint
hookdeck listen 3003 payments/webhook
```

### Using Stripe CLI

```bash
# Listen and forward webhook events to the local endpoint
stripe listen --forward-to localhost:3003/payments/webhook
```

---

## Installation & Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.template .env
   # Populate STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SIGNATURE_SECRET
   ```

3. **Start the Webhook Forwarder** (Hookdeck / Stripe CLI in a separate terminal).

---

## Running the Microservice

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod
```

---

## REST API Endpoints

All endpoints are exposed under `/payments`.

| Method | Endpoint                           | Body Payload / Headers                                                                            | Description                                                                              |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST` | `/payments/create-payment-session` | `PaymentSessionDto` (`{ orderId: string, currency: string, items: [{ name, price, quantity }] }`) | Creates a Stripe Checkout session and returns `{ url: session.url }`                     |
| `GET`  | `/payments/success`                | -                                                                                                 | Success redirect landing page/endpoint                                                   |
| `GET`  | `/payments/cancel`                 | -                                                                                                 | Cancel redirect landing page/endpoint                                                    |
| `POST` | `/payments/webhook`                | Raw Body + Header `stripe-signature`                                                              | Validates Stripe webhook event signatures and processes payment confirmations / failures |

---

## Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Payment Provider**: [Stripe SDK](https://stripe.com/)
- **Webhook Forwarding**: [Hookdeck](https://hookdeck.com/) / [Stripe CLI](https://stripe.com/docs/stripe-cli)
- **Validation**: `class-validator` & `class-transformer`
- **Configuration & Validation**: `dotenv` & [Joi](https://joi.dev/)
