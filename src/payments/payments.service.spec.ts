/**
 * Unit tests for PaymentsService.
 *
 * Both `../config/envs` and `stripe` are mocked to avoid real network calls
 * and to prevent the Joi env-validation from running (which requires
 * STRIPE_SECRET_KEY and other env vars to be present).
 */

// --- Module mocks (must be declared before any import that would trigger them) ---

jest.mock('../config/envs', () => ({
  envs: {
    port: 3000,
    stripeSecretKey: 'sk_test_mock',
    stripeSuccessUrl: 'http://localhost/success',
    stripeCancelUrl: 'http://localhost/cancel',
    webhookSignatureSecret: 'whsec_mock',
    natsServers: ['nats://localhost:4222'],
  },
}));

jest.mock('stripe');

// --- Imports (after mocks are registered) ---

import { RpcException } from '@nestjs/microservices';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';

// ────────────────────────────────────────────────────────────────────────────

const mockStripeInstance = {
  checkout: {
    sessions: {
      create: jest.fn() as jest.Mock,
    },
  },
  webhooks: {
    constructEvent: jest.fn() as jest.Mock,
  },
};

// Make `new Stripe(...)` return our mock instance
(Stripe as unknown as jest.Mock).mockImplementation(() => mockStripeInstance);

// ────────────────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  const mockClient = { emit: jest.fn() as jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // PaymentsService constructor: new Stripe(key) is called at property
    // initialisation, which is covered by the mock above.
    service = new PaymentsService(mockClient as any);
  });

  // ── createPaymentSession ──────────────────────────────────────────────────

  describe('createPaymentSession', () => {
    it('returns the Stripe session URLs', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        cancel_url: 'http://localhost/cancel',
        success_url: 'http://localhost/success',
        url: 'https://checkout.stripe.com/pay/test',
      });

      const result = await service.createPaymentSession({
        orderId: 'order-uuid-123',
        currency: 'usd',
        items: [{ name: 'Widget', price: 10.0, quantity: 2 }],
      });

      expect(result).toEqual({
        cancelUrl: 'http://localhost/cancel',
        successUrl: 'http://localhost/success',
        url: 'https://checkout.stripe.com/pay/test',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          payment_intent_data: { metadata: { orderId: 'order-uuid-123' } },
        }),
      );
    });

    it('converts item prices to cents (integer)', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        cancel_url: '',
        success_url: '',
        url: '',
      });

      await service.createPaymentSession({
        orderId: 'order-2',
        currency: 'eur',
        items: [{ name: 'Item', price: 9.99, quantity: 1 }],
      });

      const callArg = mockStripeInstance.checkout.sessions.create.mock
        .calls[0][0] as Stripe.Checkout.SessionCreateParams;

      const lineItem = callArg
        .line_items![0] as Stripe.Checkout.SessionCreateParams.LineItem;
      expect(
        (
          lineItem.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData
        ).unit_amount,
      ).toBe(999);
    });
  });

  // ── stripeWebhook ─────────────────────────────────────────────────────────

  describe('stripeWebhook', () => {
    it('emits payment.succeeded and returns { received: true } on charge.succeeded', async () => {
      const fakeEvent = {
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_test_123',
            metadata: { orderId: 'order-abc' },
            receipt_url: 'https://receipt.url',
          },
        },
      } as unknown as Stripe.Event;

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const rawBody = Buffer.from('{}').toString('base64');
      const result = await service.stripeWebhook({
        rawBody,
        signature: 'sig_test',
      });

      expect(result).toEqual({ received: true });
      expect(mockClient.emit).toHaveBeenCalledWith('payment.succeeded', {
        stripePaymentId: 'ch_test_123',
        orderId: 'order-abc',
        receiptUrl: 'https://receipt.url',
      });
    });

    it('emits payment.failed on payment_intent.payment_failed', async () => {
      const fakeEvent = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            metadata: { orderId: 'order-fail' },
            last_payment_error: { message: 'Card declined' },
          },
        },
      } as unknown as Stripe.Event;

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const result = await service.stripeWebhook({
        rawBody: Buffer.from('{}').toString('base64'),
        signature: 'sig_fail',
      });

      expect(result).toEqual({ received: true });
      expect(mockClient.emit).toHaveBeenCalledWith('payment.failed', {
        orderId: 'order-fail',
        errorMessage: 'Card declined',
      });
    });

    it('throws an RpcException when webhook signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature mismatch');
      });

      await expect(
        service.stripeWebhook({
          rawBody: Buffer.from('bad').toString('base64'),
          signature: 'bad_sig',
        }),
      ).rejects.toThrow(RpcException);
    });

    it('returns { received: true } for unhandled event types', async () => {
      const fakeEvent = {
        type: 'customer.created',
        data: { object: {} },
      } as unknown as Stripe.Event;

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const result = await service.stripeWebhook({
        rawBody: Buffer.from('{}').toString('base64'),
        signature: 'sig_unhandled',
      });

      expect(result).toEqual({ received: true });
      expect(mockClient.emit).not.toHaveBeenCalled();
    });
  });
});
