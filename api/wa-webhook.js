import crypto from 'crypto';
import { parse as parseQS } from 'querystring';
import { menu } from '../src/flows/mainMenu.js';
import { handle as flowOpen } from '../src/flows/openTicket.js';
import * as Session from '../src/session.js';

/* --- utils compactos --- */
const readRaw = (r) =>
	new Promise((re, rj) => {
		let d = '';
		r.on('data', (c) => (d += c))
			.on('end', () => re(d))
			.on('error', rj);
	});
const sign = (t, u, p) =>
	crypto
		.createHmac('sha1', t)
		.update(
			u +
				Object.keys(p)
					.sort()
					.map((k) => k + p[k])
					.join(''),
			'utf8',
		)
		.digest('base64');
		
const twiml = (m) => `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${m}</Message></Response>`;

/* --- webhook --- */
export default async function handler(req, res) {
	try {
		if (req.method !== 'POST') {
			res.setHeader('Allow', 'POST');
			return res.status(405).end();
		}

		const proto = req.headers['x-forwarded-proto'] || 'https';
		const host = req.headers['x-forwarded-host'] || req.headers.host;
		const publicUrl = `${proto}://${host}/api/wa-webhook`;

		const raw = await readRaw(req);
		const p = parseQS(raw || '');
		const from = (p.From || '').toString(); // ex.: whatsapp:+5561...
		const body = (p.Body || '').toString().trim();

		/* bypass dev */
		const urlObj = new URL(req.url, `${proto}://${host}`);
		if (urlObj.searchParams.get('skip') === '1') {
			res.setHeader('Content-Type', 'text/xml');
			return res.status(200).send(twiml(`(dev) eco: ${body}`));
		}

		/* valida Twilio */
		const exp = sign(process.env.TWILIO_AUTH_TOKEN, publicUrl, p);
		if (req.headers['x-twilio-signature'] !== exp)
			return res.status(403).send('Invalid signature');

		/* roteamento simples */
		let reply;
		if (/^(1|abrir)/i.test(body) || Session.get(from)?.state) {
			reply = await flowOpen(from, body);
		} else {
			reply = menu();
		}

		res.setHeader('Content-Type', 'text/xml');
		return res.status(200).send(twiml(reply));
	} catch (e) {
		console.error('Webhook ERROR', e);
		return res.status(500).send('Internal error');
	}
}
