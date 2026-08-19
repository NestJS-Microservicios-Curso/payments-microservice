import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config/envs';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  // Creating a logger instance to log messages related to the payments microservice
  const logger = new Logger('Payments-Microservice-Main');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.NATS, // Using NATS as the transport layer for microservices communication
      options: {
        servers: envs.natsServers,
      },
    },
  );

  // Setting up global validation pipes to automatically validate incoming requests based on DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen();

  logger.log(`Payments Microservice is running on port ${envs.port}`);
}
void bootstrap();
