# -*- coding: utf-8 -*-
"""Import ciclos corrigidos 006–010 (100 Q) — Língua Portuguesa, append-only.

Fonte principal: pacote ZIP em Downloads (relatório só lista os arquivos).
"""
import json
import hashlib
import re
import unicodedata
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

# Prefer consolidated 100-file from extracted zip; fallback to Downloads root
CANDIDATES = [
    Path(r"C:\Users\wwwmi\Downloads\pacote_ciclos_corrigidos_006_a_010_pc_al\ciclos_corrigidos_006_a_010_pc_al_100_questoes.json"),
    Path(r"C:\Users\wwwmi\Downloads\ciclos_corrigidos_006_a_010_pc_al_100_questoes.json"),
]
PHASE6 = Path(r"C:\Users\wwwmi\OneDrive\Documentos\DETONA CONCURSOS\.phase6-grok-work")
BANK = PHASE6 / "app" / "data" / "questions" / "lingua_portuguesa.json"
INDEX = PHASE6 / "app" / "data" / "questions" / "index.json"
OUT_READY = PHASE6 / "app" / "imports" / "questions" / "pcal-lp-ciclos-corrigidos-006-a-010-ready.json"
OUT_REPORT = PHASE6 / "app" / "reports" / "pcal-lp-ciclos-corrigidos-006-a-010-import-report.json"
ORIGEM = "pcal-lp-ciclos-corrigidos-006-a-010"

EDITAL_SUBTOPICS = {
    "port_1", "port_2", "port_3", "port_4_1", "port_4_2",
    "port_5_1", "port_5_2", "port_5_3", "port_5_4", "port_5_5", "port_5_6", "port_5_7", "port_5_8",
    "port_6_1", "port_6_2", "port_6_3", "port_6_4",
}

SUBTOPIC_MAP = {
    "1.1.4.6-outros-elementos-de-sequenciacao-textual": "port_4_1",
    "1.1.4.7-emprego-de-tempos-verbais": "port_4_2",
    "1.1.4.8-emprego-de-modos-verbais": "port_4_2",
    "1.1.5.1-dominio-da-estrutura-morfossintatica-do-periodo": "port_5_3",
    "1.1.5.2-emprego-das-classes-de-palavras": "port_5_1",
    "1.1.5.3-coordenacao-entre-oracoes": "port_5_2",
    "1.1.5.4-coordenacao-entre-termos-da-oracao": "port_5_2",
    "1.1.5.5-subordinacao-entre-oracoes": "port_5_3",
    "1.1.5.6-subordinacao-entre-termos-da-oracao": "port_5_3",
    "1.1.5.7-emprego-dos-sinais-de-pontuacao": "port_5_4",
}


def resolve_src():
    for p in CANDIDATES:
        if p.exists():
            return p
    raise FileNotFoundError("Arquivo de questões 006–010 não encontrado. Extraia o ZIP do pacote.")


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


