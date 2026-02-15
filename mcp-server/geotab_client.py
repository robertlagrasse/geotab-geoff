"""Geotab API client using the official mygeotab library."""

import asyncio
import json
import os
from datetime import datetime, time, timedelta, timezone

import mygeotab

# Built-in rule ID -> human-readable name
BUILTIN_RULES = {
    "RuleHarshBrakingId": "Harsh Braking",
    "RuleHarshCorneringId": "Harsh Cornering",
    "RuleHardAccelerationId": "Hard Acceleration",
    "RulePostedSpeedingId": "Posted Speeding",
    "RuleSpeedingId": "Speeding",
    "RuleSeatbeltId": "Seatbelt",
    "RuleExcessiveIdlingId": "Excessive Idling",
    "RuleReverseId": "Reverse",
    "RuleAfterHoursUsageId": "After Hours Usage",
    "RuleJackrabbitStartsId": "Jackrabbit Starts",
    "RuleLongDrivingId": "Long Driving Without Rest",
    "RulePassengerSeatbeltId": "Passenger Seatbelt",
}

RULE_CATEGORIES = {
    "Harsh Braking": "hard_brake",
    "Harsh Cornering": "harsh_cornering",
    "Hard Acceleration": "hard_acceleration",
    "Posted Speeding": "speeding",
    "Speeding": "speeding",
    "Max Speed": "speeding",
    "Seatbelt": "seatbelt",
    "Excessive Idling": "excessive_idling",
    "Reverse": "reverse",
    "After Hours Usage": "after_hours",
    "Jackrabbit Starts": "hard_acceleration",
    "Long Driving Without Rest": "fatigue",
    "Passenger Seatbelt": "seatbelt",
}

GPS_BATCH_SIZE = 20


def _get_id(field) -> str | None:
    """Extract id from a Geotab reference field (may be dict or string)."""
    if isinstance(field, dict):
        return field.get("id")
    if isinstance(field, str) and field and not field.startswith("Unknown"):
        return field
    return None


def _to_datetime(val) -> datetime:
    """Convert a mygeotab date field (datetime or string) to a tz-aware datetime."""
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    return datetime.fromisoformat(str(val).replace("Z", "+00:00"))


def _event_lookup_time(event: dict) -> datetime:
    """Get the best timestamp for GPS/speed lookups (end time for multi-day events)."""
    t = _to_datetime(event["activeFrom"])
    dur = event.get("duration")
    # mygeotab may return duration as datetime.time, timedelta, or string
    if isinstance(dur, timedelta) and dur.days > 0:
        t = t + dur
    elif isinstance(dur, str) and "." in dur:
        # e.g. "2.03:15:30"
        try:
            parts = dur.split(".")
            days = int(parts[0])
            if days > 0:
                h, m, s = parts[1].split(":")
                t = t + timedelta(days=days, hours=int(h), minutes=int(m), seconds=int(s))
        except (ValueError, IndexError):
            pass
    return t


