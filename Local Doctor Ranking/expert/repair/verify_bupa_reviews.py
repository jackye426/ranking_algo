"""Independently re-read selected original HTML with BeautifulSoup, not lxml.

This is an automated source review, never a claim of human approval. Produces
only IDs, counts, hashes and check outcomes; professional quotes stay in the
private source-review ledger. No scraper/importer is imported or executed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from bs4 import BeautifulSoup, Tag, NavigableString, Comment

BLOCK_TAGS = {"p", "div", "li", "ul", "ol", "section", "blockquote", "tr", "table", "dl", "dt", "dd"}
FIELD_LABELS = {"about":"About me", "clinical_interests":"Areas of interest", "areas_of_interest":"Areas of interest", "research_interests":"Research interests"}


def normalize_name(value):
    return ''.join(c for c in str(value or '').casefold() if c.isalnum())


def independent_text(soup, label):
    headings = soup.find_all('h4', string=lambda value: value and ' '.join(value.split()) == label)
    if len(headings) != 1:
        return None
    selected = []
    for sibling in headings[0].next_siblings:
        if not isinstance(sibling, Tag):
            continue
        if re.fullmatch(r'h[1-6]', sibling.name) or sibling.find(re.compile(r'^h[1-6]$')):
            break
        if sibling.name in {'p','ul','ol','blockquote'}:
            selected.append(sibling)
    canonical_sections = []
    for original in selected:
        fragment = BeautifulSoup(str(original), 'html.parser')
        for node in fragment.find_all(['script','style','noscript']):
            node.decompose()
        for node in list(fragment.descendants):
            if isinstance(node, Comment):
                node.extract()
            elif isinstance(node, NavigableString):
                node.replace_with(re.sub(r'\s+', ' ', str(node)))
        for br in fragment.find_all('br'):
            br.replace_with('\n')
        for node in fragment.find_all(list(BLOCK_TAGS)):
            node.insert_before('\n')
            node.insert_after('\n')
        canonical_sections.extend(' '.join(line.split()) for line in fragment.get_text().split('\n') if line.strip())
    return '\n'.join(canonical_sections)


def independently_matches_typed_registration(soup, baseline):
    registrations = {}
    for heading in soup.find_all('h4'):
        label = heading.get_text(' ', strip=True)
        if 'registration' not in label.lower():
            continue
        following = heading.find_next_sibling()
        if following is None or following.name not in {'p','ul','ol'}:
            continue
        text = label + ' ' + following.get_text(' ', strip=True)
        if label == 'GMC registration':
            registrations.setdefault('GMC', set()).update(re.findall(r'\b\d{6,8}\b', text))
        for body, pattern in {
            'HCPC':r'(?:HCPC|Health\s+(?:and\s+)?Care\s+Professions?\s+Council)(?:\s+(?:registration|reference|number))?\s*[:#-]?\s*([A-Z]{2,3}\s*\d{4,9})\b',
            'GDC':r'(?:GDC|General\s+Dental\s+Council)(?:\s+(?:registration|reference|number))*\s*[:#-]?\s*(\d{4,9})\b',
        }.items():
            registrations.setdefault(body,set()).update(re.sub(r'\s+','',value).upper() for value in re.findall(pattern,text,re.I))
    return any(str(baseline.get(body.lower()+'_number') or '').replace(' ','').upper() in values
               and len(values)==1 for body,values in registrations.items())


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package',required=True)
    parser.add_argument('--snapshots',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    package=Path(args.package)
    output=Path(args.output)
    if output.exists():
        raise SystemExit('Refusing to overwrite independent verification')
    baseline=json.loads((package/'baseline/raw.json').read_text(encoding='utf8'))
    by_id={row['id']:row for row in baseline['rows']}
    packet=json.loads((package/'repairs.json').read_text(encoding='utf8'))
    patches={(p['sourceRecordId'],p['field']):p for p in packet['patches']}
    results=[]
    for line in (package/'source-reviews.jsonl').read_text(encoding='utf8').splitlines():
        record=json.loads(line)
        binary=(Path(args.snapshots)/record['snapshotFile']).read_bytes()
        soup=BeautifulSoup(binary.decode('utf8'), 'html.parser')
        check={'sourceRecordId':record['sourceRecordId'],'selection':record['selection'],
            'reviewKind':'independent-BeautifulSoup-source-comparison','humanReviewed':False,
            'snapshotHashMatches':hashlib.sha256(binary).hexdigest()==record['snapshotSha256'],
            'sourceNameMatchesBaseline':normalize_name(soup.h2.get_text() if soup.h2 else '')==normalize_name(by_id[record['sourceRecordId']].get('name')),
            'typedRegistrationMatchesBaseline':independently_matches_typed_registration(soup,by_id[record['sourceRecordId']]),
            'sections':{},'proposedFieldChecks':{}}
        for label, section in record['sections'].items():
            if section.get('text') is None:
                continue
            recovered=independent_text(soup,label)
            check['sections'][label]={'exactRecoveredText':recovered==section['text'],
                'nonWhitespaceCharacters':recovered is not None and re.sub(r'\s','',recovered)==re.sub(r'\s','',section['text']),
                'lineCount':len(recovered.splitlines()) if recovered else 0}
        for field in record['proposedFields']:
            patch=patches.get((record['sourceRecordId'],field))
            recovered=independent_text(soup,FIELD_LABELS[field])
            expected=[recovered] if field=='areas_of_interest' else recovered
            check['proposedFieldChecks'][field]=bool(patch and patch['value']==expected)
        # A held record may correctly lack a matching source name; it cannot
        # have a proposal. Every proposed source must pass the identity check.
        check['passed']=(check['snapshotHashMatches'] and
            (not record['proposedFields'] or check['sourceNameMatchesBaseline'] and check['typedRegistrationMatchesBaseline']) and
            all(v['exactRecoveredText'] and v['nonWhitespaceCharacters'] for v in check['sections'].values()) and
            all(check['proposedFieldChecks'].values()))
        results.append(check)
    summary={'reviews':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),
        'reviewKind':'independent-BeautifulSoup-source-comparison','humanReviewed':False,
        'proposedFieldsChecked':sum(len(r['proposedFieldChecks']) for r in results),'results':results}
    output.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({key:value for key,value in summary.items() if key!='results'}))
    if summary['failed']:
        raise SystemExit(1)


if __name__=='__main__': main()
