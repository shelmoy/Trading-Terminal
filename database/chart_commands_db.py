"""Durable chart-command claims. No broker calls while a DB connection is held.

Run init_db explicitly after a consistent database backup, before enabling UI.
The existing application engine owns pooling; every checkout is context managed.
"""

import json
import time

from sqlalchemy import (
    Column,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    delete,
    func,
    insert,
    inspect,
    literal,
    select,
    tuple_,
    update,
)
from sqlalchemy.exc import IntegrityError

metadata = MetaData()
commands = Table(
    "chart_trading_commands",
    metadata,
    Column("scope", String(200), primary_key=True),
    Column("command_id", String(36), primary_key=True),
    Column("fingerprint", String(64), nullable=False),
    Column("intent", Text, nullable=False),
    Column("state", String(20), nullable=False),
    Column("result", Text, nullable=True),
    Column("http_status", Integer, nullable=False),
    Column("created_at", Float, nullable=False, index=True),
)
claims = Table(
    "chart_trading_claims",
    metadata,
    Column("scope", String(200), primary_key=True),
    Column("resource", String(300), primary_key=True),
    Column("command_id", String(36), nullable=False),
)
protections = Table(
    "chart_trading_protections",
    metadata,
    Column("scope", String(200), primary_key=True),
    Column("broker_id", String(128), primary_key=True),
    Column("contract", Text, nullable=False),
    Column("command_id", String(36), nullable=False),
)


