import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs } from '../config/envs';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { NATS_SERVICE } from '../config';

@Injectable()
export class PaymentsService {
  // Initialize Stripe with the secret key from environment variables
  private readonly stripe = new Stripe(envs.stripeSecretKey);
  private readonly logger = new Logger('PaymentsService');

  constructor(
    @Inject(NATS_SERVICE)
    private readonly client: ClientProxy,
  ) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { orderId, currency, items } = paymentSessionDto;

    // Create a new Stripe Checkout session and its configured with the necessary parameters for a payment
    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: {
          orderId: orderId,
        },
      },
      line_items: items.map((item) => ({
        price_data: {
          currency: currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100), // Convert to cents: 20.00 USD becomes 2000 cents
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: envs.stripeSuccessUrl, // Redirect URL after successful payment
      cancel_url: envs.stripeCancelUrl, // Redirect URL if the payment is canceled
    });

    // Return the session details including the URLs for success and cancellation,
    // and the session URL for the client to redirect to Stripe's checkout page
    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  async stripeWebhook(data: { rawBody: string; signature: string }) {
    const { rawBody, signature } = data;
    let event: Stripe.Event;
    try {
      // Verify the webhook signature in Base64 to ensure the request is from Stripe and has not been tampered with
      const rawBuffer = Buffer.from(rawBody, 'base64');
      event = this.stripe.webhooks.constructEvent(
        rawBuffer,
        signature,
        envs.webhookSignatureSecret,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      throw new RpcException({
        status: 400,
        message: `Webhook signature verification failed: ${(err as Error).message}`,
      });
    }

    // Handle the event based on its type and emit relevant events to the NATS message broker
    switch (event.type) {
      case 'charge.succeeded': {
        const chargeSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };

        // Emit a message to the NATS message broker indicating that the payment has succeeded
        this.client.emit('payment.succeeded', payload);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPaymentIntent = event.data.object;
        const payload = {
          orderId: failedPaymentIntent.metadata?.orderId,
          errorMessage: failedPaymentIntent.last_payment_error?.message,
        };

        // Emit a message to the NATS message broker indicating that the payment has failed
        this.client.emit('payment.failed', payload);

        this.logger.warn(
          `Payment failed for order: ${failedPaymentIntent.metadata?.orderId}`,
        );
        break;
      }

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
    return { received: true };
  }
}
