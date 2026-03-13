import { connect, NatsConnection } from 'nats';

let nc: NatsConnection | null = null;

export async function connectNats(): Promise<NatsConnection> {
  if (nc) return nc;
  nc = await connect({ servers: process.env.NATS_URL || 'nats://127.0.0.1:4222' });
  return nc;
}

export async function publish(subject: string, payload: any) {
  const conn = await connectNats();
  conn.publish(subject, new TextEncoder().encode(JSON.stringify(payload)));
}
