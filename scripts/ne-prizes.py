"""Read Nebraska's public top-prizes PDF from stdin. Never infer full prize ladders.

Requires pdfplumber 0.11.x. Geometry is deliberately checked: redesigned reports
must fail closed rather than silently associating counts with the wrong game.
"""
import datetime
import io
import json
import re
import sys

import pdfplumber


def parse_pdf(blob):
    with pdfplumber.open(io.BytesIO(blob)) as pdf:
        if len(pdf.pages) != 1:
            raise ValueError("NE report page count changed")
        page = pdf.pages[0].dedupe_chars(tolerance=1)
        if abs(page.width - 612) > 1 or abs(page.height - 792) > 1:
            raise ValueError("NE report page geometry changed")
        header = page.crop((0, 0, 612, 40)).extract_text() or ""
        match = re.search(r"TOP PRIZES REMAINING AS OF\s+(\d{2}/\d{2}/\d{4})", header)
        if not match:
            raise ValueError("NE explicit report date missing")
        source_date = datetime.datetime.strptime(match[1], "%m/%d/%Y").date().isoformat()
        footer = page.crop((0, 715, 612, 792)).extract_text() or ""
        if "Games Closing" not in footer:
            raise ValueError("NE footer boundary changed")
        closing = set(re.findall(r"#(\d{3,5})", footer))
        games = []
        for name_x, price_x, prize_x in [(65, 40, 210), (345, 320, 490)]:
            lines = page.crop((name_x, 45, name_x + 85, 715)).extract_text_lines(
                x_tolerance=2, y_tolerance=2, return_chars=False
            )
            anchors = [(i, line) for i, line in enumerate(lines) if re.fullmatch(r"#\d{3,5}", line["text"])]
            if not anchors:
                raise ValueError("NE game column missing")
            for index, (line_index, anchor) in enumerate(anchors):
                next_index = anchors[index + 1][0] if index + 1 < len(anchors) else len(lines)
                end = anchors[index + 1][1]["top"] - 5 if index + 1 < len(anchors) else 710
                start = anchor["top"] - 5
                name = " ".join(line["text"] for line in lines[line_index + 1:next_index]).strip()
                price = (page.crop((price_x, start, price_x + 25, anchor["top"] + 25)).extract_text() or "").strip()
                price = re.sub(r"[$\s]", "", price)
                if not name or not re.fullmatch(r"\d{1,2}", price):
                    raise ValueError("NE game name/price missing: " + anchor["text"])
                rows = page.crop((prize_x, start, prize_x + 70, end)).extract_text(x_tolerance=2, y_tolerance=2) or ""
                tiers = []
                for row in rows.splitlines():
                    cells = re.fullmatch(r"\$([\d,]+)\s+([\d,]+)", row.strip())
                    if not cells:
                        raise ValueError("NE prize/count alignment changed: " + repr(row))
                    amount, remaining = (int(value.replace(",", "")) for value in cells.groups())
                    if amount <= 0 or remaining < 0:
                        raise ValueError("NE invalid prize count")
                    tiers.append({"amount": amount, "remaining": remaining})
                if not tiers or len({tier["amount"] for tier in tiers}) != len(tiers):
                    raise ValueError("NE missing or duplicated prize rows")
                game_id = anchor["text"][1:]
                top = max(tier["amount"] for tier in tiers)
                games.append({"gameId": game_id, "name": name, "price": int(price),
                              "topPrize": f"${top:,}", "topPrizeValue": top,
                              "closingSoon": game_id in closing, "publishedTopTiers": tiers})
        if len({game["gameId"] for game in games}) != len(games):
            raise ValueError("NE duplicate game IDs")
        return {"sourceAsOf": source_date, "games": games}


if __name__ == "__main__":
    try:
        print(json.dumps(parse_pdf(sys.stdin.buffer.read())))
    except Exception as error:
        print("NE PDF parse failed: " + str(error), file=sys.stderr)
        sys.exit(1)
