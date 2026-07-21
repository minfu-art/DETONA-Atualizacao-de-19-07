# -*- coding: utf-8 -*-
"""Import ciclos 002–006 (100 questões): LP + TI + Segurança Cibernética — append-only."""
import json
import hashlib
import re
import unicodedata
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone

SRC = Path(r"C:\Users\wwwmi\Downloads\ciclos_002_a_006_pc_al_100_questoes.json")
PHASE6 = Path(r"C:\Users\wwwmi\OneDrive\Documentos\DETONA CONCURSOS\.phase6-grok-work")
APP = PHASE6 / "app"
QDIR = APP / "data" / "questions"
INDEX = QDIR / "index.json"
BANK_LP = QDIR / "lingua_portuguesa.json"
BANK_TI = QDIR / "tecnologia_informacao.json"
BANK_CIBER = QDIR / "seguranca_cibernetica.json"
OUT_READY = APP / "imports" / "questions" / "pcal-ciclos-002-a-006-ready.json"
OUT_REPORT = APP / "reports" / "pcal-ciclos-002-a-006-import-report.json"
ORIGEM = "pcal-ciclos-002-a-006"

# subtópico source → (disciplinaId arquivo, topicoEditalId)
SUBTOPIC_MAP = {
    # LP — restante da morfossintaxe e reescrita
    "1.1.5-concordancia-verbal": ("lingua_portuguesa", "port_5_5"),
    "1.1.5-concordancia-nominal": ("lingua_portuguesa", "port_5_5"),
    "1.1.5-regencia-verbal": ("lingua_portuguesa", "port_5_6"),
    "1.1.5-regencia-nominal": ("lingua_portuguesa", "port_5_6"),
    "1.1.5-emprego-do-sinal-indicativo-de-crase": ("lingua_portuguesa", "port_5_7"),
    "1.1.5-colocacao-dos-pronomes-atonos": ("lingua_portuguesa", "port_5_8"),
    "1.1.6-reescrita-de-frases": ("lingua_portuguesa", "port_6_4"),
    "1.1.6-reescrita-de-paragrafos": ("lingua_portuguesa", "port_6_4"),
    "1.1.6-significacao-das-palavras": ("lingua_portuguesa", "port_6_1"),
    "1.1.6-substituicao-de-palavras": ("lingua_portuguesa", "port_6_2"),
    "1.1.6-substituicao-de-trechos-de-texto": ("lingua_portuguesa", "port_6_2"),
    "1.1.6-reorganizacao-da-estrutura-de-oracoes": ("lingua_portuguesa", "port_6_3"),
    "1.1.6-reorganizacao-da-estrutura-de-periodos": ("lingua_portuguesa", "port_6_3"),
    "1.1.6-reescrita-de-textos-de-diferentes-generos": ("lingua_portuguesa", "port_6_4"),
    "1.1.6-reescrita-de-textos-em-diferentes-niveis-de-formalidade": ("lingua_portuguesa", "port_6_4"),
    # TI
    "1.2.1.1-nocoes-de-sistema-operacional": ("tecnologia_informacao", "ti_1"),
    "1.2.1.1-ambiente-linux": ("tecnologia_informacao", "ti_1"),
    "1.2.1.1-ambiente-windows": ("tecnologia_informacao", "ti_1"),
    "1.2.1.2-edicao-de-textos": ("tecnologia_informacao", "ti_2"),
    "1.2.1.2-edicao-de-planilhas": ("tecnologia_informacao", "ti_2"),
    "1.2.1.2-edicao-de-apresentacoes": ("tecnologia_informacao", "ti_2"),
    "1.2.1.2-pacote-microsoft-office": ("tecnologia_informacao", "ti_2"),
    "1.2.1.3-conceitos-basicos-de-redes-de-computadores": ("tecnologia_informacao", "ti_3_1"),
    "1.2.1.3-ferramentas-de-internet-e-intranet": ("tecnologia_informacao", "ti_3_1"),
    "1.2.1.3-aplicativos-de-internet-e-intranet": ("tecnologia_informacao", "ti_3_1"),
    "1.2.1.3-procedimentos-de-internet-e-intranet": ("tecnologia_informacao", "ti_3_1"),
    "1.2.1.3-microsoft-edge": ("tecnologia_informacao", "ti_3_2"),
    "1.2.1.3-google-chrome": ("tecnologia_informacao", "ti_3_2"),
    "1.2.1.3-microsoft-outlook": ("tecnologia_informacao", "ti_3_3"),
    "1.2.1.3-sitios-de-busca-na-internet": ("tecnologia_informacao", "ti_3_4"),
    "1.2.1.3-sitios-de-pesquisa-na-internet": ("tecnologia_informacao", "ti_3_4"),
    "1.2.1.3-grupos-de-discussao": ("tecnologia_informacao", "ti_3_4"),
    "1.2.1.3-computacao-em-nuvem": ("tecnologia_informacao", "ti_3_5"),
    "1.2.1.3-cloud-computing": ("tecnologia_informacao", "ti_3_5"),
    "1.2.1.4-organizacao-de-informacoes": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-gerenciamento-de-informacoes": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-organizacao-de-arquivos": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-gerenciamento-de-arquivos": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-organizacao-de-pastas": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-gerenciamento-de-pastas": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-organizacao-de-programas": ("tecnologia_informacao", "ti_4"),
    "1.2.1.4-gerenciamento-de-programas": ("tecnologia_informacao", "ti_4"),
    "1.2.1.5-procedimentos-de-seguranca": ("tecnologia_informacao", "ti_5_1"),
    "1.2.1.5-nocoes-de-virus": ("tecnologia_informacao", "ti_5_2"),
    "1.2.1.5-nocoes-de-worms": ("tecnologia_informacao", "ti_5_2"),
    "1.2.1.5-nocoes-de-outras-pragas-virtuais": ("tecnologia_informacao", "ti_5_2"),
    "1.2.1.5-aplicativos-antivirus": ("tecnologia_informacao", "ti_5_3"),
    "1.2.1.5-firewall": ("tecnologia_informacao", "ti_5_3"),
    "1.2.1.5-aplicativos-anti-spyware": ("tecnologia_informacao", "ti_5_3"),
    "1.2.1.5-procedimentos-de-backup": ("tecnologia_informacao", "ti_5_4"),
    "1.2.1.5-armazenamento-de-dados-na-nuvem": ("tecnologia_informacao", "ti_5_4"),
    "1.2.1.5-cloud-storage": ("tecnologia_informacao", "ti_5_4"),
    "1.2.1.6-organizacao-de-arquivos": ("tecnologia_informacao", "ti_6_1"),
    "1.2.1.6-metodos-de-acesso": ("tecnologia_informacao", "ti_6_1"),
    "1.2.1.6-abstracao-de-dados": ("tecnologia_informacao", "ti_6_1"),
    "1.2.1.6-modelos-de-dados": ("tecnologia_informacao", "ti_6_1"),
    "1.2.1.6-sistemas-gerenciadores-de-banco-de-dados": ("tecnologia_informacao", "ti_6_2"),
    "1.2.1.6-linguagens-de-definicao-de-dados": ("tecnologia_informacao", "ti_6_2"),
    "1.2.1.6-linguagens-de-manipulacao-de-dados": ("tecnologia_informacao", "ti_6_2"),
    "1.2.1.6-sql": ("tecnologia_informacao", "ti_6_2"),
    "1.2.1.6-controle-de-protecao": ("tecnologia_informacao", "ti_6_3"),
    "1.2.1.6-seguranca-de-banco-de-dados": ("tecnologia_informacao", "ti_6_3"),
    "1.2.1.6-integridade-de-banco-de-dados": ("tecnologia_informacao", "ti_6_3"),
    "1.2.1.6-bancos-de-dados-distribuidos": ("tecnologia_informacao", "ti_6_3"),
    "1.2.1.6-bancos-de-dados-orientados-a-objetos": ("tecnologia_informacao", "ti_6_3"),
    "1.2.1.7-lei-n-13-709-2018": ("tecnologia_informacao", "ti_7"),
    "1.2.1.7-lei-geral-de-protecao-de-dados-pessoais": ("tecnologia_informacao", "ti_7"),
    "1.2.1.7-lgpd": ("tecnologia_informacao", "ti_7"),
    "1.2.1.8-conceitos-de-servicos-publicos-digitais": ("tecnologia_informacao", "ti_8"),
    "1.2.1.9-conceitos-de-inteligencia-artificial": ("tecnologia_informacao", "ti_9"),
    "1.2.1.10-java": ("tecnologia_informacao", "ti_10"),
    "1.2.1.10-python": ("tecnologia_informacao", "ti_10"),
    "1.2.1.10-apex": ("tecnologia_informacao", "ti_10"),
    "1.2.1.10-c": ("tecnologia_informacao", "ti_10"),
    # Ciber
    "1.2.2.1-confidencialidade": ("seguranca_cibernetica", "ciber_1"),
    "1.2.2.1-integridade": ("seguranca_cibernetica", "ciber_1"),
    "1.2.2.1-disponibilidade": ("seguranca_cibernetica", "ciber_1"),
    "1.2.2.2-avaliacao-de-riscos": ("seguranca_cibernetica", "ciber_2"),
    "1.2.2.2-politicas-de-seguranca": ("seguranca_cibernetica", "ciber_2"),
    "1.2.2.2-conformidade-com-normas": ("seguranca_cibernetica", "ciber_2"),
    "1.2.2.2-conformidade-com-regulamentacoes": ("seguranca_cibernetica", "ciber_2"),
    "1.2.2.3-firewalls": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.3-sistemas-de-deteccao-de-intrusao-ids": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.3-sistemas-de-prevencao-de-intrusao-ips": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.3-redes-privadas-virtuais-vpn": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.3-segmentacao-de-rede": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.4-tecnicas-de-criptografia": ("seguranca_cibernetica", "ciber_4"),
    "1.2.2.4-principais-ferramentas-de-criptografia": ("seguranca_cibernetica", "ciber_4"),
    "1.2.2.5-praticas-de-seguranca-para-ambientes-de-nuvem": ("seguranca_cibernetica", "ciber_5"),
    "1.2.2.6-autenticacao": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.6-autorizacao": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.6-single-sign-on-sso": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.6-security-assertion-markup-language-saml": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.6-oauth-2": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.6-openid-connect": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.7-principais-tipos-de-ataques-ciberneticos": ("seguranca_cibernetica", "ciber_7"),
    "1.2.2.7-principais-vulnerabilidades": ("seguranca_cibernetica", "ciber_7"),
    "1.2.2.8-controles-de-seguranca-para-aplicacoes-web": ("seguranca_cibernetica", "ciber_8"),
    "1.2.2.8-testes-de-seguranca-para-aplicacoes-web": ("seguranca_cibernetica", "ciber_8"),
    "1.2.2.8-controles-de-seguranca-para-web-services": ("seguranca_cibernetica", "ciber_8"),
}

