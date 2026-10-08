"""Reproduce the reviewed MDR catalogue from the pinned public MDCG PDF.

The source is read only. pypdf is an import-time dependency, not a runtime one.
Only the code and label columns on pages 8–23 are imported; examples and
conditions are deliberately excluded. A new source requires a new audit.
"""
import argparse
import hashlib
import json
import pathlib
import re

from pypdf import PdfReader
from pypdf._text_extraction import mult

SOURCE_SHA256 = "aaba13eb6865c3e84c3638bb7068471b492093bd8e39a3819d14276315cc44da"
SOURCE_URL = "https://health.ec.europa.eu/document/download/6d75a830-9b9b-4e4a-a3b6-047329e9a104_en"
REGULATION_URL = "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32017R2185"
COUNTS = {"MDA": 26, "MDN": 18, "MDS": 14, "MDT": 13}


def catalogue(source):
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != SOURCE_SHA256:
        raise ValueError("Unreviewed MDR source bytes; a new source audit is required")
    reader = PdfReader(source)
    if len(reader.pages) != 23:
        raise ValueError("Unexpected source page count")
    nodes = []
    for index in range(7, 23):
        page = reader.pages[index]
        page.transfer_rotation_to_content()
        parts = []

        def visit(text, cm, tm, font, size):
            if text.strip():
                x, y = mult(tm, cm)[4:6]
                parts.append((x, y, text.strip()))

        page.extract_text(visitor_text=visit)
        current = None
        prefix = None
        for x, _y, text in parts:
            if x < 95:
                if re.fullmatch(r"MD[ANST]", text):
                    prefix, current = text, None
                elif re.fullmatch(r"\d{4}", text) and prefix:
                    current = {"code": prefix + text, "parts": [], "page": index + 1}
                    nodes.append(current)
                    prefix = None
                elif re.fullmatch(r"MD[ANST]\s*\d{4}", text):
                    current = {"code": re.sub(r"\s+", "", text), "parts": [], "page": index + 1}
                    nodes.append(current)
                    prefix = None
                else:
                    current, prefix = None, None
            elif 95 <= x < 425 and current is not None:
                current["parts"].append(text)
    for node in nodes:
        raw = re.sub(r"\s+", " ", " ".join(node.pop("parts")))
        # Annex I's English labels use unspaced slashes; the guidance adds spaces.
        term = re.sub(r"\s*/\s*", "/", raw)
        # Reviewed display-only repairs: a line wrap and a footnote marker.
        if node["code"] == "MDN1214":
            term = term.replace("non- active", "non-active")
        if node["code"] == "MDS1004":
            if not term.endswith("Council1"):
                raise ValueError("MDS1004 footnote transcription changed")
            term = term[:-1]
        node.update(family=node["code"][:3], termRaw=raw, term=term)
    actual = {family: sum(n["family"] == family for n in nodes) for family in COUNTS}
    if actual != COUNTS or len({n["code"] for n in nodes}) != 71 or any(not n["term"] for n in nodes):
        raise ValueError("MDR catalogue count, uniqueness or label invariant failed")
    digest = hashlib.sha256(json.dumps(nodes, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return {"metadata": {
        "system": "MDR", "release": "2017/2185", "guidanceRelease": "MDCG 2019-14 (December 2019)",
        "taxonomyVersion": "mdr-2017-2185:mdcg-2019-14:" + digest[:16],
        "catalogueSha256": digest, "sourceSha256": SOURCE_SHA256,
        "sourceUrl": SOURCE_URL, "regulationUrl": REGULATION_URL,
        "sourceTitle": "MDCG 2019-14 — Explanatory note on MDR codes",
        "sourcePages": 23, "sourceBytes": len(content), "cataloguePages": [8, 23],
        "verifiedOn": "2026-10-08", "codeCount": 71, "familyCounts": COUNTS,
        "labelSource": "Code and label columns of the pinned MDCG guidance, cross-checked against indexed official English Annex I to Regulation (EU) 2017/2185.",
        "normalizations": ["Whitespace joined within label cells", "Slash spacing aligned to the English regulation", "MDN1214: join line-wrapped non-active", "MDS1004: separate footnote marker 1 from display label"],
        "limitations": ["Lookup validates catalogue membership, not assignment to a particular device.", "These are designation-scope codes, not a device risk class or evidence of a professional's competence or authorisation.", "Guidance examples and conditions are not exhaustive and are not imported as code definitions.", "IVDR designation codes are not included in this MDR catalogue."]
    }, "nodes": nodes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=pathlib.Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = pathlib.Path(__file__).resolve().parents[1] / "data" / "mdr-2017-2185.json"
    rendered = json.dumps(catalogue(args.source), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if output.read_text(encoding="utf-8") != rendered:
            raise SystemExit("MDR catalogue differs from reproducible source import")
        print("MDR catalogue verified: 71 codes; source and content digests match")
    else:
        output.write_text(rendered, encoding="utf-8", newline="\n")
        print("Imported 71 MDR designation codes")


if __name__ == "__main__":
    main()
