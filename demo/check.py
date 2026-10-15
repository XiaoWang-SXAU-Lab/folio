"""Check generated routes, downloads, bilingual parity and preserved blog files."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse,unquote
import json,hashlib
from pypdf import PdfReader
R=Path(__file__).parent
class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        for key in ['href','src']:
            if key in a:self.links.append(a[key])
errors=[];checked=0
for site in ['personal','lab']:
    root=R/'dist'/site
    for lang in ['zh','en']:
        for f in (root/lang).glob('*.html'):
            parser=Links();parser.feed(f.read_text(encoding='utf-8'));checked+=1
            for link in parser.links:
                u=urlparse(link)
                if u.scheme or u.netloc or not u.path:continue
                target=(root/u.path.lstrip('/')) if u.path.startswith('/') else f.parent/unquote(u.path)
                if not target.exists():errors.append(f'{f}: missing {link}')
    assert len(list((root/'zh').glob('*.html')))==len(list((root/'en').glob('*.html')))
for f in (R.parent/'existing-blog').rglob('*'):
    if not f.is_file() or f.name=='.DS_Store' or f==R.parent/'existing-blog'/'index.html':continue
    target=R/'dist'/'personal'/f.relative_to(R.parent/'existing-blog')
    if not target.exists() or hashlib.sha256(f.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest():errors.append('Changed legacy file: '+str(f))
for lang in ['ZH','EN']:
    pdf=PdfReader(R/'dist'/'personal'/'downloads'/f'Xiao-Wang-CV-{lang}.pdf')
    text=' '.join(p.extract_text() for p in pdf.pages)
    for p in json.loads((R/'content.json').read_text(encoding='utf-8'))['publications']:
        if p['doi'] not in text:errors.append(f'Missing DOI in {lang}: '+p['doi'])
    for value in ['19949139703','1990.02','求职意向']:
        if value in text:errors.append('Private or application detail in public CV')
print(f'Checked {checked} bilingual pages, all original blog files, and both PDF CVs.')
if errors:raise SystemExit('\n'.join(errors))
print('PASS: all generated local links resolve; blog files preserved; every DOI present in both CVs.')
