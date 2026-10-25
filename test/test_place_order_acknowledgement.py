"""Production acknowledgement boundary, isolated from databases and network."""
import ast
import copy
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


@pytest.fixture
def boundary():
    filename = Path(__file__).resolve().parents[1] / 'services/place_order_service.py'
    tree = ast.parse(filename.read_text(encoding='utf-8'))
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in {'_order_acknowledgement', 'place_order_with_auth'}]
    emitted = []
    event = lambda **kwargs: kwargs
    namespace = dict(Any=Any, copy=copy, get_analyze_mode=lambda: False,
                     BrokerBusyError=type('BrokerBusyError', (Exception,), {}),
                     logger=SimpleNamespace(warning=lambda *a: None, exception=lambda *a: None),
                     bus=SimpleNamespace(publish=emitted.append), OrderPlacedEvent=event, OrderFailedEvent=event)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(filename), 'exec'), namespace)
    calls = []

    def run(response, payload, order_id, emit_event=True):
        def place(*args):
            calls.append(args)
            return response, payload, order_id
        namespace['import_broker_module'] = lambda _: SimpleNamespace(place_order_api=place)
        order = dict(symbol='SAMPLE', exchange='NSE', action='BUY', quantity=1, pricetype='MARKET', product='MIS')
        result = namespace['place_order_with_auth'](order, 'offline-token', 'fyers', order, emit_event=emit_event)
        assert len(calls) == 1  # Never retry a placement with an uncertain outcome.
        return result, emitted
    return run


@pytest.mark.parametrize('payload', [
    {'s': 'error', 'message': 'Insufficient funds'},
    {'stat': 'Not_Ok', 'emsg': 'Invalid price'},
    {'status': 'error', 'message': 'Rejected'},
])
@pytest.mark.parametrize('order_id', [None, 'NOT-AN-ACCEPTANCE'])
def test_http_200_rejection_is_never_success(boundary, payload, order_id):
    (ok, body, status), events = boundary(SimpleNamespace(status=200), payload, order_id)
    assert not ok and body['status'] == 'error' and status == 400
    assert 'orderid' not in body
    assert len(events) == 1 and 'orderid' not in events[0]


@pytest.mark.parametrize('order_id', [None, '', ' ', 0, 'null', 'None', False])
def test_missing_id_is_an_unconfirmed_outcome(boundary, order_id):
    (ok, body, status), events = boundary(SimpleNamespace(status_code=200), {'s': 'ok'}, order_id)
    assert not ok and status == 502
    assert 'order book before retrying' in body['message']
    assert all('orderid' not in event for event in events)


@pytest.mark.parametrize('response', [None, SimpleNamespace(status_code=503)])
def test_transport_failure_does_not_raise_or_publish_success(boundary, response):
    (ok, body, status), events = boundary(response, {'error': 'Broker connection failed'}, None)
    assert not ok and status >= 500 and body['message'] == 'Broker connection failed'
    assert all('orderid' not in event for event in events)


@pytest.mark.parametrize('order_id', ['ORD-123', 123456])
def test_valid_acceptance_keeps_order_id_and_publishes_once(boundary, order_id):
    (ok, body, status), events = boundary(SimpleNamespace(status=200), {'s': 'ok'}, order_id)
    assert ok and status == 200 and body == {'status': 'success', 'orderid': order_id}
    assert len(events) == 1 and events[0]['orderid'] == str(order_id)


def test_valid_acceptance_can_suppress_event(boundary):
    (ok, _, _), events = boundary(SimpleNamespace(status=200), {}, 'ORD-123', emit_event=False)
    assert ok and not events
