import express, { type Express } from 'express';
import { decryptPii, encryptPii, hashPii, normalizeEmail, normalizePhone } from './utils/crypto.js';
import { requireInternalKey } from './server/internal-auth.js';

const app: Express = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

const internal = express.Router();
internal.use(requireInternalKey);

internal.post('/crypto/encrypt', (req, res) => {
  const { plaintext } = req.body as { plaintext?: unknown };
  if (typeof plaintext !== 'string') {
    res.status(400).json({ success: false, error: 'plaintext is required' });
    return;
  }
  res.json({ success: true, data: { ciphertext: encryptPii(plaintext) } });
});

internal.post('/crypto/decrypt', (req, res) => {
  const { ciphertext } = req.body as { ciphertext?: unknown };
  if (typeof ciphertext !== 'string') {
    res.status(400).json({ success: false, error: 'ciphertext is required' });
    return;
  }
  res.json({ success: true, data: { plaintext: decryptPii(ciphertext) } });
});

internal.post('/crypto/hash', (req, res) => {
  const { value } = req.body as { value?: unknown };
  if (typeof value !== 'string') {
    res.status(400).json({ success: false, error: 'value is required' });
    return;
  }
  res.json({ success: true, data: { hash: hashPii(value) } });
});

internal.post('/normalize/phone', (req, res) => {
  const { phone } = req.body as { phone?: unknown };
  if (typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }
  res.json({ success: true, data: { normalized: normalizePhone(phone) } });
});

internal.post('/normalize/email', (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== 'string') {
    res.status(400).json({ success: false, error: 'email is required' });
    return;
  }
  res.json({ success: true, data: { normalized: normalizeEmail(email) } });
});

app.use(internal);

const port = Number(process.env.PORT ?? 3002);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KvaTor shared service listening on port ${port}`);
  });
}

export default app;
