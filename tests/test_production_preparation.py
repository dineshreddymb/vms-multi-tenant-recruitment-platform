import os
import sys

# Ensure workspace root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.config import parse_cors_origins
from db.connection import normalize_database_url
from backend.malware_scanner import ClamAVMalwareScanner


def test_cors_origins_parsing():
    # 1. Default development behavior when unset
    dev_origins = parse_cors_origins(None, is_prod=False)
    assert dev_origins == ["http://localhost:3000"]

    dev_origins_empty = parse_cors_origins("", is_prod=False)
    assert dev_origins_empty == ["http://localhost:3000"]

    # 2. Production behavior when unset (no silent fallback to localhost)
    prod_origins_unset = parse_cors_origins(None, is_prod=True)
    assert prod_origins_unset == []

    prod_origins_empty = parse_cors_origins("   ", is_prod=True)
    assert prod_origins_empty == []

    # 3. Single origin
    single = parse_cors_origins("https://my-vms.vercel.app", is_prod=True)
    assert single == ["https://my-vms.vercel.app"]

    # 4. Multiple comma-separated origins with whitespace and trailing comma
    multiple = parse_cors_origins("  https://my-vms.vercel.app , https://vms.example.com , ", is_prod=True)
    assert multiple == ["https://my-vms.vercel.app", "https://vms.example.com"]

    # 5. Exact origin strings preserved
    exact = parse_cors_origins("https://vms.app:8443,http://internal.vms", is_prod=False)
    assert exact == ["https://vms.app:8443", "http://internal.vms"]


def test_health_endpoint():
    from backend.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_database_url_normalization():
    # 1. postgres:// URL scheme normalization
    normalized = normalize_database_url("postgres://vms_user:secret_pass@db.railway.internal:5432/railway?sslmode=require")
    assert normalized == "postgresql://vms_user:secret_pass@db.railway.internal:5432/railway?sslmode=require"

    # 2. postgresql:// URL scheme preserved exactly
    already_valid = normalize_database_url("postgresql://vms_user:secret_pass@db.railway.internal:5432/railway?sslmode=require")
    assert already_valid == "postgresql://vms_user:secret_pass@db.railway.internal:5432/railway?sslmode=require"

    # 3. Other schemes preserved
    sqlite_url = normalize_database_url("sqlite:///scratch/test.db")
    assert sqlite_url == "sqlite:///scratch/test.db"

    # 4. None and empty handled safely
    assert normalize_database_url(None) is None
    assert normalize_database_url("") == ""


def test_clamav_configuration_defaults_and_env():
    # 1. Default values when no env vars set
    with patch.dict(os.environ, {}, clear=True):
        scanner = ClamAVMalwareScanner()
        assert scanner.host == "localhost"
        assert scanner.port == 3310

    # 2. Configured values via environment variables
    with patch.dict(os.environ, {"CLAMAV_HOST": "clamav-service.internal", "CLAMAV_PORT": "3315"}):
        scanner_env = ClamAVMalwareScanner()
        assert scanner_env.host == "clamav-service.internal"
        assert scanner_env.port == 3315

    # 3. Explicit argument overrides
    scanner_explicit = ClamAVMalwareScanner(host="custom.host", port=3320)
    assert scanner_explicit.host == "custom.host"
    assert scanner_explicit.port == 3320


def test_clamav_scanner_socket_connection_and_fail_closed():
    # Verify socket.connect is called with configured host and port without external network calls
    scanner = ClamAVMalwareScanner(host="clamav.service.local", port=3319, timeout=5.0)

    with patch("socket.socket") as mock_socket_class:
        mock_sock = MagicMock()
        mock_socket_class.return_value = mock_sock
        # Simulate clean response
        mock_sock.recv.return_value = b"stream: OK\n"

        status, details = scanner.scan_file(b"%PDF-1.4 test payload")
        assert status == "CLEAN"
        mock_sock.connect.assert_called_once_with(("clamav.service.local", 3319))
        mock_sock.settimeout.assert_called_once_with(5.0)

    # Verify fail-closed behavior when scanner connection fails
    with patch("socket.socket") as mock_socket_class:
        mock_sock = MagicMock()
        mock_socket_class.return_value = mock_sock
        mock_sock.connect.side_effect = ConnectionRefusedError("Connection refused")

        status, details = scanner.scan_file(b"%PDF-1.4 test payload")
        assert status == "ERROR/UNAVAILABLE"
        assert "Connection refused" in details or "offline" in details


if __name__ == "__main__":
    print("Running production preparation tests...")
    test_cors_origins_parsing()
    print("PASS: CORS origins parsing")
    test_health_endpoint()
    print("PASS: Health endpoint")
    test_database_url_normalization()
    print("PASS: Database URL normalization")
    test_clamav_configuration_defaults_and_env()
    print("PASS: ClamAV configuration defaults and env")
    test_clamav_scanner_socket_connection_and_fail_closed()
    print("PASS: ClamAV socket connection and fail-closed behavior")
    print("\nALL 5 FOCUSED PRODUCTION PREPARATION TESTS PASSED!")
