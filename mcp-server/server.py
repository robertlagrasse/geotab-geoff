"""Geoff MCP Server — Geotab fleet data tools for Claude Desktop."""

import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from parent functions/ dir or local .env
_this_dir = Path(__file__).resolve().parent
load_dotenv(_this_dir.parent / "functions" / ".env")
load_dotenv()

from fastmcp import FastMCP
from geotab_client import GeotabClient, BUILTIN_RULES, RULE_CATEGORIES, _get_id
from odata_client import ODataClient

INSTRUCTIONS = """\
You are a fleet safety assistant with access to Geotab telematics data. Use these tools to answer questions about fleet operations:

- **get_safety_events**: For questions about recent safety incidents, harsh braking, speeding, seatbelt violations. Supports filtering by driver name and event type.
- **get_fleet_kpis**: For fleet-wide overview questions — total distance, drive hours, idle percentage, safety score, trip counts over 14 days.
- **get_driver_rankings**: For comparing drivers — who has the most/fewest events, best/worst safety scores. Sortable by total_events or safety_score.
- **get_vehicle_details**: For questions about a specific vehicle — its info, recent events, and KPIs.
- **get_driver_history**: For questions about a specific driver — their event patterns and safety trend over time.
- **ask_ace**: For complex analytical questions that need Geotab's Ace AI — pattern analysis, predictions, deep insights. This tool is slower (up to 60s) but handles nuanced questions.

Always prefer structured tools (get_safety_events, get_fleet_kpis, etc.) for straightforward queries. Use ask_ace for open-ended or analytical questions.
"""

mcp = FastMCP("Geoff Fleet Data", instructions=INSTRUCTIONS)

# Shared clients (created lazily per-event-loop)
_geotab: GeotabClient | None = None
_odata: ODataClient | None = None


def _get_geotab() -> GeotabClient:
    global _geotab
    if _geotab is None:
        _geotab = GeotabClient()
    return _geotab


def _get_odata() -> ODataClient:
    global _odata
    if _odata is None:
        _odata = ODataClient()
    return _odata


def _json(obj) -> str:
    return json.dumps(obj, indent=2, default=str)


