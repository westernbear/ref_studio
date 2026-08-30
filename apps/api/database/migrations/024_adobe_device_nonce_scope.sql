ALTER TABLE adobe_relay_nonces RENAME TO adobe_relay_nonces_key_scoped;

CREATE UNIQUE INDEX adobe_device_keys_device_key ON adobe_device_keys(device_id,id);

CREATE TABLE adobe_relay_nonces (
  device_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  consumed_at_ms INTEGER NOT NULL CHECK (consumed_at_ms >= 0),
  PRIMARY KEY (device_id,nonce),
  FOREIGN KEY (device_id,key_id) REFERENCES adobe_device_keys(device_id,id)
);

INSERT INTO adobe_relay_nonces(device_id,key_id,nonce,consumed_at_ms)
SELECT keys.device_id, MIN(old.key_id), old.nonce, MIN(old.consumed_at_ms)
FROM adobe_relay_nonces_key_scoped AS old
JOIN adobe_device_keys AS keys ON keys.id=old.key_id
GROUP BY keys.device_id,old.nonce;

DROP TABLE adobe_relay_nonces_key_scoped;

CREATE TRIGGER adobe_relay_nonces_immutable_update BEFORE UPDATE ON adobe_relay_nonces BEGIN SELECT RAISE(ABORT,'ADOBE_RELAY_NONCE_IMMUTABLE'); END;
CREATE TRIGGER adobe_relay_nonces_immutable_delete BEFORE DELETE ON adobe_relay_nonces BEGIN SELECT RAISE(ABORT,'ADOBE_RELAY_NONCE_IMMUTABLE'); END;
