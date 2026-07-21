# -*- coding: utf-8 -*-
"""Import ciclo_001 PC-AL Língua Portuguesa (20 questões) — append-only no banco phase6."""
import json
import hashlib
import re
import unicodedata
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

SRC = Path(r"C:\Users\wwwmi\Downloads\ciclo_001_pc_al_lingua_portuguesa_20_questoes.json")
PHASE6 = Path(r"C:\Users\wwwmi\OneDrive\Documentos\DETONA CONCURSOS\.phase6-grok-work")
BANK = PHASE6 / "app" / "data" / "questions" / "lingua_portuguesa.json"
INDEX = PHASE6 / "app" / "data" / "questions" / "index.json"
OUT_READY = PHASE6 / "app" / "imports" / "questions" / "pcal-lingua-portuguesa-ciclo-001-ready.json"
OUT_REPORT = PHASE6 / "app" / "reports" / "pcal-lp-ciclo-001-import-report.json"
ORIGEM_IMPORT = "pcal-lingua-portuguesa-ciclo-001"

EDITAL_SUBTOPICS = {
    "port_1", "port_2", "port_3", "port_4_1", "port_4_2",
    "port_5_1", "port_5_2", "port_5_3", "port_5_4", "port_5_5", "port_5_6", "port_5_7", "port_5_8",
    "port_6_1", "port_6_2", "port_6_3", "port_6_4",
}

