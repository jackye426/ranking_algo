"""Read and back up the 12 selected literal registry sources; never publish contacts.

This corroborates recorded source roles only. It never approves an expert identity.
"""
from pathlib import Path
import hashlib, json, re, sys
from bs4 import BeautifulSoup

def digest(data): return hashlib.sha256(data).hexdigest()
def normal(text): return re.sub(r'\s+', ' ', str(text or '')).strip()

def main():
    pack_path, trials_path, html_root, output = map(Path, sys.argv[1:])
    if output.exists(): raise SystemExit('Use a new private output directory')
    pack=json.loads(pack_path.read_text(encoding='utf-8'))
    trials_bytes=trials_path.read_bytes()
    if digest(trials_bytes)!=pack['sourceFiles'][0]['sha256']: raise SystemExit('Trial archive checksum mismatch')
    trials={r['isrctn_id']:r for r in json.loads(trials_bytes)['trials']}
    output.mkdir(parents=True)
    (output/'source-backup').mkdir()
    results=[]
    for case in pack['cases']:
        trial_id=case['trialId']
        if not re.fullmatch(r'ISRCTN\d{8}', trial_id): raise SystemExit('Unsafe trial identifier')
        data=(html_root/(trial_id+'.html')).read_bytes()
        source_hash=digest(data)
        backup=output/'source-backup'/(trial_id+'.html')
        backup.write_bytes(data)
        if digest(backup.read_bytes())!=source_hash: raise SystemExit('Source backup mismatch')
        soup=BeautifulSoup(data,'html.parser')
        cards=soup.select('.card[id^="contact-"] .card-header')
        contacts=[{'name':normal(c.select_one('strong').get_text(' ',strip=True)) if c.select_one('strong') else '',
                   'role':normal(c.select_one('em').get_text(' ',strip=True)) if c.select_one('em') else ''} for c in cards]
        stored=trials[trial_id].get('contacts') or []
        same_role=bool(contacts) and contacts[0]['role']==case['recordedRole']
        same_person=bool(contacts and stored) and contacts[0]['name']==normal(stored[0].get('name'))
        result={'caseId':case['caseId'],'trialId':trial_id,'sourceUrl':case['sourceUrl'],
                'snapshotSha256':source_hash,'sourceField':'Contact information → first contact header → recorded role',
                'exactRole':contacts[0]['role'] if contacts else None,'sourceRoleMatches':same_role,
                'sourceContactNameMatches':same_person,'sourceContactNameSha256':digest(contacts[0]['name'].encode()) if contacts else None,
                'sourceDate':None,'observedAt':None,'sourceChecked':same_role and same_person,
                'contactCount':len(contacts),'explicitLaterInvestigator':any('Principal investigator' in c['role'] for c in contacts[1:]),
                'candidateIdentityApproved':False,'outcome':'withheld-person-identity-not-independently-reviewed',
                'limitations':['The archived role is not a verification of current activity or candidate identity.','Contact details were not exported into the review report.']}
        results.append(result)
    report={'version':'literal-research-source-review-v1','cases':results,'counts':{'reviewed':len(results),'literalSourceChecksPassed':sum(r['sourceChecked'] for r in results),'acceptedCandidateAttributions':0}}
    (output/'literal-source-review.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report['counts']))
    if not all(r['sourceChecked'] for r in results): raise SystemExit('Literal source differences require review')

if __name__=='__main__': main()
