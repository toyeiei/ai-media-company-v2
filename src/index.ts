import nacl from 'tweetnacl';
import { ContentWorkflow } from './workflow';
import type { Env } from './env';
import { DiscordSlashHandler } from './discord-slash';
import type { DiscordInteraction } from './discord-slash';

function hexToBytes(hex: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

function verifyRequest(publicKey: string, signature: string, timestamp: string, body: string): boolean {
  try {
    const msg = new TextEncoder().encode(timestamp + body);
    return nacl.sign.detached.verify(msg, hexToBytes(signature), hexToBytes(publicKey));
  } catch {
    return false;
  }
}

export { ContentWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: Date.now() });
    }

    if (url.pathname === '/discord' && request.method === 'GET') {
      return Response.json({ error: 'Discord endpoint active' });
    }

    if (url.pathname === '/discord' && request.method === 'POST') {
      const rawBody = await request.text();
      const body = JSON.parse(rawBody) as DiscordInteraction;

      const sig = request.headers.get('X-Signature-Ed25519') || '';
      const ts = request.headers.get('X-Signature-Timestamp') || '';

      // Verify signature FIRST - even PING requests need verification during URL validation
      if (!sig || !ts) return new Response('Missing signature', { status: 401 });
      if (!verifyRequest(env.DISCORD_PUBLIC_KEY, sig, ts, rawBody)) return new Response('Invalid signature', { status: 401 });

      // PING is used for URL verification
      if (body.type === 1) return new Response('{"type":1}', {
        headers: { 'Content-Type': 'application/json' }
      });

      const handler = new DiscordSlashHandler(env);

      if (body.type === 2) return Response.json(await handler.handleInteraction(body));
      if (body.type === 3) return Response.json(await handler.handleButton(body));

      return Response.json({ error: 'Unsupported' }, { status: 400 });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env, undefined>;
