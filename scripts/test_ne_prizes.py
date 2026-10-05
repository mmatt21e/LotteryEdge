"""Synthetic PDF regression fixtures: no lottery artwork or source report is redistributed."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("ne_prizes", Path(__file__).with_name("ne-prizes.py"))
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


def fixture(date="10/04/2026", right_id="1002", count="3", width=612, header=True):
    def text(x, top, value):
        return f"BT /F1 8 Tf {x} {792-top-8} Td ({value}) Tj ET"
    rows = [text(70, 65, "#1001"), text(70, 77, "Sample Left"), text(48, 68, "$5"),
            text(213, 63, "$50,000"), text(259, 63, count),
            text(352, 65, "#" + right_id), text(352, 77, "Sample Right"), text(328, 68, "$2"),
            text(493, 63, "$7,000"), text(539, 63, "6"), text(50, 722, "Games Closing*** #1002")]
    if header:
        rows.append(text(50, 12, "TOP PRIZES REMAINING AS OF " + date))
    stream = "\n".join(rows).encode("ascii")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".encode(),
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
               b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for i, body in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += b"xref\n0 6\n0000000000 65535 f \n"
    pdf += b"".join(f"{offset:010} 00000 n \n".encode() for offset in offsets[1:])
    pdf += f"trailer << /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return pdf


class NebraskaPdfTests(unittest.TestCase):
    def test_pairs_columns_counts_and_closing_list(self):
        result = parser.parse_pdf(fixture())
        self.assertEqual(result["sourceAsOf"], "2026-10-04")
        self.assertEqual(len(result["games"]), 2)
        self.assertEqual(result["games"][0]["publishedTopTiers"], [{"amount": 50000, "remaining": 3}])
        self.assertEqual(result["games"][1]["price"], 2)
        self.assertTrue(result["games"][1]["closingSoon"])
        self.assertFalse(result["games"][0]["closingSoon"])

    def test_fails_closed_when_layout_or_data_changes(self):
        for options in [{"width": 700}, {"header": False}, {"date": "02/30/2026"},
                        {"right_id": "1001"}, {"count": "unknown"}]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                parser.parse_pdf(fixture(**options))

    def test_rejects_non_pdf(self):
        with self.assertRaises(Exception):
            parser.parse_pdf(b"not a PDF")


if __name__ == "__main__":
    unittest.main()
