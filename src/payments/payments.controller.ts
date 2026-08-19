import { Controller } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern('create.payment.session') // NATS message pattern for creating a payment session
  createPaymentSession(@Payload() paymentSessionDto: PaymentSessionDto) {
    return this.paymentsService.createPaymentSession(paymentSessionDto);
  }

  @MessagePattern('verify.stripe.webhook')
  stripeWebhook(@Payload() data: { rawBody: string; signature: string }) {
    return this.paymentsService.stripeWebhook(data);
  }
}
