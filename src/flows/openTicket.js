import { get, set, clear } from '../session.js';
import { findUserByLogin, openTicket } from '../services/citsmart.js';

const STATES = { WAIT_LOGIN: 'WAIT_LOGIN', WAIT_DESC: 'WAIT_DESC' };

export async function handle(from, text) {
	const sess = get(from);

	if (!sess) {
		// início
		set(from, { state: STATES.WAIT_LOGIN });
		return 'Informe apenas seu *login* de rede (ex.: fulano.silva).';
	}

	if (sess.state === STATES.WAIT_LOGIN) {
		const login = text.trim().toLowerCase();
		const user = await findUserByLogin(login);
		if (!user)
			return '⚠️ Login não localizado. Tente novamente (ex.: fulano.silva).';

		set(from, { state: STATES.WAIT_DESC, user });
		return `Usuário localizado: *${
			user.nome_completo ?? user.nome
		}*.\nDescreva o problema que gostaria de abrir como chamado.`;
	}

	if (sess.state === STATES.WAIT_DESC) {
		const desc = text.trim();
		if (desc.length < 8)
			return 'Descreva com um pouco mais de detalhes, por favor.';

		try {
			const ticketId = await openTicket({
				requesterId: sess.user.idempregado, // usa idempregado!
				description: desc,
			});
			clear(from);
			return [
				`✅ Ticket aberto com sucesso! Nº: *${ticketId}*`,
				'',
				'Posso ajudar em algo mais? (Digite 1, 2 ou 3 para voltar ao menu.)',
			].join('\n');
		} catch (e) {
			console.error('erro criar ticket', e);
			clear(from);
			return '😔 Ocorreu um erro ao abrir o ticket. Tente novamente mais tarde.';
		}
	}

	clear(from);
	return 'Algo saiu do fluxo. Vamos começar de novo.';
}
