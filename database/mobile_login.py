"""Bounded, durable, encrypted native FYERS return tickets. No broker calls.

The existing broker-key database owns schema startup. Each operation uses a
short-lived SQLAlchemy Session and closes it even on failure. Only the original
WebView session can consume a ticket; a deep-link interceptor cannot use it.
"""

import hashlib
import json
import secrets
import time

from sqlalchemy import Column, Integer, String, Text, delete, select, update
from sqlalchemy.orm import Session

from database import broker_keys_db

TTL = 600
MAX_PENDING = 16


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class MobileLoginTicket(broker_keys_db.Base):
    __tablename__ = "mobile_login_tickets"
    state_hash = Column(String(64), primary_key=True)
    binding_hash = Column(String(64), nullable=False, index=True)
    ticket_hash = Column(String(64), unique=True, nullable=True, index=True)
    payload = Column(Text, nullable=True)
    return_kind = Column(String(16), nullable=False, default="native")
    expires = Column(Integer, nullable=False)


def begin(state, binding, return_kind="native"):
    if return_kind not in {"native", "desktop"}:
        raise ValueError("Unsupported login return kind")
    now = int(time.time())
    with Session(broker_keys_db.engine) as db, db.begin():
        db.execute(delete(MobileLoginTicket).where(MobileLoginTicket.expires <= now))
        db.execute(delete(MobileLoginTicket).where(MobileLoginTicket.binding_hash == binding))
        # Bound live records as well as expired ones; no unbounded login registry.
        ids = list(
            db.scalars(select(MobileLoginTicket.state_hash).order_by(MobileLoginTicket.expires))
        )
        for key in ids[: max(0, len(ids) - MAX_PENDING + 1)]:
            db.execute(delete(MobileLoginTicket).where(MobileLoginTicket.state_hash == key))
        db.add(
            MobileLoginTicket(
                state_hash=digest(state),
                binding_hash=binding,
                expires=now + TTL,
                return_kind=return_kind,
            )
        )


def kind(state):
    if not state or len(state) > 256:
        return None
    with Session(broker_keys_db.engine) as db:
        row = db.get(MobileLoginTicket, digest(state))
        return row.return_kind if row is not None else None


def receive(state, code):
    """One callback wins. Auth code never appears in the app return URL."""
    from database.auth_db import encrypt_token

    if not state or not code or len(code) > 8192:
        return None
    ticket = secrets.token_urlsafe(32)
    encoded = encrypt_token(json.dumps({"state": state, "code": code}))
    with Session(broker_keys_db.engine) as db, db.begin():
        changed = db.execute(
            update(MobileLoginTicket)
            .where(
                MobileLoginTicket.state_hash == digest(state),
                MobileLoginTicket.expires > int(time.time()),
                MobileLoginTicket.ticket_hash.is_(None),
            )
            .values(ticket_hash=digest(ticket), payload=encoded)
        )
        return ticket if changed.rowcount == 1 else None


def consume(ticket, binding):
    from database.auth_db import decrypt_token

    if not isinstance(ticket, str) or not 32 <= len(ticket) <= 128:
        return None
    with Session(broker_keys_db.engine) as db, db.begin():
        row = db.scalar(
            select(MobileLoginTicket).where(
                MobileLoginTicket.ticket_hash == digest(ticket),
                MobileLoginTicket.binding_hash == binding,
                MobileLoginTicket.expires > int(time.time()),
            )
        )
        if row is None:
            return None
        payload, key = row.payload, row.state_hash
        changed = db.execute(
            delete(MobileLoginTicket).where(
                MobileLoginTicket.state_hash == key,
                MobileLoginTicket.ticket_hash == digest(ticket),
            )
        )
        if changed.rowcount != 1:
            return None
    return json.loads(decrypt_token(payload))


def cancel(binding):
    with Session(broker_keys_db.engine) as db, db.begin():
        db.execute(delete(MobileLoginTicket).where(MobileLoginTicket.binding_hash == binding))
