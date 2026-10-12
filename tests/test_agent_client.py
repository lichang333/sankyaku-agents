"""
Unit tests for agent_client.py — transport, URL validation, headers, JSON handling.
No live network sockets. Uses unittest.mock to intercept urllib calls.
"""

import io
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from unittest import mock

# Ensure scripts/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import agent_client  # noqa: E402


class TestUrlValidation(unittest.TestCase):
    """Test _validate_url enforces loopback-only HTTP and HTTPS elsewhere."""

    def test_http_loopback_allowed(self):
        """HTTP to 127.0.0.1 and localhost is allowed."""
        agent_client._validate_url("http://127.0.0.1:3000/api/agent/channels")
        agent_client._validate_url("http://localhost:3000/api/agent/channels")

    def test_http_remote_rejected(self):
        """HTTP to a remote host should exit."""
        with self.assertRaises(SystemExit):
            agent_client._validate_url("http://example.com/api/agent/channels")

    def test_https_remote_allowed(self):
        """HTTPS to a remote host is allowed."""
        agent_client._validate_url("https://example.com/api/agent/channels")

    def test_ftp_rejected(self):
        """Non-HTTP/HTTPS schemes should exit."""
        with self.assertRaises(SystemExit):
            agent_client._validate_url("ftp://example.com/file")


class TestTokenHandling(unittest.TestCase):
    """Verify token is never printed, placed in URL, or leaked."""

    @mock.patch.dict(os.environ, {"SANKYAKU_TOKEN": ""}, clear=False)
    def test_missing_token_exits(self):
        """Missing token should cause a clean exit."""
        with self.assertRaises(SystemExit):
            agent_client._token()

    @mock.patch.dict(os.environ, {"SANKYAKU_TOKEN": "ska_test_secret"}, clear=False)
    def test_token_in_header_not_url(self):
        """Token must appear in Authorization header, never in URL."""
        # We'll capture the request that _request builds
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b'{"ok": true}'
        fake_response.getcode.return_value = 200
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            agent_client._request("GET", "channels")

            # Check the request object
            call_args = opener_instance.open.call_args
            req_obj = call_args[0][0]

            self.assertIn("Bearer", req_obj.get_header("Authorization"))
            self.assertNotIn("ska_test_secret", req_obj.full_url)


class TestRequestBuilding(unittest.TestCase):
    """Test that _request builds proper requests."""

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_get_request(self):
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b'[{"id":1}]'
        fake_response.getcode.return_value = 200
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            result = agent_client._request("GET", "channels")

            self.assertEqual(result, [{"id": 1}])
            req_obj = opener_instance.open.call_args[0][0]
            self.assertEqual(req_obj.get_method(), "GET")
            self.assertTrue(req_obj.full_url.endswith("/api/agent/channels"))

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_post_request_with_body(self):
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b'{"id":1}'
        fake_response.getcode.return_value = 201
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            result = agent_client._request(
                "POST", "channels/1/messages", body={"text": "hello"}
            )

            self.assertEqual(result, {"id": 1})
            req_obj = opener_instance.open.call_args[0][0]
            self.assertEqual(req_obj.get_method(), "POST")
            body_data = json.loads(req_obj.data.decode("utf-8"))
            self.assertEqual(body_data, {"text": "hello"})

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_query_params(self):
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b"[]"
        fake_response.getcode.return_value = 200
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            agent_client._request(
                "GET", "channels/1/messages", params={"after": "0", "limit": "50"}
            )

            req_obj = opener_instance.open.call_args[0][0]
            self.assertIn("after=0", req_obj.full_url)
            self.assertIn("limit=50", req_obj.full_url)

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_none_params_excluded(self):
        """None values in params should not appear in the URL."""
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b"[]"
        fake_response.getcode.return_value = 200
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            agent_client._request(
                "GET", "channels/1/messages", params={"after": None, "limit": "50"}
            )

            req_obj = opener_instance.open.call_args[0][0]
            self.assertNotIn("after", req_obj.full_url)
            self.assertIn("limit=50", req_obj.full_url)


