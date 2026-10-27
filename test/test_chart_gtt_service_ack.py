"""Actual shared GTT services with isolated modules and mocked broker adapters."""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest


@pytest.mark.parametrize("operation", ["place", "modify", "cancel"])
@pytest.mark.parametrize(
    "body",
    [
        {"status": "error", "message": "Broker rejected"},
        {"s": "error", "message": "Broker rejected"},
    ],
)
def test_http_200_business_rejection_never_emits_success(monkeypatch, operation, body):
    def stub(name, **values):
        module = ModuleType(name)
        module.__dict__.update(values)
        monkeypatch.setitem(sys.modules, name, module)

    stub("database.auth_db", get_auth_token_broker=Mock())
    stub("database.settings_db", get_analyze_mode=lambda: False)
    published = []

    def event(name):
        return lambda **data: {"event": name, **data}

    names = [
        "AnalyzerErrorEvent",
        "GTTFailedEvent",
        "GTTPlacedEvent",
        "GTTModifiedEvent",
        "GTTModifyFailedEvent",
        "GTTCancelFailedEvent",
        "GTTCancelledEvent",
    ]
    stub("events", **{name: event(name) for name in names})
    stub("utils.event_bus", bus=SimpleNamespace(publish=published.append))
    stub("utils.logging", get_logger=lambda _: Mock())
    spec = importlib.util.spec_from_file_location(
        f"isolated_{operation}_gtt_service",
        Path(__file__).parents[1] / f"services/{operation}_gtt_order_service.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = (SimpleNamespace(status=200), body, "G1") if operation == "place" else (body, 200)
    adapter = SimpleNamespace(**{f"{operation}_gtt_order": Mock(return_value=result)})
    module.import_broker_gtt_module = lambda _: adapter
    request = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "quantity": 75,
        "action": "SELL",
        "trigger_type": "SINGLE",
        "trigger_id": "G1",
        "trigger_price": 90,
        "price": 90,
    }
    function = getattr(module, f"{operation}_gtt_order_with_auth")
    ok, response, status = function(
        "G1" if operation == "cancel" else request, "mock-token", "fyers", {}
    )
    assert not ok and status == 400 and response["status"] == "error"
    assert response["message"] == "Broker rejected"
    assert not any(
        item["event"] in ("GTTPlacedEvent", "GTTModifiedEvent", "GTTCancelledEvent")
        for item in published
    )
