"""
Unit tests for agent_client.py — transport, URL validation, headers, JSON handling.
No live network sockets. Uses unittest.mock to intercept urllib calls.
"""

import gc
import io
import itertools
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
import warnings
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


LOOPBACK_ENV = {
    "SANKYAKU_TOKEN": "ska_test_abc",
    "SANKYAKU_URL": "http://127.0.0.1:3000",
}
ERROR_URL = "http://127.0.0.1:3000/api/agent/channels"


class _TrackingStream(io.BytesIO):
    """Response body stream that records whether it was closed."""

    def __init__(self, data: bytes = b""):
        super().__init__(data)
        self.close_count = 0

    def close(self):
        self.close_count += 1
        super().close()


class _UnreadableStream(_TrackingStream):
    """Stream whose read fails, to exercise the read-failure branch."""

    def read(self, *args, **kwargs):
        raise OSError("stream failure")


class _FakeResponse:
    """Minimal urllib-like response around a stream, tracking closure."""

    def __init__(self, code: int, fp, msg: str = "OK"):
        self.code = code
        self.msg = msg
        self.fp = fp
        self.close_count = 0

    def getcode(self):
        return self.code

    def info(self):
        return {}

    def read(self, *args):
        return self.fp.read(*args)

    def close(self):
        self.close_count += 1
        self.fp.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.close()
        return False


class TestResponseClosure(unittest.TestCase):
    """Error and refused-redirect responses must be closed before exiting."""

    def _run_request(self, error):
        """Drive _request against a raising opener; return stderr text."""
        with mock.patch.object(agent_client, "_build_opener") as opener, mock.patch(
            "sys.stderr", new_callable=io.StringIO
        ) as stderr:
            opener.return_value.open.side_effect = error
            with self.assertRaises(SystemExit):
                agent_client._request("GET", "channels")
        return stderr.getvalue()

    @mock.patch.dict(os.environ, LOOPBACK_ENV, clear=False)
    def test_http_error_json_body_closed(self):
        """A JSON error body is read, reported, and then closed."""
        stream = _TrackingStream(b'{"error": "Unauthorized"}')
        error = urllib.error.HTTPError(ERROR_URL, 401, "Unauthorized", {}, stream)

        stderr = self._run_request(error)

        self.assertTrue(stream.closed)
        self.assertGreaterEqual(stream.close_count, 1)
        self.assertIn("HTTP 401: Unauthorized", stderr)

    @mock.patch.dict(os.environ, LOOPBACK_ENV, clear=False)
    def test_malformed_error_body_closed(self):
        """Non-JSON, non-UTF-8 and unreadable error bodies are still closed."""
        cases = [
            _TrackingStream(b"not json"),
            _TrackingStream(b"\xff"),
            _UnreadableStream(b"unused"),
        ]
        for stream in cases:
            with self.subTest(stream=type(stream).__name__):
                error = urllib.error.HTTPError(ERROR_URL, 500, "Boom", {}, stream)

                stderr = self._run_request(error)

                self.assertTrue(stream.closed)
                self.assertGreaterEqual(stream.close_count, 1)
                self.assertIn("HTTP 500:", stderr)

    @mock.patch.dict(os.environ, LOOPBACK_ENV, clear=False)
    def test_error_body_with_token_is_redacted_and_closed(self):
        """Redaction still applies when the body echoes the token."""
        with mock.patch.dict(os.environ, {"SANKYAKU_TOKEN": "private-token"}):
            stream = _TrackingStream(b'{"error": "bad token private-token"}')
            error = urllib.error.HTTPError(ERROR_URL, 403, "Forbidden", {}, stream)

            stderr = self._run_request(error)

        self.assertTrue(stream.closed)
        self.assertNotIn("private-token", stderr)
        self.assertIn("[redacted]", stderr)

    def test_redirect_rejection_closes_response(self):
        """A refused redirect is closed by the handler, which still exits."""
        stream = _TrackingStream(b"redirect body")
        response = _FakeResponse(302, stream, msg="Found")
        handler = agent_client._NoRedirectHandler()

        with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            with self.assertRaises(SystemExit):
                handler.http_response(mock.MagicMock(), response)

        self.assertGreaterEqual(response.close_count, 1)
        self.assertTrue(stream.closed)
        self.assertIn("Server returned redirect (302), refusing to follow", stderr.getvalue())

    def test_success_response_passes_through_open(self):
        """Non-redirect responses are handed to the caller still open."""
        stream = _TrackingStream(b"{}")
        response = _FakeResponse(200, stream)
        handler = agent_client._NoRedirectHandler()
        handler.parent = mock.MagicMock()

        self.assertIs(handler.http_response(mock.MagicMock(), response), response)

        self.assertEqual(response.close_count, 0)
        self.assertFalse(stream.closed)

    def test_close_response_tolerates_failures(self):
        """A response that cannot be closed must not mask the original error."""
        response = mock.MagicMock()
        response.close.side_effect = OSError("already gone")
        agent_client._close_response(response)
        agent_client._close_response(object())


class TestNoResourceWarnings(unittest.TestCase):
    """The error and redirect paths must not leak real file resources."""

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._counter = itertools.count()

    def _real_stream(self, data: bytes):
        """Real file object: emits ResourceWarning if left unclosed."""
        path = os.path.join(self._tmpdir.name, f"body-{next(self._counter)}")
        with open(path, "wb") as handle:
            handle.write(data)
        return open(path, "rb")

    def _assert_no_resource_warning(self, run):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            run()
            gc.collect()
        leaked = [str(w.message) for w in caught if w.category is ResourceWarning]
        self.assertEqual(leaked, [])

    @mock.patch.dict(os.environ, LOOPBACK_ENV, clear=False)
    def test_http_error_paths_emit_no_resource_warning(self):
        for data in [b'{"error": "nope"}', b"not json", b"\xff"]:
            with self.subTest(data=data):

                def run(data=data):
                    error = urllib.error.HTTPError(
                        ERROR_URL, 500, "Boom", {}, self._real_stream(data)
                    )
                    with mock.patch.object(
                        agent_client, "_build_opener"
                    ) as opener, mock.patch("sys.stderr", new_callable=io.StringIO):
                        opener.return_value.open.side_effect = error
                        try:
                            agent_client._request("GET", "channels")
                        except SystemExit:
                            pass
                    del error

                self._assert_no_resource_warning(run)

    def test_redirect_rejection_emits_no_resource_warning(self):
        def run():
            response = _FakeResponse(302, self._real_stream(b"redirect body"))
            handler = agent_client._NoRedirectHandler()
            with mock.patch("sys.stderr", new_callable=io.StringIO):
                try:
                    handler.http_response(mock.MagicMock(), response)
                except SystemExit:
                    pass
            del response

        self._assert_no_resource_warning(run)


if __name__ == "__main__":
    unittest.main()