TOPIC_FALLBACK = {
    "1.1.5-estrutura-morfossintatica": ("lingua_portuguesa", "port_5_5"),
    "1.1.6-reescrita-de-frases-e-paragrafos": ("lingua_portuguesa", "port_6_4"),
    "1.2.1.1-sistemas-operacionais": ("tecnologia_informacao", "ti_1"),
    "1.2.1.2-aplicativos-de-escritorio": ("tecnologia_informacao", "ti_2"),
    "1.2.1.3-redes-de-computadores": ("tecnologia_informacao", "ti_3_1"),
    "1.2.1.4-organizacao-e-gerenciamento-de-informacoes": ("tecnologia_informacao", "ti_4"),
    "1.2.1.5-seguranca-da-informacao": ("tecnologia_informacao", "ti_5_1"),
    "1.2.1.6-banco-de-dados": ("tecnologia_informacao", "ti_6_1"),
    "1.2.1.7-protecao-de-dados-pessoais": ("tecnologia_informacao", "ti_7"),
    "1.2.1.8-servicos-publicos-digitais": ("tecnologia_informacao", "ti_8"),
    "1.2.1.9-inteligencia-artificial": ("tecnologia_informacao", "ti_9"),
    "1.2.1.10-linguagens-de-programacao": ("tecnologia_informacao", "ti_10"),
    "1.2.2.1-fundamentos-de-seguranca-da-informacao": ("seguranca_cibernetica", "ciber_1"),
    "1.2.2.2-gestao-de-riscos-e-conformidade": ("seguranca_cibernetica", "ciber_2"),
    "1.2.2.3-seguranca-de-rede": ("seguranca_cibernetica", "ciber_3"),
    "1.2.2.4-criptografia": ("seguranca_cibernetica", "ciber_4"),
    "1.2.2.5-seguranca-em-nuvem": ("seguranca_cibernetica", "ciber_5"),
    "1.2.2.6-gestao-de-identidades-e-acessos": ("seguranca_cibernetica", "ciber_6"),
    "1.2.2.7-ataques-e-vulnerabilidades": ("seguranca_cibernetica", "ciber_7"),
    "1.2.2.8-seguranca-de-aplicacoes": ("seguranca_cibernetica", "ciber_8"),
}

