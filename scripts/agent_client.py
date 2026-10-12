#!/usr/bin/env python3
"""
Sankyaku Agent CLI — communication-only client for the Agent API.

Uses Python standard library only (no third-party packages).
Token from SANKYAKU_TOKEN env var; base URL from SANKYAKU_URL.
Never prints the token. Never places token in URL.
Disallows credential forwarding through redirects.
Only allows HTTP for loopback addresses; requires HTTPS otherwise.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def _base_url() -> str:
    value = os.environ.get("SANKYAKU_URL", "http://127.0.0.1:3000").rstrip("/")
    _validate_url(value)
    if urllib.parse.urlparse(value).query:
        _fail("SANKYAKU_URL must not contain a query")
    return value


def _token() -> str:
    tok = os.environ.get("SANKYAKU_TOKEN", "")
    if not tok:
        print("Error: SANKYAKU_TOKEN environment variable is not set", file=sys.stderr)
        sys.exit(1)
    return tok


def _fail(message: str) -> None:
    token = os.environ.get("SANKYAKU_TOKEN", "")
    if token:
        message = message.replace(token, "[redacted]")
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(1)


def _close_response(response) -> None:
    """Release an HTTP response's underlying socket, ignoring close failures."""
    close = getattr(response, "close", None)
    if close is None:
        return
    try:
        close()
    except Exception:
        pass


def _validate_url(url: str) -> None:
    """Ensure URL scheme is safe: HTTP only for loopback, HTTPS otherwise."""
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ""
        parsed.port
        if not host or parsed.username is not None or parsed.password is not None or parsed.fragment:
            _fail("URL must have a host and no credentials or fragment")
    except ValueError:
        _fail("Invalid server URL")
    scheme = parsed.scheme.lower()

    loopback = host in ("127.0.0.1", "localhost", "::1", "[::1]")

    if scheme == "http" and not loopback:
        print(
            f"Error: HTTP is only allowed for loopback addresses, got {host}",
            file=sys.stderr,
        )
        sys.exit(1)

    if scheme not in ("http", "https"):
        print(f"Error: Unsupported URL scheme: {scheme}", file=sys.stderr)
        sys.exit(1)


class _NoRedirectHandler(urllib.request.HTTPErrorProcessor):
    """Prevent automatic redirect following to avoid credential leakage."""

    def http_response(self, request, response):  # type: ignore[override]
        code = response.getcode()
        if 300 <= code < 400:
            # The caller never sees this response, so close it here.
            _close_response(response)
            print(
                f"Error: Server returned redirect ({code}), refusing to follow",
                file=sys.stderr,
            )
            sys.exit(1)
        return super().http_response(request, response)

    https_response = http_response


def _build_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(_NoRedirectHandler)


