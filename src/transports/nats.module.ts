import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs, NATS_SERVICE } from '../config';

// Creating a dynamic module to register the NATS microservice client with the specified configuration
const natsConfigModule: DynamicModule = ClientsModule.register([
  {
    name: NATS_SERVICE, // Name of the microservice client, used to identify the client when injecting it into other parts of the application
    transport: Transport.NATS, // Using NATS transport, the communication channel between the gateway and the microservice will be NATS
    options: {
      servers: envs.natsServers,
    },
  },
]);

@Module({
  imports: [natsConfigModule],
  exports: [natsConfigModule],
})
export class NatsModule {}