BANK_FILES = {
    "lingua_portuguesa": BANK_LP,
    "tecnologia_informacao": BANK_TI,
    "seguranca_cibernetica": BANK_CIBER,
}

BANK_LABELS = {
    "lingua_portuguesa": "Língua Portuguesa",
    "tecnologia_informacao": "Tecnologia da Informação",
    "seguranca_cibernetica": "Segurança Cibernética",
}


def norm_text(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def hash_stmt(text):
    return hashlib.sha256(norm_text(text).encode("utf-8")).hexdigest()[:16]


def flatten_explanation(exp):
    if exp is None:
        return "Sem resolução."
    if isinstance(exp, str):
        return exp.strip() or "Sem resolução."
    if not isinstance(exp, dict):
        return str(exp)
    parts = []
    for key, label in (
        ("resumo", None),
        ("detalhada", None),
        ("fundamento", "Fundamento"),
        ("erroProvavel", "Erro provável"),
        ("dicaMemorizacao", "Dica"),
    ):
        val = exp.get(key)
        if not val:
            continue
        parts.append(f"{label}: {val}" if label else str(val).strip())
    wrong = exp.get("porqueAlternativasEstaoErradas") or {}
    if isinstance(wrong, dict):
        for k, v in wrong.items():
            if v:
                parts.append(f"Por que {k} está errada: {v}")
    return "\n\n".join(parts) if parts else "Sem resolução."


def map_ce(gab):
    g = str(gab or "").strip().upper()
    if g in ("C", "CERTO", "TRUE", "1", "CORRETO"):
        return "C", True
    if g in ("E", "ERRADO", "FALSE", "0", "INCORRETO"):
        return "E", False
    return None, None


def load_bank(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def write_bank(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def update_index(banks_by_disc):
    index = {"versao": 1, "geradoEm": datetime.now(timezone.utc).isoformat(), "disciplinas": [], "quantidade": 0}
    if INDEX.exists():
        index = json.loads(INDEX.read_text(encoding="utf-8"))

    # keep existing non-managed entries; upsert managed
    managed = set(BANK_FILES.keys()) | {"analise_de_dados", "dh"}
    existing = {d["id"]: d for d in index.get("disciplinas", [])}

    # ensure known static entries stay
    for disc_id, path in {
        "analise_de_dados": QDIR / "analise_de_dados.json",
        "dh": QDIR / "curated" / "detona_ineditas_pacto_sao_jose.json",
        **{k: v for k, v in BANK_FILES.items()},
    }.items():
        if disc_id in banks_by_disc:
            bank = banks_by_disc[disc_id]
        elif path.exists():
            bank = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(bank, list):
                bank = bank.get("questoes") or bank.get("questions") or []
        else:
            continue
        por_tipo = Counter(q.get("tipo") or q.get("format") for q in bank)
        por_banca = Counter(q.get("banca") or "Não informada" for q in bank)
        rel = "./data/questions/" + path.relative_to(QDIR).as_posix() if path.is_relative_to(QDIR) else str(path)
        # fix relative path format used by app
        if disc_id == "dh":
            rel = "./data/questions/curated/detona_ineditas_pacto_sao_jose.json"
        elif disc_id == "analise_de_dados":
            rel = "./data/questions/analise_de_dados.json"
        elif disc_id == "lingua_portuguesa":
            rel = "./data/questions/lingua_portuguesa.json"
        elif disc_id == "tecnologia_informacao":
            rel = "./data/questions/tecnologia_informacao.json"
        elif disc_id == "seguranca_cibernetica":
            rel = "./data/questions/seguranca_cibernetica.json"

        prev = existing.get(disc_id, {})
        existing[disc_id] = {
            "id": disc_id,
            "arquivo": rel,
            "quantidade": len(bank),
            "porTipo": dict(por_tipo),
            "porBanca": dict(por_banca),
            "hash": hashlib.sha256(
                json.dumps([q.get("id") for q in bank], ensure_ascii=False).encode("utf-8")
            ).hexdigest(),
            "versao": int(prev.get("versao") or 0) + 1,
        }

    # preserve order: analise, lp, ti, ciber, dh, others
    order = ["analise_de_dados", "lingua_portuguesa", "tecnologia_informacao", "seguranca_cibernetica", "dh"]
    disciplinas = []
    seen = set()
    for oid in order:
        if oid in existing:
            disciplinas.append(existing[oid])
            seen.add(oid)
    for oid, d in existing.items():
        if oid not in seen:
            disciplinas.append(d)
    index["disciplinas"] = disciplinas
    index["quantidade"] = sum(d.get("quantidade", 0) for d in disciplinas)
    index["geradoEm"] = datetime.now(timezone.utc).isoformat()
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    return index


def main(do_import=False):
    incoming = json.loads(SRC.read_text(encoding="utf-8"))
    if not isinstance(incoming, list):
        incoming = incoming.get("questions") or []

    banks = {k: load_bank(p) for k, p in BANK_FILES.items()}
    existing_ids = set()
    existing_hashes = set()
    for rows in banks.values():
        for q in rows:
            existing_ids.add(q.get("id"))
            existing_hashes.add(hash_stmt(q.get("enunciado") or q.get("statement") or ""))

    converted_by = defaultdict(list)
    report_rows = []
    stats = Counter()
    stats["received"] = len(incoming)
    seen_batch_ids = set()
    seen_batch_hashes = set()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for q in incoming:
        qid = q.get("id") or ""
        stmt = q.get("enunciado") or ""
        h = hash_stmt(stmt)
        row = {"id": qid, "sourceSubtopicId": q.get("subtopicoId"), "sourceTopicId": q.get("topicoId")}

        mapped = SUBTOPIC_MAP.get(q.get("subtopicoId") or "") or TOPIC_FALLBACK.get(q.get("topicoId") or "")
        if not mapped:
            stats["unmapped"] += 1
            row["action"] = "skip_unmapped"
            report_rows.append(row)
            continue
        disc_id, topic_id = mapped

        if qid in seen_batch_ids:
            stats["dup_id_batch"] += 1
            row["action"] = "skip_dup_id_batch"
            report_rows.append(row)
            continue
        seen_batch_ids.add(qid)

        if qid in existing_ids:
            stats["dup_id_existing"] += 1
            row["action"] = "skip_dup_id_existing"
            report_rows.append(row)
            continue

        if h in seen_batch_hashes:
            stats["dup_hash_batch"] += 1
            row["action"] = "skip_dup_hash_batch"
            report_rows.append(row)
            continue
        seen_batch_hashes.add(h)

        if h in existing_hashes:
            stats["dup_hash_existing"] += 1
            row["action"] = "skip_dup_hash_existing"
            report_rows.append(row)
            continue

        t = (q.get("tipo") or "").lower()
        if t in ("certo_errado", "true_false", "ce"):
            tipo = "certo_errado"
            resp, correct_answer = map_ce(q.get("gabarito"))
            if resp is None:
                stats["invalid_answer"] += 1
                row["action"] = "skip_invalid_ce"
                report_rows.append(row)
                continue
            alts = []
            options = ["Certo", "Errado"]
        else:
            stats["unknown_type"] += 1
            row["action"] = "skip_unknown_type"
            report_rows.append(row)
            continue

        banca = q.get("banca") or ""
        if str(banca).upper() in ("CESPE", "CEBRASPE"):
            banca = "CEBRASPE"

        expl = flatten_explanation(q.get("explicacao"))
        fonte = q.get("fonte") or {}
        if isinstance(fonte, str):
            fonte = {"referencia": fonte}
        classificacao = q.get("classificacao") or {}
        controle = q.get("controle") or {}

        item = {
            "id": qid,
            "concursoId": "pc_al_2026",
            "cargoId": "agente_policia",
            "disciplinaId": disc_id,
            "assunto": q.get("topicoId") or "",
            "subtopico": q.get("subtopicoId") or "",
            "banca": banca or "Não informada",
            "ano": None,
            "fonteProva": fonte.get("referencia") or fonte.get("arquivo") or "Ciclos 002–006 PC-AL",
            "tipo": tipo,
            "enunciado": stmt,
            "contextoCompartilhado": "",
            "alternativas": alts,
            "respostaCorreta": resp,
            "explicacao": expl,
            "status": "revisao",
            "situacao": "revisao",
            "versao": int(q.get("schemaVersion") or 1),
            "topicoEditalId": topic_id,
            "subtopic_id": topic_id,
            "fonte": f"Ciclos 002–006 · {fonte.get('arquivo') or 'edital'}".strip(" ·"),
            "dificuldade": str(classificacao.get("dificuldade") or ""),
            "format": tipo,
            "statement": stmt,
            "options": options,
            "correct_answer": correct_answer,
            "explanation": expl,
            "is_user_created": False,
            "created_at": now,
            "createdAt": now,
            "updatedAt": now,
            "metadata": {
                "origemArquivo": SRC.name,
                "origemImport": ORIGEM,
                "sourceSubtopicId": q.get("subtopicoId"),
                "sourceTopicId": q.get("topicoId"),
                "mappedTopicoEditalId": topic_id,
                "hashQuestao": h,
                "revisado": False,
                "statusImportacao": "revisao",
                "classificacao": classificacao,
                "fonteDetalhe": fonte,
                "controle": controle,
                "cargoIds": q.get("cargoIds") or [],
                "noXpOnImport": True,
            },
        }
        converted_by[disc_id].append(item)
        existing_ids.add(qid)
        existing_hashes.add(h)
        stats["converted"] += 1
        stats[f"converted_{disc_id}"] += 1
        row["action"] = "convert"
        row["disciplinaId"] = disc_id
        row["mappedTopicoEditalId"] = topic_id
        report_rows.append(row)

    all_converted = [q for rows in converted_by.values() for q in rows]
    OUT_READY.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_READY.write_text(json.dumps({
        "schemaVersion": 1,
        "name": "pcal-ciclos-002-a-006-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "quantity": len(all_converted),
        "byDisciplina": {k: len(v) for k, v in converted_by.items()},
        "questions": all_converted,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    analysis = {
        "received": stats["received"],
        "converted": stats["converted"],
        "byDisciplina": {k: len(v) for k, v in converted_by.items()},
        "unmapped": stats["unmapped"],
        "duplicates": stats["dup_id_existing"] + stats["dup_hash_existing"] + stats["dup_id_batch"] + stats["dup_hash_batch"],
        "stats": dict(stats),
        "rows": report_rows,
        "readyFile": str(OUT_READY),
        "noXpOnImport": True,
        "noReplaceExisting": True,
    }
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== PRE-IMPORT CICLOS 002–006 ===")
    print(json.dumps({
        "received": analysis["received"],
        "converted": analysis["converted"],
        "byDisciplina": analysis["byDisciplina"],
        "unmapped": analysis["unmapped"],
        "duplicates": analysis["duplicates"],
    }, ensure_ascii=False, indent=2))

    if not do_import:
        return analysis

    counts_before = {k: len(v) for k, v in banks.items()}
    for disc_id, items in converted_by.items():
        banks[disc_id].extend(items)
        write_bank(BANK_FILES[disc_id], banks[disc_id])

    index = update_index(banks)
    analysis["countsBefore"] = counts_before
    analysis["countsAfter"] = {k: len(v) for k, v in banks.items()}
    analysis["indexTotal"] = index["quantidade"]
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=== IMPORTED ===", analysis["countsBefore"], "→", analysis["countsAfter"], "index", index["quantidade"])
    return analysis


if __name__ == "__main__":
    import sys
    main(do_import="--import" in sys.argv)
