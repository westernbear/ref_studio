INSERT OR IGNORE INTO tenants VALUES ('ten_platform','Reference Video Studio Platform','PLATFORM','ACTIVE',0,'2026-08-22T00:00:00Z');
INSERT OR IGNORE INTO users VALUES ('usr_platform','platform@example.invalid','Platform Operator','2026-08-22T00:00:00Z');
INSERT OR IGNORE INTO credentials VALUES ('cred_platform_password','usr_platform','PASSWORD','scrypt$usr_platform-t7-salt$098ca43ec6a69677a6bad791dc7ced14b4c888337299352e47cb31c7a152636f','2026-08-22T00:00:00Z',NULL);
INSERT OR IGNORE INTO tenant_memberships VALUES ('ten_platform','usr_platform','SUPER_ADMIN','2026-08-22T00:00:00Z');