def _request(
    method: str,
    path: str,
    body: dict | None = None,
    params: dict | None = None,
) -> dict:
    """Make an API request and return parsed JSON."""
    base = _base_url()
    url = f"{base}/api/agent/{path.lstrip('/')}"

    if params:
        filtered = {k: v for k, v in params.items() if v is not None}
        if filtered:
            url += "?" + urllib.parse.urlencode(filtered)

    _validate_url(url)

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {_token()}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")

    opener = _build_opener()

    try:
        with opener.open(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            try:
                err_body = e.read().decode("utf-8")
                err_json = json.loads(err_body)
                msg = err_json.get("error", err_body)
            except Exception:
                msg = str(e)
        finally:
            # _fail raises SystemExit, so close the error body first.
            _close_response(e)
        _fail(f"HTTP {e.code}: {msg}")
    except urllib.error.URLError as e:
        _fail(f"Connection error: {e.reason}")
    except TimeoutError:
        _fail("Request timed out")
    except (ValueError, UnicodeError):
        _fail("Server returned invalid JSON or text")
    except OSError:
        _fail("Connection failed")


def cmd_channels(args: argparse.Namespace) -> None:
    """List accessible channels."""
    result = _request("GET", "channels")
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_messages(args: argparse.Namespace) -> None:
    """List messages in a channel."""
    params: dict = {}
    if args.before is not None:
        params["before"] = str(args.before)
    if args.latest:
        params["latest"] = "1"
    if args.after is not None:
        params["after"] = str(args.after)
    if args.limit is not None:
        params["limit"] = str(args.limit)
    result = _request("GET", f"channels/{args.channel}/messages", params=params)
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_send(args: argparse.Namespace) -> None:
    """Send a message to a channel."""
    body: dict = {"text": args.text}
    if args.kind:
        body["kind"] = args.kind
    if args.reply_to is not None:
        body["replyTo"] = args.reply_to
    if args.card is not None:
        body["cardId"] = args.card
    if args.client_id:
        body["clientId"] = args.client_id
    result = _request("POST", f"channels/{args.channel}/messages", body=body)
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_handoffs(args: argparse.Namespace) -> None:
    """List handoffs in a channel."""
    result = _request("GET", f"channels/{args.channel}/handoffs")
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_handoff(args: argparse.Namespace) -> None:
    """Create a handoff in a channel."""
    body: dict = {"toAgentId": args.to_agent, "brief": args.brief}
    if args.card is not None:
        body["cardId"] = args.card
    if args.client_id:
        body["clientId"] = args.client_id
    result = _request("POST", f"channels/{args.channel}/handoffs", body=body)
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_inbox(args: argparse.Namespace) -> None:
    """Show agent inbox."""
    result = _request("GET", "inbox")
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_accept(args: argparse.Namespace) -> None:
    """Accept a handoff."""
    result = _request("POST", f"handoffs/{args.handoff_id}/accept", body={})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_decline(args: argparse.Namespace) -> None:
    """Decline a handoff."""
    result = _request("POST", f"handoffs/{args.handoff_id}/decline", body={})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_complete(args: argparse.Namespace) -> None:
    """Complete a handoff."""
    result = _request("POST", f"handoffs/{args.handoff_id}/complete", body={"result": args.result})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="agent_client",
        description="Sankyaku Agent CLI — communicate with the Agent API",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("channels", help="List accessible channels")
    members = sub.add_parser("members", help="List currently authorized agents")
    members.add_argument("channel", type=int)

    p_messages = sub.add_parser("messages", help="List messages in a channel")
    p_messages.add_argument("channel", type=int, help="Channel ID")
    cursors = p_messages.add_mutually_exclusive_group()
    cursors.add_argument("--after", type=int, default=None, help="After message ID")
    cursors.add_argument("--before", type=int, default=None, help="Before message ID")
    cursors.add_argument("--latest", action="store_true", help="Latest messages")
    p_messages.add_argument("--limit", type=int, default=None, help="Max messages (1-100)")

    p_send = sub.add_parser("send", help="Send a message")
    p_send.add_argument("channel", type=int, help="Channel ID")
    p_send.add_argument("text", help="Message text")
    p_send.add_argument("--kind", choices=["discussion", "question", "decision", "result"])
    p_send.add_argument("--reply-to", type=int, default=None, help="Reply to message ID")
    p_send.add_argument("--card", type=int, default=None, help="Card ID reference")
    p_send.add_argument("--client-id", default=None, help="Idempotency key")

    p_handoffs = sub.add_parser("handoffs", help="List handoffs in a channel")
    p_handoffs.add_argument("channel", type=int, help="Channel ID")

    p_handoff = sub.add_parser("handoff", help="Create a handoff")
    p_handoff.add_argument("channel", type=int, help="Channel ID")
    p_handoff.add_argument("to_agent", help="Target agent ID")
    p_handoff.add_argument("brief", help="Handoff brief")
    p_handoff.add_argument("--card", type=int, default=None, help="Card ID reference")
    p_handoff.add_argument("--client-id", default=None, help="Idempotency key")

    sub.add_parser("inbox", help="Show agent inbox")

    p_accept = sub.add_parser("accept", help="Accept a handoff")
    p_accept.add_argument("handoff_id", type=int, help="Handoff ID")

    p_decline = sub.add_parser("decline", help="Decline a handoff")
    p_decline.add_argument("handoff_id", type=int, help="Handoff ID")

    p_complete = sub.add_parser("complete", help="Complete a handoff")
    p_complete.add_argument("handoff_id", type=int, help="Handoff ID")
    p_complete.add_argument("result", help="Result summary")

    args = parser.parse_args(argv)

    commands = {
        "channels": cmd_channels,
        "members": lambda a: print(json.dumps(_request("GET", f"channels/{a.channel}/agents"), indent=2, ensure_ascii=False)),
        "messages": cmd_messages,
        "send": cmd_send,
        "handoffs": cmd_handoffs,
        "handoff": cmd_handoff,
        "inbox": cmd_inbox,
        "accept": cmd_accept,
        "decline": cmd_decline,
        "complete": cmd_complete,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
