/**
 * E2E smoke tests for the payments-microservice.
 *
 * The real AppModule requires env vars (PORT, STRIPE_SECRET_KEY, …) and a
 * live NATS connection. These are not available in a plain `npm run test:e2e`
 * run, so we build a minimal NestJS application that wires only the
 * PaymentsController + a mock PaymentsService to verify the message-pattern
 * handlers exist and delegate correctly.
 */

// Mock envs + Stripe at the very top so no top-level module code runs the
// real Joi validation or instantiates the Stripe SDK.
jest.mock('../src/config/envs', () => ({
  envs: {
    port: 3001,
    stripeSecretKey: 'sk_test_mock',
    stripeSuccessUrl: 'http://localhost/success',
    stripeCancelUrl: 'http://localhost/cancel',
    webhookSignatureSecret: 'whsec_mock',
    natsServers: ['nats://localhost:4222'],
  },
}));
jest.mock('stripe');

import { Test, TestingModule } from '@nestjs/testing';
import { INestMicroservice } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';

import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { NATS_SERVICE } from '../src/config';

// ── mocks ───────────────────────────────────────────────────────────────────

const mockPaymentsService = {
  createPaymentSession: jest.fn().mockResolvedValue({
    cancelUrl: 'http://localhost/cancel',
    successUrl: 'http://localhost/success',
    url: 'https://checkout.stripe.com/pay/test',
  }),
  stripeWebhook: jest.fn().mockResolvedValue({ received: true }),
};

const mockNatsClient = {
  send: jest.fn(),
  emit: jest.fn(),
};

// ── suite ───────────────────────────────────────────────────────────────────

describe('PaymentsController (e2e – isolated)', () => {
  let app: INestMicroservice;
  let controller: PaymentsController;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: NATS_SERVICE, useValue: mockNatsClient },
      ],
    }).compile();

    // Use a TCP microservice so we can resolve it without a real NATS server.
    app = moduleFixture.createNestMicroservice({ transport: Transport.TCP });
    await app.init();

    controller = moduleFixture.get<PaymentsController>(PaymentsController);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createPaymentSession delegates to PaymentsService', async () => {
    const dto = {
      orderId: 'order-1',
      currency: 'usd',
      items: [{ name: 'Widget', price: 10, quantity: 1 }],
    };

    const result = await controller.createPaymentSession(dto as any);

    expect(mockPaymentsService.createPaymentSession).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({
      url: expect.stringContaining('stripe.com'),
    });
  });

  it('stripeWebhook delegates to PaymentsService', async () => {
    const payload = { rawBody: 'base64data', signature: 'sig_test' };

    const result = await controller.stripeWebhook(payload);

    expect(mockPaymentsService.stripeWebhook).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ received: true });
  });
});
