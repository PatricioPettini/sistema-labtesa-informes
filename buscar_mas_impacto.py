# -*- coding: utf-8 -*-
"""
Busca 5 informes de IMPACTO en clientes DISTINTOS a SICA y TECHINT,
y los copia a informes-referencia/impacto-extra/ para analisis comparativo.
"""

import os, time, shutil, zipfile, re, hashlib
from datetime import datetime
from pathlib import Path

ROOT_SRC  = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
DEST_DIR  = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\impacto-extra")

TARGET = 5
DAYS_BACK = 365
TOP_CLIENTS = 400
SUBFOLDERS_PER_CLIENT = 5
DOCS_PER_CLIENT_LIMIT = 15

# Clientes ya cubiertos en informes-referencia/impacto/
EXCLUIR_CLIENTES = {'SICA METALURGICA ARG', 'TECHINT', '1. OAA'}

# Patron para detectar Impacto en el contenido
PAT_IMPACTO = [r'ENSAYO\s+DE\s+IMPACTO', r'CHARPY']

def log(m): print(m, flush=True)

def file_hash(path):
    try:
        h = hashlib.md5()
        with open(path, 'rb') as f:
            h.update(f.read(2_000_000))
        return h.hexdigest()
    except Exception:
        return None

def has_impacto(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            with z.open('word/document.xml') as f:
                xml = f.read().decode('utf-8', errors='ignore')
        text = ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
        up = text.upper()
        return any(re.search(p, up) for p in PAT_IMPACTO)
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

def find_docx(root, cutoff, limit=15):
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
    cutoff = time.time() - DAYS_BACK * 86400

    clientes = list_subdirs_recent(ROOT_SRC, cutoff)[:TOP_CLIENTS]
    log(f"Recorriendo {len(clientes)} clientes buscando IMPACTO en clientes nuevos...\n")

    encontrados = []  # uno por cliente
    clientes_cubiertos = set()
    hashes_vistos = set()

    for ci, (cmt, cpath) in enumerate(clientes, 1):
        if len(encontrados) >= TARGET: break
        cname = os.path.basename(cpath)
        if cname in EXCLUIR_CLIENTES: continue
        if cname in clientes_cubiertos: continue

        subs = list_subdirs_recent(cpath, cutoff)[:SUBFOLDERS_PER_CLIENT]
        docs = []
        if not subs:
            docs = find_docx(cpath, cutoff, limit=DOCS_PER_CLIENT_LIMIT)
        else:
            for smt, spath in subs:
                docs.extend(find_docx(spath, cutoff, limit=DOCS_PER_CLIENT_LIMIT))

        if not docs: continue

        docs.sort(key=lambda x: -x[0])
        # Para este cliente, busco el primero que tenga impacto
        for mt, full, fn in docs[:DOCS_PER_CLIENT_LIMIT]:
            h = file_hash(full)
            if h is None or h in hashes_vistos: continue
            if has_impacto(full):
                encontrados.append((mt, full, fn, cname))
                hashes_vistos.add(h)
                clientes_cubiertos.add(cname)
                log(f"  [{ci}] {cname[:25]:25s} + {fn[:60]}")
                break

        if ci % 30 == 0:
            log(f"  ... {ci}/{len(clientes)} clientes, encontrados {len(encontrados)}/{TARGET}")

    log(f"\nEncontrados: {len(encontrados)} clientes distintos con impacto")
    log(f"\nCopiando a {DEST_DIR}...")
    for mt, full, fn, cname in encontrados:
        fecha = datetime.fromtimestamp(mt).strftime('%Y%m%d')
        cclean = re.sub(r'[^A-Za-z0-9_-]', '_', cname)[:30]
        dest = DEST_DIR / f"{fecha}_{cclean}_{fn}"
        try:
            shutil.copy2(full, dest)
            log(f"  OK {dest.name}")
        except Exception as e:
            log(f"  ERR {fn}: {e}")
    log("\nLISTO.")

if __name__ == '__main__':
    main()
