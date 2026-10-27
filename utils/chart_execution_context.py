"""Request-local execution pipe, fixed only after server-mode validation."""

from contextlib import contextmanager
from contextvars import ContextVar

_mode = ContextVar("chart_execution_mode", default=None)


def chart_analyze_mode():
    return _mode.get()


@contextmanager
def chart_execution_mode(analyze):
    token = _mode.set(bool(analyze))
    try:
        yield
    finally:
        _mode.reset(token)
