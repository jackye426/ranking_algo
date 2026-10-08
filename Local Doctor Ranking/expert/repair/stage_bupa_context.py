"""Additive Bupa language/Offers metadata, offline and evidence-only.

No primary role, specialty, registration, identity URL or existing language
field is replaced. Offers are service metadata, never performed activity.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time
from lxml import etree, html
from bupa_parser import (parse_snapshot, serialize_nodes, normalized_name, collapse,
                         MOJIBAKE, CONTACT, PERSONAL, hash_value, canonical_json, review_markup)
from stage_bupa import file_hash, snapshot_name, SOURCE_SHA, MANDATORY_HOLDS, write_json

VERSION = 'bupa-context-source-v2'
LABELS = {'Offers':'service', '(Additional) Languages spoken':'language', 'Languages spoken':'language'}
OFFERS = {'Face-to-face consultations', 'Video and telephone consultations', 'Home chemotherapy'}


def extract_context(binary, baseline, frozen):
    identity = parse_snapshot(binary)
    reasons = list(identity.get('errors', []))
    name = normalized_name(frozen.get('name'))
    if not name or name != normalized_name(baseline.get('name')) or name != normalized_name(identity.get('name')):
        reasons.append('name-binding-failed')
    fg = str(frozen.get('gmc_number') or '')
    if fg and (fg != str(baseline.get('gmc_number') or '') or identity.get('gmcNumbers') != [fg]):
        reasons.append('frozen-gmc-binding-failed')
    bodies = []
    for body in ['GMC','HCPC','GDC']:
        identifier = str(baseline.get(body.lower()+'_number') or '').replace(' ','').upper()
        if identifier and identity.get('typedRegistrations',{}).get(body) == [identifier]:
            bodies.append(body)
    if not bodies:
        reasons.append('no-typed-identity-proof')
    if len(identity.get('providerIds',[])) != 1:
        reasons.append('ambiguous-or-missing-source-url')
    result = {'snapshotSha256':identity.get('snapshotSha256'),'typedBodies':bodies,'reasons':sorted(set(reasons)),
              'items':[],'sections':[],'sourceUrl':None}
    if reasons:
        return result
    result['sourceUrl']='https://www.finder.bupa.co.uk/Consultant/view/'+identity['providerIds'][0]+'/'
    doc=html.fromstring(binary.decode('utf8'),parser=html.HTMLParser(no_network=True,remove_comments=True))
    seen=set()
    for label, kind in LABELS.items():
        found=[h for h in doc.xpath('//h4') if collapse(''.join(h.itertext()))==label]
        if not found:
            continue
        if len(found)!=1:
            result['sections'].append({'sourceField':label,'status':'held','reason':'ambiguous-heading'})
            continue
        heading=found[0];ul=heading.getnext()
        if ul is None or ul.tag.lower()!='ul':
            result['sections'].append({'sourceField':label,'status':'held','reason':'expected-immediate-ul'})
            continue
        # Saved Bupa language lists use ul > div.tooltip > li. Accept only
        # this observed wrapper or direct list items; never flatten arbitrary
        # descendants or copy tooltip attributes into evidence text.
        list_items=[]; unsupported=False
        for child in ul:
            if child.tag == 'li':
                list_items.append(child)
            elif child.tag == 'div' and set(child.get('class','').split()) == {'tooltip'} and len(child) == 1 and child[0].tag == 'li' and not (child.text or '').strip():
                list_items.append(child[0])
            else:
                unsupported=True
        if unsupported or not list_items:
            result['sections'].append({'sourceField':label,'status':'held','reason':'unsupported-or-empty-list-structure'})
            continue
        section={'sourceField':label,'kind':kind,'sourceLine':heading.sourceline,'status':'checked','items':[],
                 'sectionHtmlSha256':hashlib.sha256(etree.tostring(ul,encoding='utf8',with_tail=False)).hexdigest()}
        for li in list_items:
            value=serialize_nodes([li]);text=value['text'];errors=[]
            if not text or len(text)>5000:errors.append('invalid-text-size')
            if MOJIBAKE.search(text):errors.append('unknown-source-encoding')
            if CONTACT.search(text):errors.append('contact-content')
            if PERSONAL.search(text):errors.append('personal-content')
            if kind=='service' and text not in OFFERS:errors.append('unexpected-offer-label')
            if not value['checks']['characterConservation'] or not value['checks']['boundaryConservation']:errors.append('source-conservation-failed')
            record={'textHash':hash_value(text),'checks':value['checks'],'status':'held' if errors else 'proposed','reasons':errors}
            if not {'contact-content','personal-content'}.intersection(errors):
                record.update(text=text,serializedSourceMarkup=review_markup(li))
            if (kind,text) in seen:
                record.update(status='duplicate-source-item',reasons=['identical-kind-text-already-retained'])
            elif not errors:
                seen.add((kind,text))
                result['items'].append({'kind':kind,'text':text,'sourceField':label})
            section['items'].append(record)
        result['sections'].append(section)
    return result


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    for name in ['baseline','source-json','snapshots','backup-manifest','eligible-ids','output-dir']:
        cli.add_argument('--'+name,required=True)
    cli.add_argument('--workers',type=int,default=4)
    args=cli.parse_args();start=time.monotonic();out=Path(args.output_dir)
    if out.exists():raise SystemExit('Output must be a new private directory')
    if file_hash(args.source_json)!=SOURCE_SHA:raise SystemExit('Frozen Bupa mapping changed')
    baseline_sha=file_hash(args.baseline)
    raw=json.loads(Path(args.baseline).read_text(encoding='utf8'));by_id={r['id']:r for r in raw['rows']}
    source=json.loads(Path(args.source_json).read_text(encoding='utf8'))['profiles']
    eligible_data=json.loads(Path(args.eligible_ids).read_text(encoding='utf8'))
    if eligible_data.get('baselineSha256')!=baseline_sha:raise SystemExit('Eligibility baseline hash mismatch')
    eligible=set(eligible_data['sourceRecordIds'])
    if eligible.intersection(MANDATORY_HOLDS):raise SystemExit('Known mandatory hold present in eligibility set')
    inventory=json.loads(Path(args.backup_manifest).read_text(encoding='utf8'))
    expected={str(x['path']).replace('\\','/').rsplit('/',1)[-1]:x['sha256'] for x in inventory['files'] if '/BUPA/data/html_snapshots/' in str(x['path']).replace('\\','/')}
    if len(expected)!=37358:raise SystemExit('Incomplete snapshot backup inventory')
    snapshot_root=Path(args.snapshots);out.mkdir(parents=True,exist_ok=False)
    patches=[];counts=Counter();reasons=Counter();kinds=Counter()
    def read(index):
        rid='bupa_'+str(index);baseline=by_id.get(rid);frozen=source[index];name=snapshot_name(frozen)
        record={'sourceRecordId':rid,'sourceArrayIndex':index,'snapshotFile':name,'humanReviewed':False,'reviewKind':'automated-direct-source-comparison'}
        if rid not in eligible or rid in MANDATORY_HOLDS:
            return record|{'status':'held','reasons':['candidate-not-eligible']},None
        if baseline.get('professional_context') is not None:
            return record|{'status':'held','reasons':['existing-context-requires-merge-review']},None
        path=snapshot_root/name
        if not name or path.resolve().parent!=snapshot_root.resolve() or not path.is_file():
            return record|{'status':'held','reasons':['missing-or-unsafe-snapshot']},None
        binary=path.read_bytes()
        if hashlib.sha256(binary).hexdigest()!=expected.get(name):
            return record|{'status':'held','reasons':['snapshot-backup-hash-mismatch']},None
        extracted=extract_context(binary,baseline,frozen)
        record.update(snapshotSha256=extracted['snapshotSha256'],typedBodies=extracted['typedBodies'],sections=extracted['sections'])
        if extracted['reasons']:
            return record|{'status':'held','reasons':extracted['reasons']},None
        values=[]
        for item in extracted['items']:
            review_id='bupa-context-'+hash_value([rid,item,extracted['snapshotSha256'],VERSION])[:24]
            values.append({'kind':item['kind'],'text':item['text'],'provenance':{
                'sourceUrl':extracted['sourceUrl'],'sourceLabel':'Bupa saved professional profile',
                'sourceDate':None,'observedAt':None,'snapshotSha256':extracted['snapshotSha256'],
                'parserVersion':VERSION,'reviewId':review_id,'sourceField':item['sourceField']}})
        record.update(status='proposed' if values else 'no-context-proposal',reasons=[],proposedItems=len(values),
                      urlVerification='stored-print-route-not-live-verified')
        patch={'sourceRecordId':rid,'field':'professional_context','beforeHash':hash_value(None),'value':values,'approved':True} if values else None
        return record,patch
    with (out/'row-outcomes.jsonl').open('w',encoding='utf8') as ledger:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for start_at in range(0,len(source),1000):
                for record,patch in pool.map(read,range(start_at,min(start_at+1000,len(source)))):
                    counts[record['status']]+=1;counts['rows']+=1;reasons.update(record['reasons'])
                    if patch:
                        patches.append(patch);kinds.update(v['kind'] for v in patch['value'])
                    ledger.write(canonical_json(record)+'\n')
                ledger.flush()
                print(json.dumps({'rows':counts['rows'],'patchRows':len(patches),'items':sum(kinds.values()),'elapsedSeconds':round(time.monotonic()-start,1)}),flush=True)
    write_json(out/'context-proposals.json',{'baselineSha256':baseline_sha,'patches':patches})
    summary={'counts':dict(counts),'itemKinds':dict(kinds),'holdReasons':dict(reasons),'baselineSha256':baseline_sha,
        'sourceArraySha256':SOURCE_SHA,'parserVersion':VERSION,'scriptSha256':file_hash(__file__),
        'eligibilitySha256':file_hash(args.eligible_ids),'backupManifestSha256':file_hash(args.backup_manifest),
        'humanReviewed':False,'note':'Additive source metadata; Offers do not establish performed activity or current availability.',
        'elapsedSeconds':round(time.monotonic()-start,2)}
    write_json(out/'summary.json',summary);print(json.dumps(summary,indent=2),flush=True)


if __name__=='__main__':main()
