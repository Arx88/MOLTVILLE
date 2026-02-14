import os, glob, sys, subprocess
from pathlib import Path
src = r"C:\Users\juanp\Downloads\MOLTVILLE-main (14)\arquitectura moltville study\Nuevos documentos"
out = Path(r"C:\Users\juanp\Downloads\MOLTVILLE-main (14)\MOLTVILLE-main\docs\architecture_extract")
out.mkdir(parents=True, exist_ok=True)
try:
    import pypdf
except Exception:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pypdf', '-q'])
    import pypdf
for pdf in glob.glob(os.path.join(src, '*.pdf')):
    reader = pypdf.PdfReader(pdf)
    text = []
    for p in reader.pages:
        text.append(p.extract_text() or '')
    name = Path(pdf).stem + '.txt'
    (out / name).write_text('\n\n'.join(text), encoding='utf-8')
    print('extracted', name)
