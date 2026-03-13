import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

app.post('/api/execute', async (req, res) => {
  // TODO: verify signature, forward to solver or NATS
  res.json({ status: 'accepted' });
});

app.listen(3010, () => console.log('Execution Orchestrator listening on 3010'));
