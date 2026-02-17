# MCP Server Patterns: Wrapping APIs for Claude Desktop

## What Is MCP?

The Model Context Protocol (MCP) lets AI assistants like Claude Desktop call tools on external servers. You build a server that exposes tools (functions with typed parameters), and Claude can invoke them during conversations. This turns any API into a conversational interface.

## Why Build an MCP Server?

If you have a data API (Geotab, Salesforce, your own backend), an MCP server lets users query it with natural language:

- "How many speeding events happened yesterday?"
- "Which driver has the worst safety record?"
- "Show me the fleet KPIs for the last two weeks"

Claude translates the question into tool calls, your MCP server calls the API, and Claude summarizes the results for the user.

## The Geoff MCP Server

6 tools for fleet management via Claude Desktop:

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `get_safety_events` | Recent safety events with GPS | MyGeotab API |
| `get_fleet_kpis` | Fleet-wide metrics and trends | OData Data Connector |
| `get_driver_rankings` | Driver safety rankings | OData Data Connector |
| `get_vehicle_details` | Individual vehicle info + events | MyGeotab API + OData |
| `get_driver_history` | Driver event patterns over time | MyGeotab API + OData |
| `ask_ace` | Natural language fleet queries | Ace AI |

## FastMCP Quickstart

[FastMCP](https://github.com/jlowin/fastmcp) is a Python framework that handles the MCP protocol. You just write functions:

```python
from fastmcp import FastMCP

mcp = FastMCP("My Fleet Data", instructions="""
You are a fleet assistant. Use these tools to answer questions:
- get_safety_events: Recent safety incidents
- get_fleet_kpis: Fleet-wide overview
""")

@mcp.tool()
async def get_safety_events(days: int = 1, driver_name: str | None = None) -> str:
    """Fetch enriched safety events with GPS locations and speed data.

    Args:
        days: Number of days to look back (default 1, max 7)
        driver_name: Optional filter — only events for this driver
    """
    events = await fetch_events(days)
    if driver_name:
        events = [e for e in events if driver_name.lower() in e["driverName"].lower()]
    return json.dumps({"count": len(events), "events": events}, indent=2)

if __name__ == "__main__":
    mcp.run()
```

**Key patterns:**
- Type hints on parameters → Claude knows what arguments to pass
- Docstring → Claude knows when to use this tool
- Return a JSON string → Claude can parse and summarize
- `instructions` on the server → guides Claude's tool selection

## Design Patterns

### Pattern 1: Lazy Client Initialization

Don't connect to APIs on import. Initialize clients on first use:

```python
_client: ApiClient | None = None

def _get_client() -> ApiClient:
    global _client
    if _client is None:
        _client = ApiClient(
            username=os.environ["API_USERNAME"],
            password=os.environ["API_PASSWORD"],
        )
    return _client
```

**Why:** MCP servers may be started by Claude Desktop before any tool is called. Lazy initialization avoids connection errors on startup and reduces startup time.

### Pattern 2: Structured JSON Returns

Always return JSON strings, not raw text:

```python
@mcp.tool()
async def get_fleet_kpis() -> str:
    """Get fleet-wide KPIs for the last 14 days."""
    data = await fetch_analytics()
    return json.dumps(data["summary"], indent=2, default=str)
```

**Why:** Claude parses JSON better than free-form text. Structured data lets Claude compare values, sort results, and generate tables.

### Pattern 3: Parameter Validation Inside the Tool

```python
@mcp.tool()
async def get_safety_events(days: int = 1) -> str:
    """Fetch safety events.

    Args:
        days: Number of days to look back (default 1, max 7)
    """
    days = min(max(days, 1), 7)  # Clamp to valid range
    # ...
```

**Why:** Claude might pass unexpected values. Clamp rather than error — return useful data even with bad inputs.

### Pattern 4: Parallel Data Fetching

When a tool needs data from multiple sources, fetch in parallel:

```python
@mcp.tool()
async def get_vehicle_details(vehicle_name: str) -> str:
    """Get details for a specific vehicle."""
    geotab = _get_geotab()
    odata = _get_odata()

    # Fetch from both sources simultaneously
    events_task = geotab.api_call("Get", {"typeName": "ExceptionEvent", ...})
    kpis_task = odata.fetch_vehicle_kpis(vehicle_name)

    events, kpis = await asyncio.gather(events_task, kpis_task)

    return json.dumps({"events": events, "kpis": kpis}, indent=2)
```

### Pattern 5: The "Ask AI" Escape Hatch

Include one tool that handles queries your structured tools can't:

```python
@mcp.tool()
async def ask_ace(question: str) -> str:
    """Query Geotab's Ace AI with a natural language question.
    This is slower (up to 60s) but handles complex analytical questions.

    Args:
        question: The natural language question to ask
    """
    result = await client.query_ace_ai(question)
    return json.dumps({"insight": result})
```

**Why:** You can't anticipate every question. The escape hatch handles the long tail.

### Pattern 6: Filtering in the Tool

Let Claude pass optional filters instead of fetching everything:

```python
@mcp.tool()
async def get_safety_events(
    days: int = 1,
    driver_name: str | None = None,
    event_type: str | None = None,
) -> str:
    """Fetch safety events with optional filters.

    Args:
        days: Number of days to look back (default 1, max 7)
        driver_name: Optional filter by driver name (partial match)
        event_type: Optional filter by type ('speeding', 'hard_brake', etc.)
    """
    events = await fetch_events(days)

    if driver_name:
        needle = driver_name.lower()
        events = [e for e in events if needle in e.get("driverName", "").lower()]

    if event_type:
        needle = event_type.lower()
        events = [e for e in events if needle in e.get("type", "").lower()]

    return json.dumps({"count": len(events), "events": events})
```

**Why:** Claude will figure out which filters to apply based on the user's question. "Show me Demo-09's speeding events" → `driver_name="Demo-09", event_type="speeding"`.

## Server Instructions

The `instructions` parameter tells Claude how to use your tools:

```python
INSTRUCTIONS = """\
You are a fleet safety assistant with access to Geotab telematics data.

- **get_safety_events**: For questions about recent safety incidents
- **get_fleet_kpis**: For fleet-wide overview questions
- **get_driver_rankings**: For comparing drivers
- **get_vehicle_details**: For questions about a specific vehicle
- **get_driver_history**: For questions about a specific driver
- **ask_ace**: For complex analytical questions (slower, up to 60s)

Always prefer structured tools for straightforward queries.
Use ask_ace for open-ended or analytical questions.
"""

mcp = FastMCP("Geoff Fleet Data", instructions=INSTRUCTIONS)
```

**Tips:**
- Tell Claude which tool to use for which type of question
- Mention latency if tools are slow (`ask_ace` up to 60s)
- Suggest a preference order (structured tools before escape hatch)

## Claude Desktop Configuration

Add your MCP server to Claude Desktop's config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "geoff-fleet": {
      "command": "python3",
      "args": ["/path/to/mcp-server/server.py"],
      "env": {
        "GEOTAB_DATABASE": "your_database",
        "GEOTAB_USERNAME": "your_username",
        "GEOTAB_PASSWORD": "your_password"
      }
    }
  }
}
```

**Environment variables in the config** — don't hardcode credentials in the server code.

## Testing

Add a test mode to your server:

```python
async def _run_test():
    """Quick smoke test — calls each tool and prints results."""
    print("Testing get_safety_events...")
    result = await get_safety_events.fn(days=1)
    data = json.loads(result)
    print(f"  -> {data.get('count', 'error')} events")

    print("\nTesting get_fleet_kpis...")
    result = await get_fleet_kpis.fn()
    data = json.loads(result)
    print(f"  -> fleet: {data.get('fleet', 'error')}")

    print("\nAll tests complete.")

def main():
    if "--test" in sys.argv:
        asyncio.run(_run_test())
    else:
        mcp.run()
```

**The `.fn` accessor** on FastMCP tools gives you the underlying function for direct testing. Run with `python3 server.py --test` to verify all tools work before connecting to Claude Desktop.

## Tool Design Checklist

- [ ] Clear docstring describing when to use this tool
- [ ] Type hints on all parameters (Claude reads these)
- [ ] Default values for optional parameters
- [ ] Input validation with clamping (not errors)
- [ ] JSON string return type
- [ ] Error handling that returns JSON error objects (not exceptions)
- [ ] Async for I/O-bound operations
- [ ] Reasonable timeout protection

## Summary

An MCP server turns any API into a conversational interface. The pattern is simple:

1. Pick a framework (FastMCP for Python)
2. Write tools as async functions with type hints and docstrings
3. Return structured JSON
4. Add server instructions to guide Claude's tool selection
5. Configure in Claude Desktop

6 tools took about 400 lines of Python. The value is disproportionate — fleet managers can now ask natural language questions about their data from any MCP-compatible AI assistant.
