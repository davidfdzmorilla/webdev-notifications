import { connect, NatsConnection, JetStreamManager, JetStreamClient } from 'nats';

let natsConnection: NatsConnection | null = null;
let jsm: JetStreamManager | null = null;
let js: JetStreamClient | null = null;

export async function getNatsConnection(): Promise<NatsConnection> {
  if (natsConnection) return natsConnection;

  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  natsConnection = await connect({ servers: natsUrl });
  console.log(`Connected to NATS at ${natsUrl}`);

  return natsConnection;
}

export async function getJetStreamManager(): Promise<JetStreamManager> {
  if (jsm) return jsm;

  const nc = await getNatsConnection();
  jsm = await nc.jetstreamManager();

  return jsm;
}

export async function getJetStream(): Promise<JetStreamClient> {
  if (js) return js;

  const nc = await getNatsConnection();
  js = nc.jetstream();

  return js;
}

export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.close();
    natsConnection = null;
    jsm = null;
    js = null;
    console.log('NATS connection closed');
  }
}
