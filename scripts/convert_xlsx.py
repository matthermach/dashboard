"""Convert the repository workbook to validated dashboard data without dependencies."""
from datetime import date, datetime, timedelta
import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MONTHS = {
    "stycznia": 1, "lutego": 2, "marca": 3, "kwietnia": 4, "maja": 5,
    "czerwca": 6, "lipca": 7, "sierpnia": 8, "września": 9,
    "października": 10, "listopada": 11, "grudnia": 12,
}


def parse_date(value):
    value = str(value).strip()
    if re.fullmatch(r"\d+(\.\d+)?", value):
        serial = float(value)
        if serial == 60:
            raise ValueError("Excel serial 60 is the non-existent 1900-02-29")
        offset = serial if serial < 60 else serial - 1
        result = (datetime(1899, 12, 31) + timedelta(days=offset)).date()
    elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        result = date.fromisoformat(value)
    else:
        day, month, year = value.lower().split()
        result = date(int(year), MONTHS[month], int(day))
    if result < date(1900, 1, 1):
        raise ValueError("Date must be on or after 1900-01-01")
    return result.isoformat()


def convert():
    with zipfile.ZipFile(ROOT / "Lead Times - 2024-25.xlsx") as workbook:
        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared = [
                "".join(node.itertext())
                for node in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", NS)
            ]
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        points = []
        occurrences = {}
        headers = None
        for row in sheet.findall(".//m:sheetData/m:row", NS):
            cells = {}
            for cell in row.findall("m:c", NS):
                column = re.sub(r"\d", "", cell.attrib["r"])
                value = cell.findtext("m:v", default="", namespaces=NS)
                if cell.get("t") == "s":
                    value = shared[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find("m:is", NS).itertext())
                cells[column] = value
            if not any(str(value).strip() for value in cells.values()):
                continue
            if headers is None:
                headers = cells
                expected = {"A": "Data ukończenia", "B": "Deklarowany rozmiar", "C": "Czas realizacji"}
                if any(cells.get(key) != value for key, value in expected.items()):
                    raise ValueError(f"Unexpected workbook headers: {headers}")
                continue
            try:
                completed = parse_date(cells["A"])
                size = cells["B"].strip().upper()
                days = float(cells["C"])
                if size not in ("S", "M", "L") or not math.isfinite(days) or days <= 0:
                    raise ValueError("Expected size S/M/L and positive finite duration")
                identity = f"{completed}|{size}|{days:g}"
                occurrences[identity] = occurrences.get(identity, 0) + 1
                digest = hashlib.sha256(identity.encode()).hexdigest()[:16]
                points.append({
                    "id": f"xlsx-{digest}-{occurrences[identity]}",
                    "date": completed, "size": size, "days": days, "source": "xlsx",
                })
            except (KeyError, ValueError, OverflowError) as error:
                raise ValueError(f"Invalid workbook row {row.get('r')}: {error}") from error
    if not points or len(points) > 20000:
        raise ValueError("Workbook must contain 1–20,000 data rows")
    (ROOT / "data.json").write_text(json.dumps(points, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Converted {len(points)} XLSX rows to data.json")


if __name__ == "__main__":
    convert()
