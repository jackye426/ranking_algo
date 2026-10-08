"""Pure, offline Bupa professional-section recovery. Never imports source scrapers.

Reads bytes supplied by the caller. No network, database, filesystem writes, or
encoding guesses. The legacy expressions below are a bounded comparison oracle,
not the extraction implementation. They prove a frozen field came from this HTML.
"""
from __future__ import annotations

import hashlib
from html import escape
import json
import re
from urllib.parse import urljoin, urlparse
from lxml import etree, html

PARSER_VERSION = "bupa-source-recovery-v1"
FIELD_HEADINGS = {"about": "About me", "clinical_interests": "Areas of interest",
                  "areas_of_interest": "Areas of interest", "research_interests": "Research interests"}
BLOCKS = {"p", "div", "li", "ul", "ol", "section", "blockquote", "tr", "table", "dl", "dt", "dd"}
SKIP = {"script", "style", "noscript"}
MOJIBAKE = re.compile(r"\ufffd|[\u00c2\u00c3][\u0080-\u00ff]|\u00e2[\u0080-\u00bf\u20ac\u2122]|\u00f0\u0178|\u00ef\u00bf\u00bd")
CONTACT = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:phone|telephone|mobile|contact|booking)\b.{0,35}\+?\d[\d ()-]{8,}\d", re.I)
PERSONAL = re.compile(r"\b(?:my\s+(?:wife|husband|children|family)|spare\s+time|hobbies|married\s+with)\b|\benjoys?\s+(?:running|playing|skiing|golf|tennis|travel|music|cycling|walking)\b", re.I)


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def hash_value(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def collapse(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_name(value):
    return "".join(c for c in str(value or "").casefold() if c.isalnum())


def tag_name(node):
    return node.tag.lower() if isinstance(node.tag, str) else ""


def visible_events(node):
    """Text nodes are exact; boundary events never add or infer source words."""
    tag = tag_name(node)
    if not tag or tag in SKIP:
        return []
    if tag == "br":
        return [("boundary", "br")]
    out = []
    if tag in BLOCKS:
        out.append(("boundary", tag))
    if node.text:
        out.append(("text", node.text))
    for child in node:
        out.extend(visible_events(child))
        if child.tail:
            out.append(("text", child.tail))
    if tag in BLOCKS:
        out.append(("boundary", tag))
    return out


def serialize_nodes(nodes):
    events = [event for node in nodes for event in visible_events(node)]
    # Whitespace inside a text node is source layout, not an inferred paragraph.
    # Only HTML break/block events generate canonical newline boundaries.
    joined = "".join("\n" if kind == "boundary" else re.sub(r"\s+", " ", text)
                     for kind, text in events)
    text = "\n".join(collapse(line) for line in joined.split("\n") if collapse(line))
    original_chars = "".join(re.sub(r"\s", "", value) for kind, value in events if kind == "text")
    output_chars = re.sub(r"\s", "", text)
    nonempty_runs = []
    run = ""
    for kind, value in events:
        if kind == "boundary":
            if collapse(run):
                nonempty_runs.append(collapse(run))
            run = ""
        else:
            run += re.sub(r"\s+", " ", value)
    if collapse(run):
        nonempty_runs.append(collapse(run))
    return {"text": text, "checks": {
        "characterConservation": original_chars == output_chars,
        "orderedTextSha256": hashlib.sha256(original_chars.encode("utf-8")).hexdigest(),
        "explicitBoundaryCount": sum(kind == "boundary" for kind, _ in events),
        "nonemptySourceRuns": len(nonempty_runs),
        "outputLines": len(text.splitlines()) if text else 0,
        "boundaryConservation": nonempty_runs == text.splitlines(),
        "hasShortSourceLine": any(len(line) <= 2 for line in text.splitlines()),
    }}


def legacy_flat(node):
    # Equivalent to get_text(strip=True) for this professional subtree, ignoring
    # comments/script/style. Explicit breaks add no characters in the old code.
    return "".join(value.strip() for kind, value in visible_events(node) if kind == "text" and value.strip())


def review_markup(node):
    """Retain professional text/structure without exporting link/contact attrs."""
    tag = tag_name(node)
    if not tag or tag in SKIP:
        return ""
    if tag in {"br", "img", "hr", "input"}:
        return f"<{tag}>"
    return (f"<{tag}>" + escape(node.text or "") +
            "".join(review_markup(child) + escape(child.tail or "") for child in node) + f"</{tag}>")


def legacy_values(nodes, heading):
    ps = [node for node in nodes if tag_name(node) == "p"]
    if not ps:
        return {"about": ""} if heading == "About me" else {}
    if heading == "About me":
        return {"about": "\n\n".join(legacy_flat(p) for p in ps if legacy_flat(p))}
    old = legacy_flat(ps[0])
    if heading == "Research interests":
        return {"research_interests": old}
    if ";" in old:
        items = [s.strip() for s in old.split(";") if s.strip()]
        branch = "semicolon"
    elif "," in old and len(old.split(",")) > 2:
        items = [s.strip() for s in old.split(",") if s.strip()]
        branch = "comma"
    elif "\n" in old or bool(ps[0].xpath(".//br")):
        items = [s.strip() for s in re.split(r"[\n<br/>]+", old) if s.strip()]
        branch = "faulty-character-class"
    else:
        items = [old] if old else []
        branch = "single"
    return {"clinical_interests": "; ".join(items), "areas_of_interest": items, "legacyBranch": branch}


def section_nodes(heading):
    nodes = []
    for sibling in heading.itersiblings():
        tag = tag_name(sibling)
        if re.fullmatch(r"h[1-6]", tag):
            break
        # Never enter arbitrary wrappers containing another professional or a
        # later section. Unexpected markup is a review outcome, not a fallback.
        if sibling.xpath(".//h1|.//h2|.//h3|.//h4|.//h5|.//h6"):
            break
        if tag in {"p", "ul", "ol", "blockquote"}:
            nodes.append(sibling)
        elif collapse("".join(sibling.itertext())):
            return [], "unexpected-section-wrapper"
    return nodes, None


def parse_snapshot(binary):
    result = {"snapshotSha256": hashlib.sha256(binary).hexdigest(), "bytes": len(binary),
              "parserVersion": PARSER_VERSION, "sections": {}, "errors": []}
    try:
        source = binary.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return {**result, "errors": ["invalid-utf8"]}
    try:
        doc = html.fromstring(source, parser=html.HTMLParser(no_network=True, remove_comments=True))
    except (etree.ParserError, ValueError):
        return {**result, "errors": ["invalid-html"]}
    h2 = doc.xpath("//h2")
    result["name"] = collapse("".join(h2[0].itertext())) if h2 else ""
    headings = {}
    for heading in doc.xpath("//h4"):
        headings.setdefault(collapse("".join(heading.itertext())), []).append(heading)
    registrations = []
    for h in headings.get("GMC registration", []):
        following = h.getnext()
        if following is not None and tag_name(following) == "p":
            registrations.extend(re.findall(r"\b\d{6,8}\b", serialize_nodes([following])["text"]))
    result["gmcNumbers"] = sorted(set(registrations))
    typed = {"GMC": result["gmcNumbers"]}
    for label, group in headings.items():
        if "registration" not in label.lower():
            continue
        for heading in group:
            following = heading.getnext()
            if following is None or tag_name(following) not in {"p", "ul", "ol"}:
                continue
            registration_text = label + " " + serialize_nodes([following])["text"]
            patterns = {
                "HCPC": r"(?:HCPC|Health\s+(?:and\s+)?Care\s+Professions?\s+Council)(?:\s+(?:registration|reference|number))?\s*[:#-]?\s*([A-Z]{2,3}\s*\d{4,9})\b",
                "GDC": r"(?:GDC|General\s+Dental\s+Council)(?:\s+(?:registration|reference|number))*\s*[:#-]?\s*(\d{4,9})\b",
            }
            for body, pattern in patterns.items():
                typed.setdefault(body, []).extend(re.sub(r"\s+", "", match).upper() for match in re.findall(pattern, registration_text, re.I))
    result["typedRegistrations"] = {body: sorted(set(values)) for body, values in typed.items() if values}
    urls = set()
    for anchor in doc.xpath("//a[@href]"):
        href = anchor.get("href")
        if "printPage=1" not in href:
            continue
        url = urljoin("https://www.finder.bupa.co.uk/", href)
        parsed = urlparse(url)
        match = re.fullmatch(r"/Consultant/view/(\d+)/?", parsed.path, re.I)
        if parsed.hostname in {"finder.bupa.co.uk", "www.finder.bupa.co.uk"} and match:
            urls.add((match.group(1), url))
    result["providerIds"] = sorted({pair[0] for pair in urls})
    result["storedPrintUrls"] = sorted({pair[1] for pair in urls})
    for label in sorted(set(FIELD_HEADINGS.values())):
        found = headings.get(label, [])
        if not found:
            continue
        if len(found) != 1:
            result["sections"][label] = {"errors": ["ambiguous-section-heading"]}
            continue
        h = found[0]
        nodes, issue = section_nodes(h)
        if issue:
            result["sections"][label] = {"errors": [issue]}
            continue
        rendered = serialize_nodes(nodes)
        errors = []
        if MOJIBAKE.search(rendered["text"]):
            errors.append("unknown-source-encoding")
        if CONTACT.search(rendered["text"]):
            errors.append("contact-content")
        if PERSONAL.search(rendered["text"]):
            errors.append("personal-content")
        if not all(rendered["checks"][key] for key in ("characterConservation", "boundaryConservation")):
            errors.append("source-conservation-failed")
        result["sections"][label] = {**rendered, "legacy": legacy_values(nodes, label),
            "errors": errors, "sourceLine": h.sourceline,
            "locator": f"h4[text()={label!r}]/following-siblings-until-heading",
            "sourceMarkup": "".join(review_markup(n) for n in nodes),
            "sectionHtmlSha256": hashlib.sha256("".join(etree.tostring(n, encoding="unicode") for n in nodes).encode("utf-8")).hexdigest()}
    return result
