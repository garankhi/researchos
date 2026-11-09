#!/usr/bin/env python3
"""Edit a Jira issue description via the Atlassian MCP server."""
import json
import os
import sys
import urllib.request

STATE = os.path.expanduser("~/.cursor/mcp-atlassian-token.json")
MCP_URL = "https://mcp.atlassian.com/v1/mcp"
CLOUD_ID = "b02f1a89-1d76-4adc-bec8-fb344cbeba6c"
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
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode(errors="replace")
        sid = response.headers.get("Mcp-Session-Id")
    text = "".join(l[6:] for l in raw.splitlines() if l.startswith("data: "))
    return (json.loads(text) if text.strip() else {}), sid


def session():
    _, sid = post(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "jira-edit", "version": "1"},
            },
        }
    )
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def call(sid, tool, arguments):
    result, _ = post(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        },
        sid,
    )
    return result


def main() -> int:
    mode = sys.argv[1]  # "edit" | "create" | "get"
    sid = session()
    if mode == "edit":
        key = sys.argv[2]
        path = sys.argv[3]
        description = open(path).read()
        fields = {}
        if len(sys.argv) > 4:
            fields["summary"] = sys.argv[4]
        fields["description"] = description
        result = call(
            sid,
            "editJiraIssue",
            {
                "cloudId": CLOUD_ID,
                "issueIdOrKey": key,
                "fields": fields,
                "contentFormat": "markdown",
            },
        )
    elif mode == "create":
        key = sys.argv[2]  # parent
        path = sys.argv[3]
        summary = sys.argv[4]
        description = open(path).read()
        result = call(
            sid,
            "createJiraIssue",
            {
                "cloudId": CLOUD_ID,
                "projectKey": "RES",
                "issueTypeName": "Sub-task",
                "parent": key,
                "summary": summary,
                "description": description,
                "contentFormat": "markdown",
            },
        )
    else:
        result = call(
            sid,
            "getJiraIssue",
            {"cloudId": CLOUD_ID, "issueIdOrKey": sys.argv[2]},
        )
    text = json.dumps(result, ensure_ascii=False, indent=2)
    try:
        payload = json.loads(result["result"]["content"][0]["text"])
        if "error" in payload:
            print("ERROR:", json.dumps(payload)[:800])
            return 1
        if mode == "get":
            print(payload["fields"].get("description") or "")
        else:
            print(payload.get("key"), "|", payload["fields"]["summary"])
        return 0
    except Exception:
        print(text[:2000])
        return 1


if __name__ == "__main__":
    sys.exit(main())