def main(do_import=False):
    src = resolve_src()
    incoming = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(incoming, list):
        incoming = incoming.get("questions") or []
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    existing_ids = {q.get("id") for q in bank}
    existing_hashes = {hash_stmt(q.get("enunciado") or q.get("statement") or "") for q in bank}

    converted = []
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

        mapped = SUBTOPIC_MAP.get(q.get("subtopicoId") or "")
        if not mapped or mapped not in EDITAL_SUBTOPICS:
            stats["unmapped"] += 1
            row["action"] = "skip_unmapped"
            report_rows.append(row)
            continue

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

        if (q.get("tipo") or "").lower() not in ("certo_errado", "true_false", "ce"):
            stats["unknown_type"] += 1
            row["action"] = "skip_unknown_type"
            report_rows.append(row)
            continue

        resp, correct_answer = map_ce(q.get("gabarito"))
        if resp is None:
            stats["invalid_answer"] += 1
            row["action"] = "skip_invalid_ce"
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
            "disciplinaId": "lingua_portuguesa",
            "assunto": q.get("topicoId") or "",
            "subtopico": q.get("subtopicoId") or "",
            "banca": banca or "Não informada",
            "ano": None,
            "fonteProva": fonte.get("referencia") or fonte.get("arquivo") or "Ciclos corrigidos 006–010 PC-AL",
            "tipo": "certo_errado",
            "enunciado": stmt,
            "contextoCompartilhado": "",
            "alternativas": [],
            "respostaCorreta": resp,
            "explicacao": expl,
            "status": "revisao",
            "situacao": "revisao",
            "versao": int(q.get("schemaVersion") or 1),
            "topicoEditalId": mapped,
            "subtopic_id": mapped,
            "fonte": f"Ciclos corrigidos 006–010 · {fonte.get('arquivo') or 'edital'}".strip(" ·"),
            "dificuldade": str(classificacao.get("dificuldade") or ""),
            "format": "certo_errado",
            "statement": stmt,
            "options": ["Certo", "Errado"],
            "correct_answer": correct_answer,
            "explanation": expl,
            "is_user_created": False,
            "created_at": now,
            "createdAt": now,
            "updatedAt": now,
            "metadata": {
                "origemArquivo": src.name,
                "origemImport": ORIGEM,
                "sourceSubtopicId": q.get("subtopicoId"),
                "sourceTopicId": q.get("topicoId"),
                "mappedTopicoEditalId": mapped,
                "hashQuestao": h,
                "revisado": False,
                "statusImportacao": "revisao",
                "classificacao": classificacao,
                "fonteDetalhe": fonte,
                "controle": controle,
                "cargoIds": q.get("cargoIds") or [],
                "loteCorrigido": True,
                "ciclos": "006-010",
                "noXpOnImport": True,
            },
        }
        converted.append(item)
        stats["converted"] += 1
        row["action"] = "convert"
        row["mappedTopicoEditalId"] = mapped
        report_rows.append(row)

    OUT_READY.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_READY.write_text(json.dumps({
        "schemaVersion": 1,
        "name": "pcal-lp-ciclos-corrigidos-006-a-010-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceFile": str(src),
        "quantity": len(converted),
        "questions": converted,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    by_map = Counter(q["topicoEditalId"] for q in converted)
    analysis = {
        "sourceFile": str(src),
        "received": stats["received"],
        "converted": stats["converted"],
        "unmapped": stats["unmapped"],
        "duplicates": (
            stats["dup_id_existing"] + stats["dup_id_batch"]
            + stats["dup_hash_existing"] + stats["dup_hash_batch"]
        ),
        "byTopicoEditalId": dict(by_map),
        "existingBankCountBefore": len(bank),
        "stats": dict(stats),
        "rows": report_rows,
        "readyFile": str(OUT_READY),
        "noXpOnImport": True,
        "noReplaceExisting": True,
        "note": "relatorio_ciclos_corrigidos_006_a_010.json não contém questões; importou o pacote ZIP.",
    }
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== PRE-IMPORT CICLOS CORRIGIDOS 006–010 ===")
    print(json.dumps({
        "source": str(src),
        "received": analysis["received"],
        "converted": analysis["converted"],
        "duplicates": analysis["duplicates"],
        "unmapped": analysis["unmapped"],
        "byTopico": analysis["byTopicoEditalId"],
    }, ensure_ascii=False, indent=2))

    if not do_import:
        return analysis

    before = len(bank)
    bank.extend(converted)
    BANK.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    por_tipo = Counter(q.get("tipo") or q.get("format") for q in bank)
    por_banca = Counter(q.get("banca") or "Não informada" for q in bank)
    for d in index.get("disciplinas", []):
        if d.get("id") == "lingua_portuguesa":
            d["quantidade"] = len(bank)
            d["porTipo"] = dict(por_tipo)
            d["porBanca"] = dict(por_banca)
            d["versao"] = int(d.get("versao") or 1) + 1
            d["hash"] = hashlib.sha256(
                json.dumps([q.get("id") for q in bank], ensure_ascii=False).encode("utf-8")
            ).hexdigest()
    index["quantidade"] = sum(d.get("quantidade", 0) for d in index.get("disciplinas", []))
    index["geradoEm"] = datetime.now(timezone.utc).isoformat()
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    analysis["imported"] = len(converted)
    analysis["bankCountAfter"] = len(bank)
    analysis["bankCountBefore"] = before
    analysis["indexTotal"] = index["quantidade"]
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=== IMPORTED ===", len(converted), "before", before, "after", len(bank), "index", index["quantidade"])
    return analysis


if __name__ == "__main__":
    import sys
    main(do_import="--import" in sys.argv)
