"""Independently verify a deterministic sample of staged Bupa source metadata.

Reopens actual backed-up HTML with BeautifulSoup. This is automated source
comparison, not human review. Output contains IDs/checks only, no source quotes.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
import re
from urllib.parse import urlsplit, parse_qs
from bs4 import BeautifulSoup, Comment, NavigableString
from verify_bupa_reviews import normalize_name, independently_matches_typed_registration, BLOCK_TAGS


def independent_item_text(original):
    fragment = BeautifulSoup(str(original), 'html.parser')
    for node in fragment.find_all(['script', 'style', 'noscript']):
        node.decompose()
    for node in list(fragment.descendants):
        if isinstance(node, Comment):
            node.extract()
        elif isinstance(node, NavigableString):
            node.replace_with(re.sub(r'\s+', ' ', str(node)))
    for node in fragment.find_all('br'):
        node.replace_with('\n')
    for node in fragment.find_all(list(BLOCK_TAGS)):
        node.insert_before('\n')
        node.insert_after('\n')
    return '\n'.join(' '.join(line.split()) for line in fragment.get_text().split('\n') if line.strip())


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    for arg in ['proposals', 'outcomes', 'baseline', 'snapshots', 'eligible-ids', 'output']:
        cli.add_argument('--' + arg, required=True)
    cli.add_argument('--sample-size', type=int, default=200)
    args = cli.parse_args()
    output = Path(args.output)
    if output.exists():
        raise SystemExit('Refusing to overwrite verification')
    packet = json.loads(Path(args.proposals).read_text(encoding='utf8'))
    baseline_bytes = Path(args.baseline).read_bytes()
    baseline_sha = hashlib.sha256(baseline_bytes).hexdigest()
    baseline = {row['id']: row for row in json.loads(baseline_bytes)['rows']}
    eligibility = json.loads(Path(args.eligible_ids).read_text(encoding='utf8'))
    eligible = set(eligibility['sourceRecordIds'])
    patches = packet['patches']
    ids = [p['sourceRecordId'] for p in patches]
    all_checks = {
        'baselineHashMatches': packet['baselineSha256'] == baseline_sha == eligibility['baselineSha256'],
        'uniquePatchRows': len(set(ids)) == len(ids),
        'allRowsEligible': set(ids).issubset(eligible),
        'mandatoryHoldsAbsent': not set(ids).intersection({'bupa_6445', 'bupa_26882', 'bupa_22318'}),
        'fieldsAndNullPreconditions': all(p['field'] == 'professional_context' and
            p['beforeHash'] == hashlib.sha256(b'null').hexdigest() and baseline[p['sourceRecordId']].get('professional_context') is None for p in patches),
        'literalKindsAndSourceFields': all(v['kind'] in {'language', 'service'} and
            (v['provenance']['sourceField'] == 'Offers') == (v['kind'] == 'service') for p in patches for v in p['value']),
        'unknownDatesRemainNull': all(v['provenance']['sourceDate'] is None and v['provenance']['observedAt'] is None for p in patches for v in p['value']),
    }
    # Deliberately include language-only metadata and each of the three offers,
    # then seeded random rows from the whole proposed population.
    selected = set()
    for label in ['language', 'Face-to-face consultations', 'Video and telephone consultations', 'Home chemotherapy']:
        candidate = next((p for p in patches if any(v['kind'] == label or v['text'] == label for v in p['value'])), None)
        if candidate:
            selected.add(candidate['sourceRecordId'])
    rng = random.Random(20261009)
    remaining = sorted(set(ids) - selected)
    selected.update(rng.sample(remaining, min(max(0, args.sample_size-len(selected)), len(remaining))))
    outcomes = {}
    with Path(args.outcomes).open(encoding='utf8') as stream:
        for line in stream:
            row = json.loads(line)
            if row['sourceRecordId'] in selected:
                outcomes[row['sourceRecordId']] = row
    by_id = {p['sourceRecordId']: p for p in patches}
    results = []
    for rid in sorted(selected):
        record = outcomes[rid]
        binary = (Path(args.snapshots)/record['snapshotFile']).read_bytes()
        soup = BeautifulSoup(binary.decode('utf8'), 'html.parser')
        baseline_row = baseline[rid]
        hash_value = hashlib.sha256(binary).hexdigest()
        provider_ids = set()
        for anchor in soup.find_all('a', href=True):
            url = urlsplit(anchor['href'])
            if parse_qs(url.query).get('printPage') != ['1']:
                continue
            matched = re.search(r'/Consultant/view/(\d+)(?:/|$)', url.path)
            if matched:
                provider_ids.add(matched.group(1))
        checks = {
            'snapshotHashMatches': hash_value == record['snapshotSha256'],
            'sourceNameMatchesBaseline': normalize_name(soup.h2.get_text() if soup.h2 else '') == normalize_name(baseline_row.get('name')),
            'typedRegistrationMatchesBaseline': independently_matches_typed_registration(soup, baseline_row),
            'unambiguousStoredPrintRoute': len(provider_ids) == 1,
        }
        items = []
        for value in by_id[rid]['value']:
            provenance = value['provenance']
            label = provenance['sourceField']
            headings = [h for h in soup.find_all('h4') if ' '.join(h.get_text().split()) == label]
            values = []
            if len(headings) == 1:
                listing = headings[0].find_next_sibling()
                if listing is not None and listing.name == 'ul':
                    for item in listing.find_all('li'):
                        parent = item.parent
                        if parent is listing or (parent.name == 'div' and parent.parent is listing and set(parent.get('class',[])) == {'tooltip'}):
                            values.append(independent_item_text(item))
            item_checks = {
                'exactLiteralListItem': value['text'] in values,
                'sourceHashMatches': provenance['snapshotSha256'] == hash_value,
                'storedPrintUrlMatches': len(provider_ids) == 1 and provenance['sourceUrl'] == 'https://www.finder.bupa.co.uk/Consultant/view/'+next(iter(provider_ids))+'/',
            }
            items.append(item_checks)
        passed = all(checks.values()) and all(all(check.values()) for check in items)
        results.append({'sourceRecordId':rid,'checks':checks,'itemsChecked':len(items),'itemChecks':items,'passed':passed})
    summary = {'reviewKind':'independent-BeautifulSoup-source-comparison','humanReviewed':False,
        'selectionSeed':20261009,'proposedRows':len(patches),'proposedItems':sum(len(p['value']) for p in patches),
        'fullPacketChecks':all_checks,'sampledRows':len(results),'sampledItems':sum(r['itemsChecked'] for r in results),
        'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'results':results}
    output.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({key:value for key,value in summary.items() if key != 'results'}))
    if not all(all_checks.values()) or summary['failed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
