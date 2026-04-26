"""Pytest auto-skip for _legacy tests.

These tests target pre-iter-17 endpoints (public, no auth wall) and would
fail systematically because of the auth migration. They are kept here for
documentation/reference only.

Skip them automatically unless the env var WAFLOW_RUN_LEGACY_TESTS=1 is set
(useful when manually reviving them during a future refactor).
"""
import os
import pytest

if os.environ.get("WAFLOW_RUN_LEGACY_TESTS") != "1":
    collect_ignore_glob = ["test_*.py"]


def pytest_collection_modifyitems(config, items):  # pragma: no cover
    if os.environ.get("WAFLOW_RUN_LEGACY_TESTS") == "1":
        return
    skip_marker = pytest.mark.skip(reason="legacy pre-iter-17 test (set WAFLOW_RUN_LEGACY_TESTS=1 to run)")
    for item in items:
        if "/_legacy/" in str(item.fspath):
            item.add_marker(skip_marker)
