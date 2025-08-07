const BASE = process.env.CITSMART_BASE;
const PROVIDER_BASE = process.env.CITSMART_PROVIDER_BASE;
const USER = process.env.CITSMART_USER; 
const PASS = process.env.CITSMART_PASS; 
const CLIENT = 'Ativo';
const LANG = 'pt_BR';

let cachedToken = null;
let tokenExp = 0;

/* --- login / token --- */
async function ensureToken() {
	if (cachedToken && Date.now() < tokenExp - 60_000) return cachedToken;

	const res = await fetch(`${BASE}/${PROVIDER_BASE}/services/login`, { // => CITSMART 9
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			clientId: CLIENT,
			language: LANG,
			userName: USER,
			password: PASS,
		}),
	});
	if (!res.ok) throw new Error(`Login Citsmart ${res.status}`);

	const { access_token, expires_in = 300 } = await res.json();
	cachedToken = access_token;
	tokenExp = Date.now() + expires_in * 1000;

	return cachedToken;
}

/* --- helpers --- */
function authHeaders(token) {
	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`,
	};
}

/* --- consultar usuário por login --- */
export async function findUserByLogin(login) {
	const token = await ensureToken();
	const res = await fetch(
		`${BASE}/lowcode/rest/dynamic/integracoes/consultas/list`,
		{
			method: 'POST',
			headers: authHeaders(token),
			body: JSON.stringify({
				SQLName: 'consulta_usuario_login',
				dynamicModel: { login },
			}),
		},
	);
	if (!res.ok) return null;

	const data = await res.json();

	return data?.[0] ?? null; 
}

/* --- abrir ticket --- */
export async function openTicket({ requesterId, description }) {
	const token = await ensureToken();
	const body = {
		requesterId,
		activityId: 4908,
		contractId: 1,
		description,
		builderObjects: {},
	};
	const res = await fetch(
		`${BASE}/${PROVIDER_BASE}/webmvc/servicerequestincident/create`,
		{
			method: 'POST',
			headers: authHeaders(token),
			body: JSON.stringify(body),
		},
	);

	if (!res.ok) throw new Error(`Criar ticket ${res.status}`);

	const json = await res.json();

	return json.idSolicitacaoServico ?? json.id ?? '???';
}
