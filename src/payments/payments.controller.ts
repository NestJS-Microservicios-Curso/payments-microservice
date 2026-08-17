import {
  Body,
  Controller,
  Get,
  Post,
  type RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { type Request, type Response } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-payment-session')
  createPaymentSession(@Body() paymentSessionDto: PaymentSessionDto) {
    return this.paymentsService.createPaymentSession(paymentSessionDto);
  }

  @Get('success')
  success() {
    return this.paymentsService.success();
  }

  @Get('cancel')
  cancel() {
    return this.paymentsService.cancel();
  }

  @Post('webhook')
  async stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    return this.paymentsService.stripeWebhook(request, response);
  }
}
