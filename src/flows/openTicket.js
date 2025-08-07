const BASE = process.env.CITSMART_BASE; 
const PROVIDER_BASE = process.env.CITSMART_PROVIDER_BASE; 
const USER = process.env.CITSMART_USER; 
const PASS = process.env.CITSMART_PASS; 
const ACTIVITY_ID = process.env.ACTIVITY_ID;
const CONTRACT_ID = process.env.CONTRACT_ID;
const CLIENT = 'Ativo';
const LANG = 'pt_BR';

/* cache em memória */
let cachedCookie = ''; // "JSESSIONID=...; AUTH-TOKEN=..."
let cookieExp = 0; // epoch ms

/* ---------- LOGIN (pega cookies) ---------- */
async function ensureCookies() {
	if (cachedCookie && Date.now() < cookieExp - 60_000) return cachedCookie;

	const res = await fetch(`${BASE}/${PROVIDER_BASE}/services/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/xml',
		},
		body: JSON.stringify({
			clientId: CLIENT,
			language: LANG,
			userName: USER,
			password: PASS,
		}),
	});

	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		throw new Error(`Login Citsmart ${res.status} – ${txt.slice(0, 120)}`);
	}

	/* --- extrai cookies da resposta --- */
	const setCookies = res.headers.getSetCookie?.() || res.headers.raw()['set-cookie'] || [];
	const jsess = setCookies.find((c) =>
		c.toLowerCase().startsWith('jsessionid='),
	);
	const auth = setCookies.find((c) =>
		c.toLowerCase().startsWith('auth-token='),
	);

	if (!jsess) throw new Error('JSESSIONID não veio no Set-Cookie');

	cachedCookie = [jsess.split(';')[0], auth?.split(';')[0]]
		.filter(Boolean)
		.join('; ');
	cookieExp = Date.now() + 10 * 60 * 1000; // 10 min (ajuste se souber TTL)

	return cachedCookie;
}

/* monta headers com os cookies */
function authHeaders(cookieStr) {
	return {
		'Content-Type': 'application/json',
		Cookie: cookieStr,
	};
}

/* ---------- CONSULTAR USUÁRIO ---------- */
export async function findUserByLogin(login) {
	const cookie = await ensureCookies();

	const res = await fetch(
		`${BASE}/lowcode/rest/dynamic/integracoes/consultas/list`,
		{
			method: 'POST',
			headers: authHeaders(cookie),
			body: JSON.stringify({
				SQLName: 'consulta_usuario_login',
				dynamicModel: { login },
			}),
		},
	);

	if (!res.ok) return null;

	const data = await res.json();

	return Array.isArray(data) && data.length ? data[0] : null; // tem idempregado
}

/* ---------- ABRIR TICKET ---------- */
export async function openTicket({ requesterId, description }) {
	const cookie = await ensureCookies();

	const body = {
		requesterId,
		activityId: ACTIVITY_ID,
		contractId: CONTRACT_ID,
		description,
		builderObjects: {},
	};

	const res = await fetch(
		`${BASE}/${PROVIDER_BASE}/webmvc/servicerequestincident/create`,
		{
			method: 'POST',
			headers: authHeaders(cookie),
			body: JSON.stringify(body),
		},
	);

	if (!res.ok) throw new Error(`Criar ticket ${res.status}`);

	const json = await res.json();

	return json.idSolicitacaoServico ?? json.id ?? '???';
}
