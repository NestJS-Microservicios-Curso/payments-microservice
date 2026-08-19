import {
  Inject,
  Injectable,
  Logger,
  type RawBodyRequest,
} from '@nestjs/common';
import { envs } from '../config/envs';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import type { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';
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

  success() {
    return { message: 'Payment successful' };
  }

  cancel() {
    return { message: 'Payment canceled' };
  }

  async webhook() {
    return { message: 'Webhook received' };
  }

  async stripeWebhook(request: RawBodyRequest<Request>, response: Response) {
    const signature = request.headers['stripe-signature'];
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        request.rawBody as Buffer,
        signature as string,
        envs.webhookSignatureSecret,
      );
    } catch (err: unknown) {
      console.log(
        `Webhook signature verification failed.`,
        (err as Error).message,
      );
      return response.sendStatus(400);
    }

    // Handle the event
    switch (event.type) {
      case 'charge.succeeded': {
        const chargeSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };

        // Emit the payment succeeded event to NATS, which will be handled by the orders microservice
        this.client.emit('payment.succeeded', payload);

        this.success();
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPaymentIntent = event.data.object;
        console.log('Payment failed:', failedPaymentIntent.metadata);
        this.cancel();
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
        this.cancel();
    }

    // Return a response to acknowledge receipt of the event
    response.json({ received: true });
  }
}
