const BASE = process.env.CITSMART_BASE;
const PROVIDER_BASE = process.env.CITSMART_PROVIDER_BASE;

/* domínio que antecede o usuário (mude se necessário) */
const DOMAIN = 'CCO';

let USER = process.env.CITSMART_USER || '';
if (!USER.includes('\\')) USER = `${DOMAIN}\\${USER}`;

const PASS = process.env.CITSMART_PASS;
const ACTIVITY_ID = process.env.ACTIVITY_ID;
const CONTRACT_ID = process.env.CONTRACT_ID;
const CLIENT = 'Ativo';
const LANG = 'pt_BR';

/* ------------------------------------------------------------------
   Cache in-memory do SessionID
   ------------------------------------------------------------------ */
let sessionId = '';
let sessionExp = 0; // epoch ms

async function ensureSession() {
	if (sessionId && Date.now() < sessionExp - 60_000) return sessionId;

	const res = await fetch(`${BASE}/${PROVIDER_BASE}/services/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
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
	console.log('XML LOGIN', xml);

	const m = xml.match(/<SessionID>([^<]+)<\/SessionID>/i);
	if (!m) throw new Error('SessionID não encontrado na resposta de login');

	sessionId = m[1].trim();
	sessionExp = Date.now() + 10 * 60 * 1000; // 10 min (ajuste se diferente)
	return sessionId;
}

function authHeaders() {
	return {
		'Content-Type': 'application/json',
		'Authorization': `Bearer eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3NTQ2MDA0NTQsIm5hbWUiOiJNYXRoZXVzIERvdXJhZG8gVmlhbmEiLCJjb250cm9sIjoiN2IyMjY5NzAyMjNhMjIzMTM3MzIyZTMxMzkyZTMxMzAzMTJlMzEzNTM2MjIyYzIyNjg2ZjczNzQyMjNhMjIzMTM3MzIyZTMxMzkyZTMxMzAzMTJlMzEzNTM2MjI3ZCIsImlzc3VlZEF0IjoxNzU0NTk2ODU0MjI5LCJsb2NhbGUiOiJwdF9CUiIsImNsaWVudF9pZCI6IkF0aXZvIiwiZXhwaXJlc0F0IjoxNzU0NjAwNDU0MjI5LCJ0aW1lb3V0IjozNjAwLCJ1c2VybmFtZSI6IkNDT1xcbWF0aGV1cy52aWFuYSJ9.-ob3yR0TZ0Sf7OSx9d7TFbMoOm5u_LGM5Jj182e0yTNlHXnjPC7PPqHa7I7a0_eG1DxCQpbRNCkGYqFTN_ngbQ`,
	};
}
 
/* ------------------------------------------------------------------
   Consulta usuário pelo login
   ------------------------------------------------------------------ */
export async function findUserByLogin(login) {
	console.log("login", login);
	console.log("authHeaders", authHeaders()); 

	const res = await fetch(
		`${BASE}/cit-esi-web/rest/dynamic/integracoes/consultas/list.json`,
		{
			method: 'POST',
			headers: authHeaders(),
			body: {
				SQLName: 'consulta_usuario_login',
				dynamicModel: {
					login: 'matheus.viana',
				},
			},
		},
	);
	
	console.log('findUserByLogin', { login, res });

	if (!res.ok) return null;

	const data = await res.json();


	return Array.isArray(data) && data.length ? data.payload[0] : null; // contém idempregado
}

/* ------------------------------------------------------------------
   Abre ticket
   ------------------------------------------------------------------ */
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
