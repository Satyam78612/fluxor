import express from 'express';
import bodyParser from 'body-parser';
import { MongoClient } from 'mongodb';
import Joi from 'joi';
import { connect as natsConnect, NatsConnection } from 'nats';
// require publisher dynamically to avoid ESM resolution differences in ts-node-dev

const app = express();
app.use(bodyParser.json());

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const client = new MongoClient(mongoUri);
let intentsCollection: any;
let natsConn: NatsConnection | null = null;

const intentSchema = Joi.object({
  userId: Joi.string().required(),
  fromToken: Joi.string().required(),
  toToken: Joi.string().required(),
  amount: Joi.number().required(),
  chainId: Joi.number().required(),
});

app.post('/api/intents', async (req, res) => {
  try {
    const { error, value } = intentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const result = await intentsCollection.insertOne({
      ...value,
      status: 'queued',
      createdAt: new Date(),
    });

    const intentId = result.insertedId.toString();

    // publish to NATS
    try {
      if (!natsConn) throw new Error('nats not connected');
      natsConn.publish('intent.created', new TextEncoder().encode(JSON.stringify({ intentId })));
    } catch (e) {
      console.error('Failed to publish to NATS', e);
      return res.status(500).json({ error: 'failed_to_publish' });
    }

    res.json({ status: 'queued', intentId });
  } catch (err: any) {
    console.error('Failed to create intent', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/execute', async (req, res) => {
  // TODO: receive signed payload, forward to execution orchestrator
  res.json({ status: 'accepted' });
});

async function start() {
  await client.connect();
  const db = client.db('fluxor');
  intentsCollection = db.collection('intents');
  natsConn = await natsConnect({ servers: process.env.NATS_URL || 'nats://127.0.0.1:4222' });
  app.listen(3000, () => console.log('Intent API listening on 3000'));
}

start().catch((e) => {
  console.error('Failed to start Intent API', e);
  process.exit(1);
});