class TestErrorHandling(unittest.TestCase):
    """Test error handling in _request."""

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_http_error_exits(self):
        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            error_body = b'{"error": "Unauthorized"}'
            opener_instance.open.side_effect = urllib.error.HTTPError(
                "http://127.0.0.1:3000/api/agent/channels",
                401,
                "Unauthorized",
                {},
                io.BytesIO(error_body),
            )
            mock_opener.return_value = opener_instance

            with self.assertRaises(SystemExit):
                agent_client._request("GET", "channels")

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_connection_error_exits(self):
        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.side_effect = urllib.error.URLError("Connection refused")
            mock_opener.return_value = opener_instance

            with self.assertRaises(SystemExit):
                agent_client._request("GET", "channels")


class TestBaseUrl(unittest.TestCase):
    """Test _base_url configuration."""

    @mock.patch.dict(os.environ, {}, clear=False)
    def test_default_url(self):
        # Remove SANKYAKU_URL if set
        os.environ.pop("SANKYAKU_URL", None)
        self.assertEqual(agent_client._base_url(), "http://127.0.0.1:3000")

    @mock.patch.dict(
        os.environ, {"SANKYAKU_URL": "https://my-server.example.com/"}, clear=False
    )
    def test_custom_url(self):
        self.assertEqual(agent_client._base_url(), "https://my-server.example.com")


class TestArgparse(unittest.TestCase):
    """Test CLI argument parsing."""

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_channels_command(self):
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b"[]"
        fake_response.getcode.return_value = 200
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            with mock.patch("sys.stdout", new_callable=io.StringIO):
                agent_client.main(["channels"])

    @mock.patch.dict(
        os.environ,
        {"SANKYAKU_TOKEN": "ska_test_abc", "SANKYAKU_URL": "http://127.0.0.1:3000"},
        clear=False,
    )
    def test_send_command(self):
        fake_response = mock.MagicMock()
        fake_response.read.return_value = b'{"id":1}'
        fake_response.getcode.return_value = 201
        fake_response.__enter__ = mock.MagicMock(return_value=fake_response)
        fake_response.__exit__ = mock.MagicMock(return_value=False)

        with mock.patch.object(agent_client, "_build_opener") as mock_opener:
            opener_instance = mock.MagicMock()
            opener_instance.open.return_value = fake_response
            mock_opener.return_value = opener_instance

            with mock.patch("sys.stdout", new_callable=io.StringIO):
                agent_client.main(["send", "1", "Hello world", "--kind", "question"])

            req_obj = opener_instance.open.call_args[0][0]
            body_data = json.loads(req_obj.data.decode("utf-8"))
            self.assertEqual(body_data["text"], "Hello world")
            self.assertEqual(body_data["kind"], "question")


class TestRedirectProtection(unittest.TestCase):
    """Test that redirects are not followed."""

    def test_redirect_handler(self):
        handler = agent_client._NoRedirectHandler()
        response = mock.MagicMock()
        response.getcode.return_value = 302

        with self.assertRaises(SystemExit):
            handler.http_response(mock.MagicMock(), response)


class TestMalformedTransport(unittest.TestCase):
    def test_bad_urls(self):
        for value in ["https://", "http://[bad", "https://user:pass@example.com", "https://example.com/#fragment"]:
            with self.subTest(value=value), self.assertRaises(SystemExit):
                agent_client._validate_url(value)

    @mock.patch.dict(os.environ, {"SANKYAKU_TOKEN": "private-token", "SANKYAKU_URL": "http://127.0.0.1:3000"})
    def test_invalid_response_and_redacted_errors(self):
        for raw in [b"not json", b"\xff"]:
            response = mock.MagicMock()
            response.read.return_value = raw
            response.__enter__.return_value = response
            with mock.patch.object(agent_client, "_build_opener") as opener:
                opener.return_value.open.return_value = response
                with self.assertRaises(SystemExit):
                    agent_client._request("GET", "channels")
        with mock.patch.object(agent_client, "_build_opener") as opener, mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            opener.return_value.open.side_effect = urllib.error.URLError("private-token")
            with self.assertRaises(SystemExit):
                agent_client._request("GET", "channels")
            self.assertNotIn("private-token", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
