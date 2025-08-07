const SESSIONS = new Map(); 
const TTL = 15 * 60 * 1000; 

export function get(phone) {
	const s = SESSIONS.get(phone);

	if (!s || Date.now() > s.exp) return null;
	
	return s;
}

export function set(phone, obj) {
	SESSIONS.set(phone, { ...obj, exp: Date.now() + TTL });
}

export function clear(phone) {
	SESSIONS.delete(phone);
}