class CommandLedger:
    def __init__(self, engine):
        self.engine = engine

    def init_db(self):
        metadata.create_all(self.engine)

    def _store_binding(self, conn, scope, command_id, binding):
        existing = conn.execute(
            select(protections.c.contract).where(
                protections.c.scope == scope, protections.c.broker_id == binding["brokerId"]
            )
        ).first()
        if existing:
            previous = json.loads(existing[0])
            if previous["identity"] != binding["identity"] or previous["kind"] != binding["kind"]:
                raise RuntimeError(
                    "Broker ID collided with another protection; association was not overwritten"
                )
        conn.execute(
            delete(protections).where(
                protections.c.scope == scope, protections.c.broker_id == binding["brokerId"]
            )
        )
        conn.execute(
            insert(protections).values(
                scope=scope,
                broker_id=binding["brokerId"],
                contract=json.dumps(binding),
                command_id=command_id,
            )
        )

    def ready(self):
        with self.engine.connect() as conn:
            schema = inspect(conn)
            return all(
                schema.has_table(table.name)
                and {column.name for column in table.columns}.issubset(
                    {column["name"] for column in schema.get_columns(table.name)}
                )
                for table in (commands, claims, protections)
            )

    def read(self, scope, command_id):
        with self.engine.connect() as conn:
            row = (
                conn.execute(
                    select(commands).where(
                        commands.c.scope == scope, commands.c.command_id == command_id
                    )
                )
                .mappings()
                .first()
            )
            return dict(row) if row else None

    def pending(self, scope):
        with self.engine.connect() as conn:
            rows = (
                conn.execute(
                    select(commands)
                    .join(
                        claims,
                        (claims.c.scope == commands.c.scope)
                        & (claims.c.command_id == commands.c.command_id),
                    )
                    .where(commands.c.scope == scope)
                    .order_by(commands.c.created_at)
                    .limit(128)
                )
                .mappings()
                .all()
            )
            result = []
            for row in rows:
                intent = json.loads(row["intent"])
                data = intent.get("payload", {})
                result.append(
                    {
                        "commandId": row["command_id"],
                        "state": row["state"],
                        "operation": intent.get("operation"),
                        "request": data,
                        "issuedAt": intent.get("issuedAt"),
                        **{key: data.get(key) for key in ("symbol", "exchange", "product")},
                    }
                )
            return result

    def recover_abandoned(self, scope, alive=None):
        """A dead worker's claim becomes uncertain, never unlocked or retried.

        A live/unknown owner may still finish its handler. Age alone is not
        evidence of non-delivery. No timer, monitor thread or broker call.
        """
        from utils.chart_commands import worker_alive

        alive = alive or worker_alive
        with self.engine.connect() as conn:
            rows = (
                conn.execute(
                    select(commands)
                    .where(commands.c.scope == scope, commands.c.state == "submitting")
                    .limit(128)
                )
                .mappings()
                .all()
            )
        for row in rows:
            owner = json.loads(row["intent"]).get("_worker")
            if not owner or alive(owner) is not False:
                continue
            body = {
                "status": "info",
                "state": "uncertain",
                "commandId": row["command_id"],
                "message": "The previous worker ended before confirmation. Select a verified broker ID; nothing will be resent.",
            }
            with self.engine.begin() as conn:
                conn.execute(
                    update(commands)
                    .where(
                        commands.c.scope == scope,
                        commands.c.command_id == row["command_id"],
                        commands.c.state == "submitting",
                    )
                    .values(state="uncertain", result=json.dumps(body), http_status=202)
                )

    def resolve(self, scope, command_id, fingerprint, result, binding=None):
        """Local-only, compare-and-set resolution; never dispatches a broker call."""
        with self.engine.begin() as conn:
            changed = conn.execute(
                update(commands)
                .where(
                    commands.c.scope == scope,
                    commands.c.command_id == command_id,
                    commands.c.fingerprint == fingerprint,
                    commands.c.state == "uncertain",
                )
                .values(state="resolved", result=json.dumps(result), http_status=200)
            )
            if changed.rowcount != 1:
                return False
            if binding:
                self._store_binding(conn, scope, command_id, binding)
            conn.execute(
                delete(claims).where(claims.c.scope == scope, claims.c.command_id == command_id)
            )
            return True

    def prepare_protection(self, scope, command_id, prepared, *, field="_preparedProtection"):
        """Save authoritative preflight before a mutation can leave this process."""
        with self.engine.begin() as conn:
            row = conn.execute(
                select(commands.c.intent).where(
                    commands.c.scope == scope,
                    commands.c.command_id == command_id,
                    commands.c.state == "submitting",
                )
            ).first()
            if not row:
                from utils.chart_commands import CommandRefused

                raise CommandRefused("Protection command no longer owns its durable claim")
            intent = json.loads(row[0])
            intent[field] = prepared
            conn.execute(
                update(commands)
                .where(commands.c.scope == scope, commands.c.command_id == command_id)
                .values(intent=json.dumps(intent))
            )

    def prepare_order(self, scope, command_id, prepared):
        self.prepare_protection(scope, command_id, prepared, field="_preparedOrder")

    def rebind_protection(self, scope, old_binding, replacement):
        """Explicit human-selected child ID, local-only compare-and-set."""
        with self.engine.begin() as conn:
            current = (
                conn.execute(
                    select(protections).where(
                        protections.c.scope == scope,
                        protections.c.broker_id == old_binding["brokerId"],
                    )
                )
                .mappings()
                .first()
            )
            if not current or json.loads(current["contract"]) != old_binding:
                return False
            pending = conn.execute(
                select(claims.c.command_id).where(
                    claims.c.scope == scope,
                    claims.c.resource
                    == json.dumps(
                        [old_binding["identity"][k] for k in ("exchange", "symbol", "product")]
                    ),
                )
            ).first()
            if pending:
                return False
            if conn.execute(
                select(protections.c.broker_id).where(
                    protections.c.scope == scope, protections.c.broker_id == replacement["brokerId"]
                )
            ).first():
                return False
            conn.execute(
                delete(protections).where(
                    protections.c.scope == scope, protections.c.broker_id == old_binding["brokerId"]
                )
            )
            conn.execute(
                insert(protections).values(
                    scope=scope,
                    broker_id=replacement["brokerId"],
                    contract=json.dumps(replacement),
                    command_id=current["command_id"],
                )
            )
            return True

    def claim(self, scope, command_id, fingerprint, now=None, intent=None):
        now = time.time() if now is None else now
        intent = intent or {}
        payload = intent.get("payload") or {}
        resource = json.dumps([payload.get(k) for k in ("exchange", "symbol", "product")])
        try:
            with self.engine.begin() as conn:
                # Expired UUIDs cannot execute again: the command's issuedAt
                # admission check independently rejects drafts older than120s.
                retained = (
                    select(claims.c.command_id)
                    .where(claims.c.scope == commands.c.scope)
                    .correlate(commands)
                )
                expired = conn.execute(
                    select(commands.c.scope, commands.c.command_id)
                    .where(
                        commands.c.created_at < now - 30 * 86400,
                        commands.c.command_id.not_in(retained),
                        ~select(protections.c.broker_id)
                        .where(
                            protections.c.scope == commands.c.scope,
                            protections.c.command_id == commands.c.command_id,
                        )
                        .exists(),
                    )
                    .limit(100)
                ).all()
                if expired:
                    conn.execute(
                        delete(commands).where(
                            tuple_(commands.c.scope, commands.c.command_id).in_(expired)
                        )
                    )
                count = (
                    select(func.count())
                    .select_from(claims)
                    .where(claims.c.scope == scope)
                    .scalar_subquery()
                )
                inserted = conn.execute(
                    insert(claims).from_select(
                        ["scope", "resource", "command_id"],
                        select(literal(scope), literal(resource), literal(command_id)).where(
                            count < 128
                        ),
                    )
                )
                if inserted.rowcount != 1:
                    return False
                conn.execute(
                    insert(commands).values(
                        scope=scope,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        intent=json.dumps(intent),
                        state="submitting",
                        result=None,
                        http_status=202,
                        created_at=now,
                    )
                )
            return True
        except IntegrityError:
            return False

    def finish(self, scope, command_id, body, status):
        with self.engine.begin() as conn:
            binding = body.pop("_binding", None)
            if binding and body["state"] == "accepted":
                # Receipt and explicit position->broker-ID association commit
                # together. A crash before here leaves the durable claim locked.
                self._store_binding(conn, scope, command_id, binding)
            conn.execute(
                update(commands)
                .where(commands.c.scope == scope, commands.c.command_id == command_id)
                .values(state=body["state"], result=json.dumps(body), http_status=status)
            )
            if body["state"] == "rejected":
                conn.execute(
                    delete(claims).where(claims.c.scope == scope, claims.c.command_id == command_id)
                )

    def bindings(self, scope):
        with self.engine.connect() as conn:
            rows = conn.execute(
                select(protections.c.contract).where(protections.c.scope == scope).limit(129)
            ).all()
            if len(rows) > 128:
                from utils.chart_commands import CommandRefused

                raise CommandRefused("Too many unresolved protection bindings; review broker exits")
            return [json.loads(row[0]) for row in rows]

    def reconcile_protections(self, scope, states, native_ids=()):
        """Read confirmation unlocks claims; triggered/unknown exits stay bound."""
        from utils.chart_protection import TERMINAL

        with self.engine.begin() as conn:
            for item in states:
                native = item.get("native")
                if not native:
                    if (
                        item.get("confirmedTerminal") in (*TERMINAL, "complete")
                        and item.get("parentTriggerId") not in native_ids
                    ):
                        conn.execute(
                            delete(protections).where(
                                protections.c.scope == scope,
                                protections.c.broker_id == item["brokerId"],
                            )
                        )
                    continue
                row = conn.execute(
                    select(protections.c.command_id).where(
                        protections.c.scope == scope, protections.c.broker_id == item["brokerId"]
                    )
                ).first()
                if not row:
                    continue
                command = (
                    conn.execute(
                        select(commands).where(
                            commands.c.scope == scope, commands.c.command_id == row[0]
                        )
                    )
                    .mappings()
                    .first()
                )
                if not command or command["state"] not in ("accepted", "resolved"):
                    continue
                intent = json.loads(command["intent"])
                op = intent.get("operation")
                terminal = item["state"] in TERMINAL or item["state"] == "complete"
                expected = item["roles"]
                if item["kind"] == "gtt":
                    legs = [
                        (float(t), float(leg["price"]), int(leg["quantity"]))
                        for t, leg in zip(native["trigger_prices"], native["legs"], strict=True)
                    ]
                    requested = [
                        (leg["trigger"], leg["limit"], abs(item["positionQuantity"]))
                        for leg in expected.values()
                    ]
                    matched = sorted(legs) == sorted(requested)
                else:
                    leg = next(iter(expected.values()))
                    matched = (
                        float(native.get("trigger_price") or native["price"]) == leg["trigger"]
                        and float(native["price"]) == leg["limit"]
                        and int(native["quantity"]) == abs(item["positionQuantity"])
                    )
                confirmed = terminal or (op != "cancelProtection" and matched)
                if confirmed:
                    conn.execute(
                        delete(claims).where(claims.c.scope == scope, claims.c.command_id == row[0])
                    )
                if terminal and item.get("parentTriggerId") not in native_ids:
                    conn.execute(
                        delete(protections).where(
                            protections.c.scope == scope,
                            protections.c.broker_id == item["brokerId"],
                        )
                    )
                elif terminal and item.get("parentTriggerId"):
                    saved = conn.execute(
                        select(protections.c.contract).where(
                            protections.c.scope == scope,
                            protections.c.broker_id == item["brokerId"],
                        )
                    ).first()
                    if saved:
                        contract = json.loads(saved[0])
                        contract.update(
                            confirmedTerminal=item["state"], terminalVersion=item["nativeVersion"]
                        )
                        conn.execute(
                            update(protections)
                            .where(
                                protections.c.scope == scope,
                                protections.c.broker_id == item["brokerId"],
                            )
                            .values(contract=json.dumps(contract))
                        )

    def reconcile(self, scope, orders, positions):
        """Release accepted commands only after an authoritative book sees them."""
        with self.engine.begin() as conn:
            rows = (
                conn.execute(
                    select(commands)
                    .join(
                        claims,
                        (claims.c.scope == commands.c.scope)
                        & (claims.c.command_id == commands.c.command_id),
                    )
                    .where(commands.c.scope == scope, commands.c.state == "accepted")
                )
                .mappings()
                .all()
            )
            for row in rows:
                body = json.loads(row["result"])
                intent = json.loads(row["intent"])
                data = intent.get("payload", {})
                operation = intent.get("operation")
                order = next(
                    (
                        o
                        for o in orders
                        if str(o.get("orderid")) == body.get("orderId")
                        and all(o.get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
                    ),
                    None,
                )
                terminal = order and order.get("order_status") in (
                    "complete",
                    "cancelled",
                    "rejected",
                    "expired",
                )
                confirmed = bool(order) if operation == "place" else False
                if operation == "modify" and order:
                    fields = [k for k in ("price", "trigger_price") if k in data]
                    confirmed = bool(terminal) or all(
                        float(order.get(k) or 0) == float(data[k] or 0) for k in fields
                    )
                if operation == "cancel":
                    confirmed = bool(terminal)
                if operation == "reduce":
                    confirmed = bool(terminal)
                if operation == "close":
                    flat = not any(
                        all(p.get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
                        and float(p.get("quantity") or 0) != 0
                        for p in positions
                    )
                    # An external exit can flatten the position while this
                    # close order is still working. Keep its claim until the
                    # exact broker order is terminal; otherwise it could reverse
                    # a newly opened position. Terminal refusals allow a fresh,
                    # explicit action against the remaining confirmed position.
                    confirmed = bool(terminal) and (
                        flat or order["order_status"] in ("cancelled", "rejected", "expired")
                    )
                if confirmed:
                    conn.execute(
                        delete(claims).where(
                            claims.c.scope == scope, claims.c.command_id == row["command_id"]
                        )
                    )


def ledger():
    from database.auth_db import engine

    return CommandLedger(engine)


def init_db():
    ledger().init_db()
