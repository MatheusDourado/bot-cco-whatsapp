const BASE = process.env.CITSMART_BASE; 
const PROVIDER_BASE = process.env.CITSMART_PROVIDER_BASE; 

/* === DEBUG === */
const DEBUG = (process.env.DEBUG_LOGS || '').toLowerCase() === 'true';
const log = (...a) => DEBUG && console.log('[citsmart]', ...a);
const maskToken = (t = '') =>
	t.length <= 16 ? t : `${t.slice(0, 16)}…${t.slice(-6)}`;
const maskPwd = () => '***';

/* domínio que antecede o usuário (mude se necessário) */
const DOMAIN = 'CCO';
let USER = process.env.CITSMART_USER || ''; 
if (!USER.includes('\\')) USER = `${DOMAIN}\\${USER}`; 

const PASS = process.env.CITSMART_PASS;
const ACTIVITY_ID = process.env.ACTIVITY_ID;
const CONTRACT_ID = process.env.CONTRACT_ID;
const CLIENT = 'Ativo';
const LANG = 'pt_BR';

/* --- cache do SessionID (JWT que vem no <SessionID>) --- */
let sessionId = '';
let sessionExp = 0;

async function ensureSession() {
	if (sessionId && Date.now() < sessionExp - 60_000) {
		log('ensureSession: usando cache', {
			exp: new Date(sessionExp).toISOString(),
			sid: maskToken(sessionId),
		});
		return sessionId;
	}

	const url = `${BASE}/${PROVIDER_BASE}/services/login`;
	const body = {
		clientId: CLIENT,
		language: LANG,
		userName: USER,
		password: PASS,
	};

	log('ensureSession: login POST', {
		url,
		body: { ...body, password: maskPwd() },
	});

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/xml',
		},
		body: JSON.stringify(body),
	});

	log('ensureSession: status', res.status);

	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		log('ensureSession: FAIL xml snippet', txt.slice(0, 220));
		throw new Error(`Login Citsmart ${res.status} – ${txt.slice(0, 180)}`);
	}

	const xml = await res.text();

	log('ensureSession: xml snippet', xml.slice(0, 220));

	const m = xml.match(/<SessionID>([^<]+)<\/SessionID>/i);

	if (!m) {
		log('ensureSession: SessionID não encontrado');
		throw new Error('SessionID não encontrado no XML de login');
	}

	sessionId = m[1].trim();
	sessionExp = Date.now() + 10 * 60 * 1000; // ~10min

	log('ensureSession: OK', {
		sid: maskToken(sessionId),
		exp: new Date(sessionExp).toISOString(),
	});

	return sessionId;
}

async function authHeaders() {
	const sid = await ensureSession();
	const headers = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${sid}`,
	};
	log('authHeaders', { auth: `Bearer ${maskToken(sid)}` });
	return headers;
}

/* -------------------- CONSULTA USUÁRIO -------------------- */
export async function findUserByLogin(login) {
	const url = `${BASE}/cit-esi-web/rest/dynamic/integracoes/consultas/list.json`;
	const payload = {
		SQLName: 'consulta_usuario_login',
		dynamicModel: { login },
	};

	log('findUserByLogin: req', { url, payload });

	const res = await fetch(url, {
		method: 'POST',
		headers: await authHeaders(),
		body: JSON.stringify(payload),
	});

	log('findUserByLogin: status', res.status);

	const text = await res.text().catch(() => '');

	log('findUserByLogin: resp snippet', text.slice(0, 300));

	if (!res.ok) return null;

	let json;

	try {
		json = JSON.parse(text);
	} catch (e) {
		log('findUserByLogin: JSON parse error', e.message);
		return null;
	}

	const first = json?.payload?.[0] ?? null;

	log('findUserByLogin: payload[0]', first);

	return first;
}

/* -------------------- ABRIR TICKET -------------------- */
export async function openTicket({ requesterId, description }) {
	const url = `${BASE}/${PROVIDER_BASE}/webmvc/servicerequestincident/create`;
	const body = {
		requesterId,
		activityId: ACTIVITY_ID,
		contractId: CONTRACT_ID,
		description,
		builderObjects: {},
	};

	log('openTicket: req', { url, body });

	const res = await fetch(url, {
		method: 'POST',
		headers: await authHeaders(),
		body: JSON.stringify(body),
	});

	log('openTicket: status', res.status);

	const text = await res.text().catch(() => '');
	log('openTicket: resp snippet', text.slice(0, 300));

	if (!res.ok)
		throw new Error(`Criar ticket ${res.status} – ${text.slice(0, 200)}`);

	let json;

	try {
		json = JSON.parse(text);
	} catch (e) {
		log('openTicket: JSON parse error', e.message);
		throw e;
	}

	const id = json.idSolicitacaoServico ?? json.id ?? '???';

	log('openTicket: OK', { id });

	return id;
}
