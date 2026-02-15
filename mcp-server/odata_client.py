"""OData Data Connector client — async port of functions/analytics/odata.js."""

import base64
import os

import aiohttp

GEOTAB_DATABASE = os.getenv("GEOTAB_DATABASE", "")
GEOTAB_USERNAME = os.getenv("GEOTAB_USERNAME", "")
GEOTAB_PASSWORD = os.getenv("GEOTAB_PASSWORD", "")
ODATA_SERVER = os.getenv("ODATA_SERVER", "odata-connector-2")


def _get_auth_header() -> str:
    # Geotab OData uses Basic auth: base64(database/username:password)
    auth_string = f"{GEOTAB_DATABASE}/{GEOTAB_USERNAME}:{GEOTAB_PASSWORD}"
    b64 = base64.b64encode(auth_string.encode()).decode()
    return f"Basic {b64}"


class ODataClient:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def query(
        self,
        table: str,
        select: str | None = None,
        filter_: str | None = None,
        search: str | None = None,
        top: int | None = None,
    ) -> list[dict]:
        base_url = f"https://{ODATA_SERVER}.geotab.com/odata/v4/svc/{table}"

        params: dict[str, str] = {}
        if select:
            params["$select"] = select
        if filter_:
            params["$filter"] = filter_
        if search:
            params["$search"] = search
        if top:
            params["$top"] = str(top)

        session = await self._get_session()
        headers = {"Authorization": _get_auth_header(), "Accept": "application/json"}

        async with session.get(base_url, params=params, headers=headers) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"OData {table} error {resp.status}: {text}")
            data = await resp.json()

        rows = data.get("value", [])

        # Handle pagination (up to 5000 rows)
        next_link = data.get("@odata.nextLink")
        while next_link and len(rows) < 5000:
            async with session.get(next_link, headers=headers) as resp:
                next_data = await resp.json()
            rows.extend(next_data.get("value", []))
            next_link = next_data.get("@odata.nextLink")

        return rows

    async def fetch_fleet_analytics(self) -> dict:
        results: dict[str, list] = {}

        # Vehicle KPIs — last 14 days
        try:
            results["vehicleKpis"] = await self.query(
                "VehicleKpi_Daily",
                search="last_14_day",
                select="Device_Name,Device_SerialNo,Local_Date,Trip_Distance_Km,Total_Driving_Duration_Seconds,Total_Idling_Duration_Seconds,Trip_Count,Stop_Count",
                top=2000,
            )
        except Exception:
            results["vehicleKpis"] = []

        # Vehicle safety — last 14 days
        try:
            results["vehicleSafety"] = await self.query(
                "VehicleSafety_Daily",
                search="last_14_day",
                select="Device_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count,Speeding_Duration_Seconds,SeatbeltOff_Count",
                top=2000,
            )
        except Exception:
            results["vehicleSafety"] = []

        # Driver safety scores — last 14 days
        try:
            results["driverSafety"] = await self.query(
                "DriverSafety_Daily",
                search="last_14_day",
                select="Driver_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count",
                top=2000,
            )
        except Exception:
            results["driverSafety"] = []

        summary = _aggregate_analytics(results)
        return {"raw": results, "summary": summary}

    async def fetch_driver_safety(self) -> list[dict]:
        """Fetch just driver safety data for rankings."""
        try:
            return await self.query(
                "DriverSafety_Daily",
                search="last_14_day",
                select="Driver_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count",
                top=2000,
            )
        except Exception:
            return []

    async def fetch_vehicle_kpis(self, vehicle_name: str) -> dict:
        """Fetch KPIs for a specific vehicle."""
        kpis = []
        safety = []
        try:
            kpis = await self.query(
                "VehicleKpi_Daily",
                search="last_14_day",
                filter_=f"Device_Name eq '{vehicle_name}'",
                select="Device_Name,Local_Date,Trip_Distance_Km,Total_Driving_Duration_Seconds,Total_Idling_Duration_Seconds,Trip_Count",
                top=100,
            )
        except Exception:
            pass
        try:
            safety = await self.query(
                "VehicleSafety_Daily",
                search="last_14_day",
                filter_=f"Device_Name eq '{vehicle_name}'",
                select="Device_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count,SeatbeltOff_Count",
                top=100,
            )
        except Exception:
            pass
        return {"kpis": kpis, "safety": safety}

    async def fetch_driver_kpis(self, driver_name: str) -> list[dict]:
        """Fetch safety data for a specific driver."""
        try:
            return await self.query(
                "DriverSafety_Daily",
                search="last_14_day",
                filter_=f"Driver_Name eq '{driver_name}'",
                select="Driver_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count",
                top=100,
            )
        except Exception:
            return []