class GeotabClient:
    def __init__(self):
        self._api: mygeotab.API | None = None

    def _get_api(self) -> mygeotab.API:
        if self._api is None:
            self._api = mygeotab.API(
                username=os.getenv("GEOTAB_USERNAME", ""),
                password=os.getenv("GEOTAB_PASSWORD", ""),
                database=os.getenv("GEOTAB_DATABASE", ""),
                server=os.getenv("GEOTAB_SERVER", "my.geotab.com"),
            )
            self._api.authenticate()
        return self._api

    async def close(self):
        pass  # mygeotab manages its own connections

    # ------------------------------------------------------------------
    # Fetch enriched safety events
    # ------------------------------------------------------------------
    async def fetch_safety_events(self, days: int = 1) -> list[dict]:
        api = self._get_api()
        from_date = datetime.now(timezone.utc) - timedelta(days=days)

        events = await api.get_async(
            "ExceptionEvent", from_date=from_date, results_limit=100
        )
        if not events:
            return []

        # Batch-fetch reference entities
        devices, users, rules = await api.multi_call_async([
            ("Get", {"typeName": "Device"}),
            ("Get", {"typeName": "User"}),
            ("Get", {"typeName": "Rule"}),
        ])

        device_map = {d["id"]: d for d in (devices or [])}
        user_map = {u["id"]: u for u in (users or [])}
        rule_map = dict(BUILTIN_RULES)
        for r in (rules or []):
            rule_map[r["id"]] = r.get("name", r["id"])

        # GPS enrichment — LogRecord lookups in batches of 20
        gps_calls = []
        gps_meta = []
        for event in events:
            device_id = _get_id(event.get("device"))
            if not device_id:
                continue
            t = _event_lookup_time(event)
            gps_calls.append(("Get", {
                "typeName": "LogRecord",
                "search": {
                    "deviceSearch": {"id": device_id},
                    "fromDate": (t - timedelta(seconds=30)).isoformat(),
                    "toDate": (t + timedelta(seconds=30)).isoformat(),
                },
                "resultsLimit": 5,
            }))
            gps_meta.append(event)

        all_gps = []
        for i in range(0, len(gps_calls), GPS_BATCH_SIZE):
            batch = gps_calls[i : i + GPS_BATCH_SIZE]
            try:
                results = await api.multi_call_async(batch)
                all_gps.extend(results)
            except Exception:
                all_gps.extend([[] for _ in batch])

        # Speed limit lookups for speeding events
        speed_calls = []
        speed_indices = []
        for i, event in enumerate(gps_meta):
            rule_id = _get_id(event.get("rule")) or ""
            rule_name = rule_map.get(rule_id, "")
            if rule_id in ("RulePostedSpeedingId", "RuleSpeedingId") or "speed" in rule_name.lower():
                device_id = _get_id(event.get("device"))
                t = _event_lookup_time(event)
                speed_calls.append(("GetRoadMaxSpeeds", {
                    "deviceSearch": {"id": device_id},
                    "fromDate": (t - timedelta(seconds=10)).isoformat(),
                    "toDate": (t + timedelta(seconds=30)).isoformat(),
                }))
                speed_indices.append(i)

        speed_limit_map: dict[int, float] = {}
        for i in range(0, len(speed_calls), GPS_BATCH_SIZE):
            batch = speed_calls[i : i + GPS_BATCH_SIZE]
            batch_idx = speed_indices[i : i + GPS_BATCH_SIZE]
            try:
                results = await api.multi_call_async(batch)
                for j, road_speeds in enumerate(results):
                    if road_speeds:
                        evt = gps_meta[batch_idx[j]]
                        evt_time = _to_datetime(evt["activeFrom"])
                        closest = min(road_speeds, key=lambda rs: abs(
                            _to_datetime(rs["k"]).timestamp() - evt_time.timestamp()
                        ))
                        speed_limit_map[batch_idx[j]] = closest["v"]
            except Exception:
                pass

        # Build enriched events
        enriched = []
        for i, event in enumerate(gps_meta):
            log_records = all_gps[i] if i < len(all_gps) else []
            if not isinstance(log_records, list):
                log_records = []

            device_id = _get_id(event.get("device"))
            driver_id = _get_id(event.get("driver"))
            rule_id = _get_id(event.get("rule")) or ""

            device = device_map.get(device_id)
            user = user_map.get(driver_id)
            rule_name = rule_map.get(rule_id, rule_id or "Safety Event")
            category = RULE_CATEGORIES.get(rule_name, "safety_event")

            if user:
                driver_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
            else:
                driver_name = device.get("name", "Unknown Driver") if device else "Unknown Driver"

            location = None
            vehicle_speed = 0
            if log_records:
                event_dt = _to_datetime(event["activeFrom"])
                closest_lr = min(log_records, key=lambda lr: abs(
                    _to_datetime(lr["dateTime"]).timestamp() - event_dt.timestamp()
                ))
                vehicle_speed = closest_lr.get("speed", 0)
                if closest_lr.get("longitude", 0) != 0 or closest_lr.get("latitude", 0) != 0:
                    location = {
                        "latitude": closest_lr["latitude"],
                        "longitude": closest_lr["longitude"],
                        "speed": vehicle_speed,
                    }

            enriched.append({
                "id": event.get("id"),
                "driverId": driver_id or device_id or "unknown",
                "driverName": driver_name,
                "deviceName": device.get("name", "Unknown Vehicle") if device else "Unknown Vehicle",
                "type": category,
                "ruleName": rule_name,
                "timestamp": event["activeFrom"],
                "location": location,
                "rawData": {
                    "ruleId": rule_id or None,
                    "deviceId": device_id or None,
                    "driverId": driver_id or None,
                    "duration": event.get("duration"),
                    "distance": event.get("distance", 0),
                    "speed": vehicle_speed,
                    "speedLimit": speed_limit_map.get(i),
                    "state": event.get("state"),
                },
            })

        return enriched

    # ------------------------------------------------------------------
    # 3-step Ace AI query
    # ------------------------------------------------------------------
    async def query_ace_ai(self, question: str, vehicle_name: str | None = None) -> str | None:
        api = self._get_api()

        # Step 1: Create chat
        create_result = await api.call_async("GetAceResults",
            serviceName="dna-planet-orchestration",
            functionName="create-chat",
            customerData=True,
            functionParameters={},
        )
        results = create_result if isinstance(create_result, list) else (create_result or {}).get("results", [])
        chat_id = results[0].get("chat_id") if results else None
        if not chat_id:
            return None

        # Step 2: Send prompt
        prompt = f"For vehicle {vehicle_name}: {question}" if vehicle_name else question
        send_result = await api.call_async("GetAceResults",
            serviceName="dna-planet-orchestration",
            functionName="send-prompt",
            customerData=True,
            functionParameters={"chat_id": chat_id, "prompt": prompt},
        )
        send_results = send_result if isinstance(send_result, list) else (send_result or {}).get("results", [])
        msg_group_id = None
        if send_results:
            first = send_results[0]
            msg_group_id = first.get("message_group_id") or (first.get("message_group") or {}).get("id")
        if not msg_group_id:
            return None

        # Step 3: Poll — adaptive intervals, 60s total timeout
        for interval in [2, 3, 5, 8, 8, 8, 8, 8, 8, 8]:
            await asyncio.sleep(interval)
            poll_result = await api.call_async("GetAceResults",
                serviceName="dna-planet-orchestration",
                functionName="get-message-group",
                customerData=True,
                functionParameters={"message_group_id": msg_group_id},
            )
            poll_results = poll_result if isinstance(poll_result, list) else (poll_result or {}).get("results", [])
            if not poll_results:
                continue

            message_group = poll_results[0].get("message_group", {})
            status = (message_group.get("status") or {}).get("status")

            if status == "DONE":
                messages = message_group.get("messages", {})
                parts = []
                for msg in (messages.values() if isinstance(messages, dict) else []):
                    if msg.get("reasoning"):
                        parts.append(msg["reasoning"])
                    if msg.get("preview_array"):
                        parts.append(f"Data: {json.dumps(msg['preview_array'][:3])}")
                return " ".join(parts).strip() or None

            if status == "FAILED":
                return None

        return None
