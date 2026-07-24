# -*- coding: utf-8 -*-
"""
Completa las carpetas de referencia que quedaron incompletas.
- Mira que hay ya en cada carpeta y calcula cuanto falta.
- Sigue buscando en mas clientes (TOP_CLIENTS amplio).
- Deduplica por hash MD5 de contenido (mismo .docx en distintas subcarpetas).
- Tambien deduplica contra archivos ya copiados en destino.
"""

import os, time, shutil, zipfile, re, hashlib
from datetime import datetime
from pathlib import Path

ROOT_SRC  = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
ROOT_DEST = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia")

TARGET_PER_CAT = 5
DAYS_BACK      = 365
TOP_CLIENTS    = 100
SUBFOLDERS_PER_CLIENT = 5
DOCS_PER_CLIENT_LIMIT = 25

PATTERNS = {
    'traccion':       [r'ENSAYO\s+DE\s+TRACCI[OÓ]N',  r'RESISTENCIA\s+A\s+LA\s+TRACCI'],
    'impacto':        [r'ENSAYO\s+DE\s+IMPACTO',      r'CHARPY'],
    'plegado':        [r'ENSAYO\s+DE\s+PLEGADO',      r'PLEGADO\s+DE\s+CARA',  r'PLEGADO\s+DE\s+RA[IÍ]Z'],
    'quimicos':       [r'AN[AÁ]LISIS\s+QU[IÍ]MICO',   r'COMPOSICI[OÓ]N\s+QU[IÍ]MICA'],
    'dureza-brinell': [r'DUREZA\s+BRINELL',           r'\bHB\s*[0-9]'],
    'dureza-vickers': [r'DUREZA\s+VICKERS',           r'\bHV\s*[0-9]'],
}
ALL_CATS = list(PATTERNS.keys()) + ['combinados']

def log(m): print(m, flush=True)

def file_hash(path, size_limit=2_000_000):
    try:
        h = hashlib.md5()
        with open(path, 'rb') as f:
            data = f.read(size_limit)
            h.update(data)
        return h.hexdigest()
    except Exception:
        return None

def extract_text_docx(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            with z.open('word/document.xml') as f:
                xml = f.read().decode('utf-8', errors='ignore')
        return ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
    except Exception:
        return ''

def classify(text):
    found = []
    up = text.upper()
    for tipo, pats in PATTERNS.items():
        for p in pats:
            if re.search(p, up):
                found.append(tipo); break
    return found

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
    except Exception as ex:
        log(f"  ERR scan {parent}: {ex}")
    out.sort(key=lambda x: -x[0])
    return out

def find_docx_in_tree(root, cutoff, limit=25):
    out = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('~')]
        for fn in files:
            if not fn.lower().endswith('.docx'): continue
            if fn.startswith('~$'): continue
            full = os.path.join(dirpath, fn)
            try:
                m = os.path.getmtime(full)
                if m >= cutoff:
                    out.append((m, full, fn))
                    if len(out) >= limit: return out
            except Exception:
                pass
    return out

def main():
    # 1. Limpiar duplicados en destino y calcular cuanto falta
    log("Paso 0: deduplicando destino y midiendo huecos...\n")
    existing_hashes = set()
    falta = {}
    for cat in ALL_CATS:
        d = ROOT_DEST / cat
        d.mkdir(parents=True, exist_ok=True)
        files = sorted(d.glob('*.docx'))
        # Quitar duplicados por hash
        kept = 0
        for fp in files:
            h = file_hash(fp)
            if h in existing_hashes:
                log(f"  duplicado removido: {cat}/{fp.name}")
                try: fp.unlink()
                except Exception: pass
                continue
            existing_hashes.add(h)
            kept += 1
        falta[cat] = max(0, TARGET_PER_CAT - kept)
        log(f"  {cat:18s}: {kept} ok, faltan {falta[cat]}")

    if all(v == 0 for v in falta.values()):
        log("\nTodas las categorias completas. Nada por hacer.")
        return

    # 2. Recorrer mas clientes
    cutoff = time.time() - DAYS_BACK * 86400
    log(f"\nPaso 1: listando carpetas-cliente (cutoff {datetime.fromtimestamp(cutoff)})...")
    clientes = list_subdirs_recent(ROOT_SRC, cutoff)[:TOP_CLIENTS]
    log(f"  procesando {len(clientes)} clientes\n")

    seleccionados = {k: [] for k in ALL_CATS}

    log("Paso 2: buscando hasta llenar huecos...")
    for ci, (cmt, cpath) in enumerate(clientes, 1):
        cname = os.path.basename(cpath)
        if all(len(seleccionados[k]) >= falta[k] for k in ALL_CATS):
            log(f"  [{ci}] {cname}: todos los huecos llenos. Stop.")
            break

        subs = list_subdirs_recent(cpath, cutoff)[:SUBFOLDERS_PER_CLIENT]
        docs = []
        if not subs:
            docs = find_docx_in_tree(cpath, cutoff, limit=DOCS_PER_CLIENT_LIMIT)
        else:
            for smt, spath in subs:
                docs.extend(find_docx_in_tree(spath, cutoff, limit=DOCS_PER_CLIENT_LIMIT))

        if not docs:
            continue

        docs.sort(key=lambda x: -x[0])
        for mt, full, fn in docs[:DOCS_PER_CLIENT_LIMIT]:
            # dedupe por hash
            h = file_hash(full)
            if h is None or h in existing_hashes:
                continue

            text = extract_text_docx(full)
            if len(text) < 200:
                continue
            tipos = classify(text)
            if not tipos:
                continue

            target = 'combinados' if len(tipos) > 1 else tipos[0]
            if len(seleccionados[target]) < falta[target]:
                seleccionados[target].append((mt, full, fn, tipos, cname))
                existing_hashes.add(h)
                log(f"  [{ci}] {cname[:25]:25s} + {target:18s} <- {fn[:55]}")

    # 3. Copiar
    log("\nPaso 3: copiando...")
    total_copiados = 0
    for tipo, lst in seleccionados.items():
        for mt, full, fn, tipos, cname in lst:
            fecha = datetime.fromtimestamp(mt).strftime('%Y%m%d')
            cclean = re.sub(r'[^A-Za-z0-9_-]', '_', cname)[:30]
            dest = ROOT_DEST / tipo / f"{fecha}_{cclean}_{fn}"
            try:
                shutil.copy2(full, dest)
                log(f"  OK {tipo}/{dest.name}")
                total_copiados += 1
            except Exception as e:
                log(f"  ERR {fn}: {e}")

    log(f"\n=== TOTAL COPIADOS: {total_copiados} ===")
    log("\nESTADO FINAL:")
    for cat in ALL_CATS:
        n = len(list((ROOT_DEST / cat).glob('*.docx')))
        log(f"  {cat:18s}: {n}")
    log("\nLISTO.")

if __name__ == '__main__':
    main()
