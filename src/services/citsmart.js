const BASE = process.env.CITSMART_BASE; 
const PROVIDER_BASE = process.env.CITSMART_PROVIDER_BASE; 
const USER = process.env.CITSMART_USER; 
const PASS = process.env.CITSMART_PASS; 
const ACTIVITY_ID = process.env.ACTIVITY_ID;
const CONTRACT_ID = process.env.CONTRACT_ID;
const CLIENT = 'Ativo';
const LANG = 'pt_BR';

/* cache in-memory -------------------------------------------------------- */
let sessionId = ''; // valor do <SessionID>
let sessionExp = 0; // epoch ms de expiração (10 min)

/* -------------------------- login / SessionID -------------------------- */
async function ensureSession() {
	if (sessionId && Date.now() < sessionExp - 60_000) return sessionId;

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

	const xml = await res.text();
	const m = xml.match(/<SessionID>([^<]+)<\/SessionID>/i);

	if (!m) throw new Error('SessionID não encontrado no XML de login');

	sessionId = m[1].trim();
	sessionExp = Date.now() + 10 * 60 * 1000; // 10 min (ajuste se outro TTL)
	return sessionId;
}

/* monta headers com cookie JSESSIONID ----------------------------------- */
function authHeaders() {
	return {
		'Content-Type': 'application/json',
		Cookie: `JSESSIONID=${sessionId}`,
	};
}

/* ----------------------- consultar usuário ----------------------------- */
export async function findUserByLogin(login) {
	await ensureSession();
	const res = await fetch(
		`${BASE}/lowcode/rest/dynamic/integracoes/consultas/list`,
		{
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				SQLName: 'consulta_usuario_login',
				dynamicModel: { login },
			}),
		},
	);

	if (!res.ok) return null;

	const data = await res.json();

	return Array.isArray(data) && data.length ? data[0] : null; // contém idempregado
}

/* ----------------------- abrir ticket ---------------------------------- */
export async function openTicket({ requesterId, description }) {
	await ensureSession();
	const body = {
		requesterId,
		activityId: ACTIVITY_ID,
		contractId: CONTRACT_ID,
		description,
		builderObjects: {},
	};
	const res = await fetch(
		`${BASE}/${PROVIDER_BASE}/webmvc/servicerequestincident/create`,
		{ method: 'POST', headers: authHeaders(), body: JSON.stringify(body) },
	);

	if (!res.ok) throw new Error(`Criar ticket ${res.status}`);

	const json = await res.json();

	return json.idSolicitacaoServico ?? json.id ?? '???';
}
