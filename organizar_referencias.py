# -*- coding: utf-8 -*-
"""
Organiza informes-referencia.

Estrategia:
1. Lista solo las carpetas-cliente directas de G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA
2. Filtra las modificadas en el ultimo año, toma las 20 mas recientes
3. Dentro de cada cliente, toma las 2-3 subcarpetas (solicitudes) mas recientes
4. Dentro de cada solicitud lista los .docx recientes, clasifica por contenido
5. Copia hasta llenar 5 por categoria
"""

import os, sys, time, shutil, zipfile, re
from datetime import datetime
from pathlib import Path

ROOT_SRC  = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
ROOT_DEST = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia")

MIN_PER_CATEGORY      = 5
DAYS_BACK             = 365
TOP_CLIENTS           = 20
SUBFOLDERS_PER_CLIENT = 3

PATTERNS = {
    'traccion':       [r'ENSAYO\s+DE\s+TRACCI[OÓ]N',  r'RESISTENCIA\s+A\s+LA\s+TRACCI'],
    'impacto':        [r'ENSAYO\s+DE\s+IMPACTO',      r'CHARPY'],
    'plegado':        [r'ENSAYO\s+DE\s+PLEGADO',      r'PLEGADO\s+DE\s+CARA',  r'PLEGADO\s+DE\s+RA[IÍ]Z'],
    'quimicos':       [r'AN[AÁ]LISIS\s+QU[IÍ]MICO',   r'COMPOSICI[OÓ]N\s+QU[IÍ]MICA'],
    'dureza-brinell': [r'DUREZA\s+BRINELL',           r'\bHB\s*[0-9]'],
    'dureza-vickers': [r'DUREZA\s+VICKERS',           r'\bHV\s*[0-9]'],
}

def log(msg):
    print(msg, flush=True)

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
    """Devuelve [(mtime, full_path)] de subdirectorios directos modificados >= cutoff"""
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
        log(f"  ERR listando {parent}: {ex}")
    out.sort(key=lambda x: -x[0])
    return out

def find_docx_in_tree(root, cutoff, limit=20):
    """Busca .docx recursivamente dentro de root, hasta `limit`, modificados >= cutoff"""
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
    cutoff = time.time() - DAYS_BACK * 86400
    log(f"Cutoff: {datetime.fromtimestamp(cutoff)}")
    log(f"Fuente: {ROOT_SRC}\n")

    log("Paso 1: listando carpetas-cliente directas...")
    clientes = list_subdirs_recent(ROOT_SRC, cutoff)
    log(f"  {len(clientes)} clientes modificados en ultimo año")
    clientes = clientes[:TOP_CLIENTS]
    log(f"  tomando los {len(clientes)} mas recientes:")
    for m, p in clientes:
        log(f"    {datetime.fromtimestamp(m).date()}  {os.path.basename(p)}")

    seleccionados = {k: [] for k in list(PATTERNS.keys()) + ['combinados']}
    procesados = 0
    docs_vistos = set()  # evitar duplicados por path

    log("\nPaso 2: procesando subcarpetas y clasificando...")
    for ci, (cmt, cpath) in enumerate(clientes, 1):
        cname = os.path.basename(cpath)
        # Si todas las cuotas estan llenas, parar
        if all(len(seleccionados[k]) >= MIN_PER_CATEGORY for k in seleccionados):
            log(f"  [{ci}/{len(clientes)}] {cname}: cuotas llenas, terminando")
            break

        # Subcarpetas (solicitudes) recientes de este cliente
        subs = list_subdirs_recent(cpath, cutoff)[:SUBFOLDERS_PER_CLIENT]
        # Si el cliente no tiene subcarpetas, buscar .docx directamente en su raiz
        if not subs:
            docs = find_docx_in_tree(cpath, cutoff, limit=10)
        else:
            docs = []
            for smt, spath in subs:
                docs.extend(find_docx_in_tree(spath, cutoff, limit=10))

        if not docs:
            log(f"  [{ci}/{len(clientes)}] {cname}: 0 docx recientes")
            continue

        log(f"  [{ci}/{len(clientes)}] {cname}: {len(docs)} docx, analizando...")
        # ordenar por mtime desc, limitar a 8 por cliente
        docs.sort(key=lambda x: -x[0])
        for mt, full, fn in docs[:8]:
            if full in docs_vistos: continue
            docs_vistos.add(full)

            text = extract_text_docx(full)
            if len(text) < 200: continue
            tipos = classify(text)
            if not tipos: continue
            procesados += 1

            target = 'combinados' if len(tipos) > 1 else tipos[0]
            if len(seleccionados[target]) < MIN_PER_CATEGORY:
                seleccionados[target].append((mt, full, fn, tipos, cname))
                log(f"      + {target:18s} <- {fn[:60]}  [{','.join(tipos)}]")

    log(f"\n=== RESUMEN ({procesados} archivos analizados) ===")
    for k, lst in seleccionados.items():
        log(f"  {k:18s}: {len(lst)}")

    log(f"\nPaso 3: copiando a {ROOT_DEST}...")
    for tipo, lst in seleccionados.items():
        dest_dir = ROOT_DEST / tipo
        dest_dir.mkdir(parents=True, exist_ok=True)
        for mt, full, fn, tipos, cname in lst:
            fecha = datetime.fromtimestamp(mt).strftime('%Y%m%d')
            # Limpiar nombre cliente para usarlo de prefijo
            cclean = re.sub(r'[^A-Za-z0-9_-]', '_', cname)[:30]
            dest_name = f"{fecha}_{cclean}_{fn}"
            dest = dest_dir / dest_name
            try:
                shutil.copy2(full, dest)
                log(f"  OK  {tipo}/{dest_name}")
            except Exception as e:
                log(f"  ERR copiando {fn}: {e}")

    log("\nLISTO.")

if __name__ == '__main__':
    main()