# slug de subtópico do ciclo → id do edital verticalizado
SUBTOPIC_MAP = {
    "1.1.1.1-compreensao-de-textos-de-generos-variados": "port_1",
    "1.1.1.2-interpretacao-de-textos-de-generos-variados": "port_1",
    "1.1.2.1-reconhecimento-de-tipos-textuais": "port_2",
    "1.1.2.2-reconhecimento-de-generos-textuais": "port_2",
    "1.1.3.1-dominio-da-ortografia-oficial": "port_3",
    "1.1.4.1-dominio-dos-mecanismos-de-coesao-textual": "port_4_1",
    "1.1.4.2-emprego-de-elementos-de-referenciacao": "port_4_1",
    "1.1.4.3-emprego-de-elementos-de-substituicao": "port_6_2",
    "1.1.4.4-emprego-de-elementos-de-repeticao": "port_4_1",
    "1.1.4.5-emprego-de-conectores": "port_4_1",
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

TOPIC_MAP = {
    "1.1.1-compreensao-interpretacao-de-textos": "port_1",
    "1.1.2-tipos-e-generos-textuais": "port_2",
    "1.1.3-ortografia": "port_3",
    "1.1.4-coesao-textual": "port_4_1",
    "1.1.5-estrutura-morfossintatica": "port_5_3",
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
    if exp.get("resumo"):
        parts.append(str(exp["resumo"]).strip())
    if exp.get("detalhada"):
        parts.append(str(exp["detalhada"]).strip())
    if exp.get("fundamento"):
        parts.append("Fundamento: " + str(exp["fundamento"]).strip())
    if exp.get("erroProvavel"):
        parts.append("Erro provável: " + str(exp["erroProvavel"]).strip())
    if exp.get("dicaMemorizacao"):
        parts.append("Dica: " + str(exp["dicaMemorizacao"]).strip())
    wrong = exp.get("porqueAlternativasEstaoErradas") or {}
    if isinstance(wrong, dict) and wrong:
        for k, v in wrong.items():
            if v:
                parts.append(f"Por que {k} está errada: {v}")
    return "\n\n".join(parts) if parts else "Sem resolução."


def map_gabarito_ce(gab):
    g = str(gab or "").strip().upper()
    if g in ("C", "CERTO", "TRUE", "1", "CORRETO"):
        return "C", True
    if g in ("E", "ERRADO", "FALSE", "0", "INCORRETO"):
        return "E", False
    return None, None


def main(do_import=False):
    incoming = json.loads(SRC.read_text(encoding="utf-8"))
    if not isinstance(incoming, list):
        incoming = incoming.get("questions") or incoming.get("questoes") or []
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
        stmt = q.get("enunciado") or q.get("questionText") or ""
        h = hash_stmt(stmt)
        row = {
            "id": qid,
            "sourceSubtopicId": q.get("subtopicoId"),
            "sourceTopicId": q.get("topicoId"),
        }

        src_sub = q.get("subtopicoId") or ""
        mapped = SUBTOPIC_MAP.get(src_sub) or TOPIC_MAP.get(q.get("topicoId") or "")
        if not mapped or mapped not in EDITAL_SUBTOPICS:
            stats["unmapped_subtopic"] += 1
            row["action"] = "skip_unmapped_subtopic"
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

        t = (q.get("tipo") or q.get("type") or "").lower()
        if t in ("certo_errado", "true_false", "c/e", "ce"):
            tipo = "certo_errado"
            resp, correct_answer = map_gabarito_ce(q.get("gabarito") if "gabarito" in q else q.get("correctAnswer"))
            if resp is None:
                stats["invalid_answer"] += 1
                row["action"] = "skip_invalid_ce"
                report_rows.append(row)
                continue
            alts = []
            options = ["Certo", "Errado"]
        elif t in ("multipla_escolha", "multiple_choice", "multipla"):
            tipo = "multipla_escolha"
            raw_alts = q.get("alternativas") or q.get("alternatives") or []
            alts = []
            for i, a in enumerate(raw_alts):
                if isinstance(a, dict):
                    letra = str(a.get("letra") or a.get("letter") or a.get("id") or chr(65 + i)).upper()[:1]
                    texto = a.get("texto") or a.get("text") or a.get("label") or ""
                    alts.append({"letra": letra, "texto": str(texto)})
                else:
                    alts.append({"letra": chr(65 + i), "texto": str(a)})
            gab = str(q.get("gabarito") or q.get("correctAnswer") or "").strip().upper()[:1]
            if not gab or len(alts) < 2:
                stats["invalid_answer"] += 1
                row["action"] = "skip_invalid_mc"
                report_rows.append(row)
                continue
            resp = gab
            correct_answer = resp
            options = [f"{a['letra']}) {a['texto']}" for a in alts]
        else:
            stats["unknown_type"] += 1
            row["action"] = "skip_unknown_type"
            report_rows.append(row)
            continue

        banca = q.get("banca") or ""
        if str(banca).upper() in ("CESPE", "CEBRASPE"):
            banca = "CEBRASPE"

        expl = flatten_explanation(q.get("explicacao") or q.get("explanation"))
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
            "fonteProva": fonte.get("referencia") or fonte.get("arquivo") or "Ciclo 001 PC-AL",
            "tipo": tipo,
            "enunciado": stmt,
            "contextoCompartilhado": "",
            "alternativas": alts,
            "respostaCorreta": resp,
            "explicacao": expl,
            "status": "revisao",
            "situacao": "revisao",
            "versao": int(q.get("schemaVersion") or 1),
            "topicoEditalId": mapped,
            "subtopic_id": mapped,
            "fonte": f"Ciclo 001 · {fonte.get('arquivo') or 'edital'}".strip(" ·"),
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
                "origemImport": ORIGEM_IMPORT,
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

    ready_payload = {
        "schemaVersion": 1,
        "name": "pcal-lingua-portuguesa-ciclo-001-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "statusDefault": "revisao",
        "quantity": len(converted),
        "questions": converted,
    }
    OUT_READY.write_text(json.dumps(ready_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    dup_total = (
        stats["dup_id_existing"] + stats["dup_id_batch"]
        + stats["dup_hash_existing"] + stats["dup_hash_batch"]
    )
    by_map = Counter(q["topicoEditalId"] for q in converted)
    analysis = {
        "A_received": stats["received"],
        "C_converted": stats["converted"],
        "D_duplicates": dup_total,
        "E_unmapped": stats["unmapped_subtopic"],
        "byTopicoEditalId": dict(by_map),
        "existingBankCountBefore": len(bank),
        "readyFile": str(OUT_READY),
        "noXpOnImport": True,
        "noReplaceExisting": True,
        "stats": dict(stats),
        "rows": report_rows,
    }
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== PRE-IMPORT CICLO 001 ===")
    print(json.dumps({
        "received": analysis["A_received"],
        "converted": analysis["C_converted"],
        "duplicates": analysis["D_duplicates"],
        "unmapped": analysis["E_unmapped"],
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
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=== IMPORTED ===", len(converted), "before", before, "after", len(bank))
    return analysis


if __name__ == "__main__":
    import sys
    main(do_import="--import" in sys.argv)
