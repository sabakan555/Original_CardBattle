CREATE TABLE IF NOT EXISTS claims (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  cards TEXT NOT NULL CHECK(json_valid(cards) AND json_array_length(cards)=3),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(uid,day)
);
CREATE TABLE IF NOT EXISTS inventory (
  uid TEXT NOT NULL,
  card_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(uid,card_id)
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_uid ON push_subs(uid);
CREATE TABLE IF NOT EXISTS push_sent (
  room TEXT NOT NULL,
  uid TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY(room,uid)
);
