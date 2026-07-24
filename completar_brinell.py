# -*- coding: utf-8 -*-
"""
Completa dureza-brinell aceptando tambien informes combinados que CONTENGAN brinell.
Recorre TODOS los clientes del año.
"""
import os, time, shutil, zipfile, re, hashlib
from datetime import datetime
from pathlib import Path

ROOT_SRC  = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
DEST_DIR  = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\dureza-brinell")

TARGET = 5
DAYS_BACK = 365
TOP_CLIENTS = 400

PAT_BRINELL = [r'DUREZA\s+BRINELL', r'\bHB\s*[0-9]', r'HBW\s*\d', r'BRINELL']

def log(m): print(m, flush=True)

def file_hash(path):
    try:
        h = hashlib.md5()
        with open(path, 'rb') as f:
            h.update(f.read(2_000_000))
        return h.hexdigest()
    except Exception:
        return None

def has_brinell(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            with z.open('word/document.xml') as f:
                xml = f.read().decode('utf-8', errors='ignore')
        text = ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
        up = text.upper()
        return any(re.search(p, up) for p in PAT_BRINELL)
    except Exception:
        return False

def list_subdirs_recent(parent, cutoff):
    out = []
    try:
        with os.scandir(parent) as it:
            for e in it:
                if not e.is_dir(): continue
                if e.name.startswith('~') or e.name.startswith('.'): continue
                try:
                    m = e.stat().st_mtime
                    if m >= cutoff:
                        out.append((m, e.path))
                except Exception:
                    pass
    except Exception:
        pass
    out.sort(key=lambda x: -x[0])
    return out

def find_docx(root, cutoff, limit=30):
    out = []
    for dp, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('~')]
        for fn in files:
            if not fn.lower().endswith('.docx') or fn.startswith('~$'): continue
            full = os.path.join(dp, fn)
            try:
                m = os.path.getmtime(full)
                if m >= cutoff:
                    out.append((m, full, fn))
                    if len(out) >= limit: return out
            except Exception:
                pass
    return out

def main():
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    existing = {file_hash(fp) for fp in DEST_DIR.glob('*.docx')}
    existing.discard(None)
    ya_tengo = len(list(DEST_DIR.glob('*.docx')))
    falta = TARGET - ya_tengo
    log(f"Ya tengo {ya_tengo} brinell, faltan {falta}\n")
    if falta <= 0:
        log("Ya esta completo."); return

    cutoff = time.time() - DAYS_BACK * 86400
    clientes = list_subdirs_recent(ROOT_SRC, cutoff)[:TOP_CLIENTS]
    log(f"Recorriendo {len(clientes)} clientes buscando BRINELL (puro o combinado)...\n")

    encontrados = []
    for ci, (cmt, cpath) in enumerate(clientes, 1):
        if len(encontrados) >= falta: break
        cname = os.path.basename(cpath)
        docs = find_docx(cpath, cutoff, limit=30)
        for mt, full, fn in docs:
            if len(encontrados) >= falta: break
            h = file_hash(full)
            if h is None or h in existing: continue
            if has_brinell(full):
                encontrados.append((mt, full, fn, cname))
                existing.add(h)
                log(f"  [{ci}/{len(clientes)}] {cname[:25]:25s} + {fn[:60]}")
        if ci % 30 == 0:
            log(f"  ... {ci}/{len(clientes)} clientes, encontrados {len(encontrados)}/{falta}")

    log(f"\nCopiando {len(encontrados)}...")
    for mt, full, fn, cname in encontrados:
        fecha = datetime.fromtimestamp(mt).strftime('%Y%m%d')
        cclean = re.sub(r'[^A-Za-z0-9_-]', '_', cname)[:30]
        dest = DEST_DIR / f"{fecha}_{cclean}_{fn}"
        try:
            shutil.copy2(full, dest)
            log(f"  OK {dest.name}")
        except Exception as e:
            log(f"  ERR {fn}: {e}")
    log(f"\nTotal brinell final: {len(list(DEST_DIR.glob('*.docx')))}")

if __name__ == '__main__':
    main()