def _aggregate_analytics(results: dict) -> dict:
    vehicle_kpis = results.get("vehicleKpis", [])
    vehicle_safety = results.get("vehicleSafety", [])
    driver_safety = results.get("driverSafety", [])

    # Fleet-wide KPIs
    total_distance = sum(r.get("Trip_Distance_Km", 0) for r in vehicle_kpis)
    total_drive_secs = sum(r.get("Total_Driving_Duration_Seconds", 0) for r in vehicle_kpis)
    total_idle_secs = sum(r.get("Total_Idling_Duration_Seconds", 0) for r in vehicle_kpis)
    total_trips = sum(r.get("Trip_Count", 0) for r in vehicle_kpis)

    # Safety aggregates
    total_harsh_brakes = sum(r.get("HarshBraking_Count", 0) for r in vehicle_safety)
    total_harsh_corners = sum(r.get("HarshCornering_Count", 0) for r in vehicle_safety)
    total_speeding = sum(r.get("Speeding_Count", 0) for r in vehicle_safety)
    total_seatbelt_off = sum(r.get("SeatbeltOff_Count", 0) for r in vehicle_safety)

    # Average safety score (from most recent day per vehicle)
    latest_by_vehicle: dict[str, dict] = {}
    for row in vehicle_safety:
        name = row.get("Device_Name", "")
        if not latest_by_vehicle.get(name) or row.get("Local_Date", "") > latest_by_vehicle[name].get("Local_Date", ""):
            latest_by_vehicle[name] = row

    safety_scores = [r["Safety_Score"] for r in latest_by_vehicle.values() if r.get("Safety_Score") is not None]
    avg_safety_score = round(sum(safety_scores) / len(safety_scores), 1) if safety_scores else None

    # Daily KPI trends
    daily_kpis: dict[str, dict] = {}
    for row in vehicle_kpis:
        date = (row.get("Local_Date") or "")[:10]
        if not date:
            continue
        if date not in daily_kpis:
            daily_kpis[date] = {"date": date, "distance": 0, "driveHours": 0, "idleHours": 0, "trips": 0}
        daily_kpis[date]["distance"] += row.get("Trip_Distance_Km", 0)
        daily_kpis[date]["driveHours"] += row.get("Total_Driving_Duration_Seconds", 0) / 3600
        daily_kpis[date]["idleHours"] += row.get("Total_Idling_Duration_Seconds", 0) / 3600
        daily_kpis[date]["trips"] += row.get("Trip_Count", 0)

    # Daily safety trends
    daily_safety: dict[str, dict] = {}
    for row in vehicle_safety:
        date = (row.get("Local_Date") or "")[:10]
        if not date:
            continue
        if date not in daily_safety:
            daily_safety[date] = {"date": date, "harshBrakes": 0, "harshCorners": 0, "speeding": 0, "seatbeltOff": 0}
        daily_safety[date]["harshBrakes"] += row.get("HarshBraking_Count", 0)
        daily_safety[date]["harshCorners"] += row.get("HarshCornering_Count", 0)
        daily_safety[date]["speeding"] += row.get("Speeding_Count", 0)
        daily_safety[date]["seatbeltOff"] += row.get("SeatbeltOff_Count", 0)

    # Driver rankings
    driver_scores: dict[str, dict] = {}
    for row in driver_safety:
        name = row.get("Driver_Name", "")
        if not name:
            continue
        if name not in driver_scores:
            driver_scores[name] = {"name": name, "totalEvents": 0, "latestScore": None, "latestDate": None}
        driver_scores[name]["totalEvents"] += (
            row.get("HarshBraking_Count", 0)
            + row.get("HarshCornering_Count", 0)
            + row.get("Speeding_Count", 0)
        )
        if not driver_scores[name]["latestDate"] or row.get("Local_Date", "") > driver_scores[name]["latestDate"]:
            driver_scores[name]["latestScore"] = row.get("Safety_Score")
            driver_scores[name]["latestDate"] = row.get("Local_Date")

    total_active = total_drive_secs + total_idle_secs
    return {
        "fleet": {
            "totalDistanceKm": round(total_distance),
            "totalDistanceMiles": round(total_distance * 0.621371),
            "totalDriveHours": round(total_drive_secs / 3600),
            "totalIdleHours": round(total_idle_secs / 3600),
            "idlePercentage": round((total_idle_secs / total_active) * 100) if total_active > 0 else 0,
            "totalTrips": total_trips,
            "avgSafetyScore": avg_safety_score,
        },
        "safetyEvents": {
            "harshBrakes": total_harsh_brakes,
            "harshCorners": total_harsh_corners,
            "speeding": total_speeding,
            "seatbeltOff": total_seatbelt_off,
            "total": total_harsh_brakes + total_harsh_corners + total_speeding + total_seatbelt_off,
        },
        "dailyKpis": sorted(daily_kpis.values(), key=lambda d: d["date"]),
        "dailySafety": sorted(daily_safety.values(), key=lambda d: d["date"]),
        "driverRankings": sorted(driver_scores.values(), key=lambda d: d["totalEvents"]),
    }
