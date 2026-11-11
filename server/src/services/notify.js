// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.

export async function notify(db, userId, msg) {
  await db.query(
    'insert into notifications (user_id, kind, title, body) values ($1, $2, $3, $4)',
    [userId, msg.kind, msg.title, msg.body],
  );
}

export async function audit(db, actorId, action, entity, entityId, data = null) {
  await db.query(
    'insert into audit_log (actor_id, action, entity, entity_id, data) values ($1, $2, $3, $4, $5)',
    [actorId, action, entity, entityId, data],
  );
}
