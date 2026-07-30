import Database from 'better-sqlite3';

export function openDb(path) {
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.exec(`
		CREATE TABLE IF NOT EXISTS locations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			address TEXT,
			lat REAL,
			lng REAL
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			location_id INTEGER NOT NULL,
			course_id INTEGER,
			title TEXT NOT NULL,
			date TEXT NOT NULL,
			start_min INTEGER NOT NULL,
			end_min INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
		CREATE TABLE IF NOT EXISTS meta (
			key TEXT PRIMARY KEY,
			value TEXT
		);
	`);
	return db;
}

export function replaceData(db, { locations, sessions }) {
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM sessions').run();
		db.prepare('DELETE FROM locations').run();
		const insLoc = db.prepare(
			'INSERT OR REPLACE INTO locations (id, name, address, lat, lng) VALUES (?, ?, ?, ?, ?)'
		);
		for (const l of locations) insLoc.run(l.id, l.name, l.address, l.lat, l.lng);
		const insSes = db.prepare(
			'INSERT INTO sessions (location_id, course_id, title, date, start_min, end_min) VALUES (?, ?, ?, ?, ?, ?)'
		);
		for (const s of sessions) insSes.run(s.location_id, s.course_id, s.title, s.date, s.start_min, s.end_min);
	});
	tx();
}

export function sessionsForDate(db, date) {
	return db
		.prepare(
			`SELECT s.course_id, s.title, s.date, s.start_min, s.end_min,
			        l.id AS location_id, l.name AS pool, l.address, l.lat, l.lng
			 FROM sessions s
			 JOIN locations l ON l.id = s.location_id
			 WHERE s.date = ?
			 ORDER BY s.start_min, l.name`
		)
		.all(date);
}

export function getMeta(db, key) {
	const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
	return row ? row.value : undefined;
}

export function setMeta(db, key, value) {
	db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
