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
