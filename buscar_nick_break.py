# -*- coding: utf-8 -*-
"""
Busca 5 informes de NICK BREAK de clientes DISTINTOS. Incluye .doc y .docx.
Para .doc usa búsqueda en el binario (UTF-16 LE) sin abrir Word.
Si encuentra un .doc con NICK BREAK, lo convierte a .docx vía Word COM.
"""
import os, time, shutil, zipfile, re, hashlib, subprocess, tempfile
from datetime import datetime
from pathlib import Path

ROOT_SRC = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
DEST_DIR = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\nick-break")

TARGET = 5
DAYS_BACK = 730  # 2 años
TOP_CLIENTS = 600
SUBFOLDERS_PER_CLIENT = 8
DOCS_PER_CLIENT_LIMIT = 30

PAT_NICK_RE = re.compile(r'NICK\s*[- ]*\s*BREAK', re.IGNORECASE)

def log(m): print(m, flush=True)

def file_hash(path):
    try:
        with open(path, 'rb') as f: data = f.read(2_000_000)
        return hashlib.md5(data).hexdigest()
    except Exception: return None

def has_nick_docx(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            with z.open('word/document.xml') as f:
                xml = f.read().decode('utf-8', errors='ignore')
        text = ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
        return bool(PAT_NICK_RE.search(text.upper()))
    except Exception: return False

def has_nick_doc(path):
    """Busca 'NICK ... BREAK' en .doc legacy leyendo crudo en UTF-16 LE y latin-1"""
    try:
        with open(path, 'rb') as f: data = f.read(3_000_000)
        # Probar UTF-16 LE (formato común en .doc)
        for enc in ('utf-16-le', 'latin-1', 'cp1252'):
            try:
                txt = data.decode(enc, errors='ignore').upper()
                if PAT_NICK_RE.search(txt):
                    return True
            except Exception: pass
        return False
    except Exception: return False

def has_nick(path):
    p = str(path).lower()
    if p.endswith('.docx'): return has_nick_docx(path)
    if p.endswith('.doc'):  return has_nick_doc(path)
    return False

def list_subdirs_recent(parent, cutoff):
    out = []
    try:
        with os.scandir(parent) as it:
            for e in it:
                if not e.is_dir() or e.name.startswith(('~','.')): continue
                try:
                    m = e.stat().st_mtime
                    if m >= cutoff: out.append((m, e.path))
                except Exception: pass
    except Exception: pass
    out.sort(key=lambda x: -x[0])
    return out

def find_docs(root, cutoff, limit=30):
    out = []
    for dp, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(('.','~'))]
        for fn in files:
            low = fn.lower()
            if not (low.endswith('.docx') or low.endswith('.doc')) or fn.startswith('~$'): continue
            full = os.path.join(dp, fn)
            try:
                m = os.path.getmtime(full)
                if m >= cutoff:
                    out.append((m, full, fn))
                    if len(out) >= limit: return out
            except Exception: pass
    return out

def convert_doc_to_docx(src, dst):
    """Usa PowerShell + Word COM para convertir .doc a .docx"""
    ps_script = f"""
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open('{src}')
$doc.SaveAs([ref]'{dst}', [ref]16)
$doc.Close()
$word.Quit()
"""
    try:
        subprocess.run(['powershell', '-NoProfile', '-Command', ps_script],
                       check=True, timeout=60, capture_output=True)
        return os.path.exists(dst)
    except Exception as e:
        log(f"  conv-err: {e}")
        return False

def main():
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - DAYS_BACK * 86400
    clientes = list_subdirs_recent(ROOT_SRC, cutoff)[:TOP_CLIENTS]
    log(f"Recorriendo {len(clientes)} clientes (.doc + .docx, últimos {DAYS_BACK} días)...\n")

    encontrados = []
    hashes_vistos = set()
    clientes_cubiertos = set()

    for ci, (cmt, cpath) in enumerate(clientes, 1):
        if len(encontrados) >= TARGET: break
        cname = os.path.basename(cpath)
        if cname in clientes_cubiertos: continue

        subs = list_subdirs_recent(cpath, cutoff)[:SUBFOLDERS_PER_CLIENT]
        docs = []
        if not subs: docs = find_docs(cpath, cutoff, limit=DOCS_PER_CLIENT_LIMIT)
        else:
            for smt, spath in subs:
                docs.extend(find_docs(spath, cutoff, limit=DOCS_PER_CLIENT_LIMIT))
        if not docs: continue
        docs.sort(key=lambda x: -x[0])

        for mt, full, fn in docs[:DOCS_PER_CLIENT_LIMIT]:
            h = file_hash(full)
            if h is None or h in hashes_vistos: continue
            if has_nick(full):
                encontrados.append((mt, full, fn, cname))
                hashes_vistos.add(h)
                clientes_cubiertos.add(cname)
                fecha = datetime.fromtimestamp(mt).strftime('%Y-%m-%d')
                log(f"  [{ci}] {cname[:30]:30s} {fecha} {fn[:60]}")
                break

        if ci % 50 == 0:
            log(f"  ... {ci}/{len(clientes)} clientes, encontrados {len(encontrados)}/{TARGET}")

    log(f"\nEncontrados: {len(encontrados)} clientes distintos con NICK BREAK")
    log(f"\nCopiando/convirtiendo a {DEST_DIR}...")
    for i, (mt, full, fn, cname) in enumerate(encontrados, 1):
        fecha = datetime.fromtimestamp(mt).strftime('%Y%m%d')
        cclean = re.sub(r'[^A-Za-z0-9_-]', '_', cname)[:30]
        base = f"{i:02d}_{fecha}_{cclean}"
        low = full.lower()
        if low.endswith('.docx'):
            dest = DEST_DIR / f"{base}_{fn[:70]}"
            try:
                shutil.copy2(full, dest)
                log(f"  OK {dest.name}")
            except Exception as e: log(f"  ERR {fn}: {e}")
        else:  # .doc ? convertir
            fn_docx = re.sub(r'\.doc$', '.docx', fn, flags=re.I)
            dest = DEST_DIR / f"{base}_{fn_docx[:70]}"
            if convert_doc_to_docx(str(full), str(dest)):
                log(f"  OK (convertido) {dest.name}")
            else:
                log(f"  ERR conversión falló: {fn}")
    log("\nLISTO.")

if __name__ == '__main__':
    main()
