#!/usr/bin/env python3
"""Call the Atlassian MCP server (streamable HTTP) with the cached OAuth token.

Uses the same token file as ~/.cursor/scripts/refresh-atlassian-mcp-token.py.
"""
import json
import os
import sys
import urllib.error
import urllib.request

STATE = os.path.expanduser("~/.cursor/mcp-atlassian-token.json")
MCP_URL = "https://mcp.atlassian.com/v1/mcp"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def post(payload, session_id=None):
    token = json.load(open(STATE))["access_token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Mcp-Protocol-Version": "2025-06-18",
        "User-Agent": USER_AGENT,
        "Origin": "https://mcp.atlassian.com",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    request = urllib.request.Request(
        MCP_URL, data=json.dumps(payload).encode(), headers=headers
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode(errors="replace")
        sid = response.headers.get("Mcp-Session-Id")
    text = ""
    for line in raw.splitlines():
        if line.startswith("data: "):
            text += line[6:]
    if not text.strip():
        return {"_empty": True}, sid
    return json.loads(text), sid


def call_tool(name, arguments, session_id):
    result, _ = post(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
        session_id,
    )
    return result


def main() -> int:
    tool = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    _, sid = post(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "script", "version": "1"},
            },
        }
    )
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    result = call_tool(tool, args, sid)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