# ------------------------------------------------------------------
# Tool 1: Safety Events
# ------------------------------------------------------------------
@mcp.tool()
async def get_safety_events(
    days: int = 1,
    driver_name: str | None = None,
    event_type: str | None = None,
) -> str:
    """Fetch enriched safety events (harsh braking, speeding, seatbelt, etc.) with GPS locations and speed data.

    Args:
        days: Number of days to look back (default 1, max 7)
        driver_name: Optional filter — only events for this driver (partial match)
        event_type: Optional filter — event category like 'speeding', 'hard_brake', 'seatbelt', 'harsh_cornering'
    """
    try:
        days = min(max(days, 1), 7)
        client = _get_geotab()
        events = await client.fetch_safety_events(days=days)

        if driver_name:
            needle = driver_name.lower()
            events = [e for e in events if needle in e.get("driverName", "").lower()]

        if event_type:
            needle = event_type.lower()
            events = [e for e in events if needle in e.get("type", "").lower()]

        return _json({
            "count": len(events),
            "period": f"last {days} day(s)",
            "filters": {"driver_name": driver_name, "event_type": event_type},
            "events": events,
        })
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Tool 2: Fleet KPIs
# ------------------------------------------------------------------
@mcp.tool()
async def get_fleet_kpis() -> str:
    """Get fleet-wide KPIs for the last 14 days: total distance, drive hours, idle percentage, safety score, trip counts, and daily trends."""
    try:
        client = _get_odata()
        analytics = await client.fetch_fleet_analytics()
        return _json(analytics["summary"])
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Tool 3: Driver Rankings
# ------------------------------------------------------------------
@mcp.tool()
async def get_driver_rankings(
    sort_by: str = "total_events",
    limit: int = 20,
) -> str:
    """Rank drivers by safety performance over the last 14 days.

    Args:
        sort_by: 'total_events' (most events first) or 'safety_score' (lowest score first)
        limit: Max number of drivers to return (default 20)
    """
    try:
        client = _get_odata()
        rows = await client.fetch_driver_safety()

        # Aggregate per driver
        driver_scores: dict[str, dict] = {}
        for row in rows:
            name = row.get("Driver_Name", "")
            if not name:
                continue
            if name not in driver_scores:
                driver_scores[name] = {
                    "name": name,
                    "totalEvents": 0,
                    "harshBraking": 0,
                    "harshCornering": 0,
                    "speeding": 0,
                    "latestScore": None,
                    "latestDate": None,
                }
            ds = driver_scores[name]
            brakes = row.get("HarshBraking_Count", 0)
            corners = row.get("HarshCornering_Count", 0)
            speeding = row.get("Speeding_Count", 0)
            ds["totalEvents"] += brakes + corners + speeding
            ds["harshBraking"] += brakes
            ds["harshCornering"] += corners
            ds["speeding"] += speeding
            if not ds["latestDate"] or row.get("Local_Date", "") > ds["latestDate"]:
                ds["latestScore"] = row.get("Safety_Score")
                ds["latestDate"] = row.get("Local_Date")

        rankings = list(driver_scores.values())

        if sort_by == "safety_score":
            rankings.sort(key=lambda d: d.get("latestScore") or 999)
        else:
            rankings.sort(key=lambda d: d["totalEvents"], reverse=True)

        rankings = rankings[:limit]

        return _json({
            "sort_by": sort_by,
            "count": len(rankings),
            "drivers": rankings,
        })
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Tool 4: Vehicle Details
# ------------------------------------------------------------------
@mcp.tool()
async def get_vehicle_details(vehicle_name: str) -> str:
    """Get details for a specific vehicle: device info, recent safety events, and 14-day KPIs.

    Args:
        vehicle_name: The vehicle/device name to look up (e.g. 'Truck 101')
    """
    try:
        geotab = _get_geotab()
        odata = _get_odata()

        # Fetch device info
        devices = await geotab.api_call("Get", {"typeName": "Device"})
        device = None
        needle = vehicle_name.lower()
        for d in (devices or []):
            if needle in d.get("name", "").lower():
                device = d
                break

        if not device:
            return _json({"error": f"Vehicle '{vehicle_name}' not found"})

        # Fetch recent events for this device + OData KPIs in parallel
        from_date = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        events_task = geotab.api_call("Get", {
            "typeName": "ExceptionEvent",
            "search": {
                "deviceSearch": {"id": device["id"]},
                "fromDate": from_date,
            },
            "resultsLimit": 50,
        })
        kpis_task = odata.fetch_vehicle_kpis(device["name"])

        events_raw, vehicle_kpis = await asyncio.gather(events_task, kpis_task)

        # Summarize events by rule
        rule_counts: dict[str, int] = {}
        for e in (events_raw or []):
            rule_id = _get_id(e.get("rule")) or ""
            name = BUILTIN_RULES.get(rule_id, rule_id)
            rule_counts[name] = rule_counts.get(name, 0) + 1

        return _json({
            "vehicle": {
                "id": device["id"],
                "name": device.get("name"),
                "serialNumber": device.get("serialNumber"),
                "vehicleIdentificationNumber": device.get("vehicleIdentificationNumber"),
                "licensePlate": device.get("licensePlate"),
                "comment": device.get("comment"),
            },
            "recentEvents": {
                "period": "last 7 days",
                "totalCount": len(events_raw or []),
                "byType": dict(sorted(rule_counts.items(), key=lambda x: x[1], reverse=True)),
            },
            "kpis": vehicle_kpis,
        })
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Tool 5: Driver History
# ------------------------------------------------------------------
@mcp.tool()
async def get_driver_history(driver_name: str, days: int = 7) -> str:
    """Get a driver's safety event history and trend over time.

    Args:
        driver_name: The driver's name (partial match supported)
        days: Number of days to look back (default 7, max 30)
    """
    try:
        days = min(max(days, 1), 30)
        geotab = _get_geotab()
        odata = _get_odata()

        # Find the driver (User with isDriver)
        users = await geotab.api_call("Get", {"typeName": "User"})
        driver = None
        needle = driver_name.lower()
        for u in (users or []):
            full_name = f"{u.get('firstName', '')} {u.get('lastName', '')}".strip().lower()
            if needle in full_name:
                driver = u
                break

        if not driver:
            return _json({"error": f"Driver '{driver_name}' not found"})

        full_name = f"{driver.get('firstName', '')} {driver.get('lastName', '')}".strip()

        # Fetch events for driver's devices + OData safety in parallel
        from_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        events_task = geotab.api_call("Get", {
            "typeName": "ExceptionEvent",
            "search": {
                "userSearch": {"id": driver["id"]},
                "fromDate": from_date,
            },
            "resultsLimit": 100,
        })
        odata_task = odata.fetch_driver_kpis(full_name)

        events_raw, driver_kpis = await asyncio.gather(events_task, odata_task)

        # Summarize events by rule and by day
        rule_counts: dict[str, int] = {}
        daily_counts: dict[str, int] = {}
        for e in (events_raw or []):
            rule_id = _get_id(e.get("rule")) or ""
            name = BUILTIN_RULES.get(rule_id, rule_id)
            rule_counts[name] = rule_counts.get(name, 0) + 1

            date = (e.get("activeFrom") or "")[:10]
            if date:
                daily_counts[date] = daily_counts.get(date, 0) + 1

        # Safety score trend from OData
        score_trend = []
        for row in sorted(driver_kpis, key=lambda r: r.get("Local_Date", "")):
            score_trend.append({
                "date": (row.get("Local_Date") or "")[:10],
                "safetyScore": row.get("Safety_Score"),
                "harshBraking": row.get("HarshBraking_Count", 0),
                "harshCornering": row.get("HarshCornering_Count", 0),
                "speeding": row.get("Speeding_Count", 0),
            })

        return _json({
            "driver": {
                "id": driver["id"],
                "name": full_name,
            },
            "period": f"last {days} day(s)",
            "events": {
                "totalCount": len(events_raw or []),
                "byType": dict(sorted(rule_counts.items(), key=lambda x: x[1], reverse=True)),
                "byDay": dict(sorted(daily_counts.items())),
            },
            "safetyTrend": score_trend,
        })
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Tool 6: Ask Ace AI
# ------------------------------------------------------------------
@mcp.tool()
async def ask_ace(question: str, vehicle_name: str | None = None) -> str:
    """Query Geotab's Ace AI with a natural language question about fleet data. This is slower (up to 60s) but handles complex analytical questions.

    Args:
        question: The natural language question to ask Ace AI
        vehicle_name: Optional vehicle name to scope the question to
    """
    try:
        client = _get_geotab()
        result = await client.query_ace_ai(question, vehicle_name=vehicle_name)
        if result:
            return _json({"status": "success", "insight": result})
        else:
            return _json({"status": "no_result", "message": "Ace AI did not return a result. Try rephrasing your question or using other tools for structured data."})
    except Exception as e:
        return _json({"error": str(e)})


# ------------------------------------------------------------------
# Standalone test mode
# ------------------------------------------------------------------
async def _run_test():
    """Quick smoke test — calls each tool and prints results."""
    # Access the underlying functions via .fn on FunctionTool objects
    print("Testing get_safety_events...")
    result = await get_safety_events.fn(days=1)
    data = json.loads(result)
    print(f"  -> {data.get('count', 'error')} events" if "count" in data else f"  -> {data}")

    print("\nTesting get_fleet_kpis...")
    result = await get_fleet_kpis.fn()
    data = json.loads(result)
    print(f"  -> fleet: {data.get('fleet', 'error')}" if "fleet" in data else f"  -> {data}")

    print("\nTesting get_driver_rankings...")
    result = await get_driver_rankings.fn(sort_by="total_events", limit=5)
    data = json.loads(result)
    print(f"  -> {data.get('count', 'error')} drivers" if "count" in data else f"  -> {data}")

    print("\nAll tests complete.")

    # Clean up
    if _geotab:
        await _geotab.close()
    if _odata:
        await _odata.close()


def main():
    if "--test" in sys.argv:
        asyncio.run(_run_test())
    else:
        mcp.run()


if __name__ == "__main__":
    main()
