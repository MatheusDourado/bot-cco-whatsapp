import crypto from 'crypto';
import { parse as parseQS } from 'querystring';

/* ---- utils ---- */
const readRaw = (req) =>
	new Promise((res, rej) => {
		let d = '';
		req.on('data', (c) => (d += c));
		req.on('end', () => res(d));
		req.on('error', rej);
	});
const sign = (token, url, params) => {
	const sorted = Object.keys(params)
		.sort()
		.map((k) => k + params[k])
		.join('');
	return crypto
		.createHmac('sha1', token)
		.update(url + sorted, 'utf8')
		.digest('base64');
};
const twiml = (msg) =>
	`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`;

/* timestamp SP sem Intl */
function stampSP(now = new Date()) {
	const d = new Date(now.getTime() - 3 * 3600 * 1000); // UTC-3
	const p = (n) => String(n).padStart(2, '0');
	return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
		d.getHours(),
	)}:${p(d.getMinutes())}:${p(d.getSeconds())} GMT-3`;
}

export default async function handler(req, res) {
	try {
		if (req.method !== 'POST') {
			res.setHeader('Allow', 'POST');
			return res.status(405).end();
		}

		const proto = req.headers['x-forwarded-proto'] || 'https';
		const host = req.headers['x-forwarded-host'] || req.headers.host;
		const publicUrl = `${proto}://${host}/api/wa-webhook`;

		// ---- bypass DEV por query/header/env ----
		const urlObj = new URL(req.url, `${proto}://${host}`);
		const devSkip =
			urlObj.searchParams.get('skip') === '1' ||
			req.headers['x-dev-skip'] === '1' ||
			process.env.TWILIO_SKIP_VERIFY === 'true';

		const raw = await readRaw(req);
		const params = parseQS(raw || '');
		const body = (params.Body || '').toString().trim();

		if (devSkip) {
			const reply = `Recebido em ${stampSP()}. Você disse: "${
				body || '—'
			}" ✅`;
			console.log('DEV inbound (skip):', { body });
			res.setHeader('Content-Type', 'text/xml');
			return res.status(200).send(twiml(reply));
		}

		// ---- produção: valida assinatura Twilio ----
		const token = process.env.TWILIO_AUTH_TOKEN;
		if (!token) return res.status(500).send('Missing TWILIO_AUTH_TOKEN');

		const signature = req.headers['x-twilio-signature'] || '';
		const expected = sign(token, publicUrl, params);
		if (signature !== expected)
			return res.status(403).send('Invalid signature');

		const reply = `Recebido em ${stampSP()}. Você disse: "${
			body || '—'
		}" ✅`;
		res.setHeader('Content-Type', 'text/xml');
		return res.status(200).send(twiml(reply));
	} catch (err) {
		console.error('Webhook ERROR:', {
			msg: err?.message,
			stack: err?.stack,
		});
		return res.status(500).send('Internal error');
	}
}
