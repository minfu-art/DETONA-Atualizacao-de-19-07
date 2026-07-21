# -*- coding: utf-8 -*-
"""Convert and import PC-AL LP simulado 02 into phase6 question bank (append-only)."""
import json
import hashlib
import re
import unicodedata
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

SRC = Path(r"C:\Users\wwwmi\Downloads\deepseek_json_20260716_c9a582.json")
PHASE6 = Path(r"C:\Users\wwwmi\OneDrive\Documentos\DETONA CONCURSOS\.phase6-grok-work")
BANK = PHASE6 / "app" / "data" / "questions" / "lingua_portuguesa.json"
INDEX = PHASE6 / "app" / "data" / "questions" / "index.json"
OUT_READY = PHASE6 / "app" / "imports" / "questions" / "pcal-lingua-portuguesa-simulado-02-ready.json"
OUT_REPORT = PHASE6 / "app" / "reports" / "pcal-lp-simulado-02-import-report.json"
ORIGEM_IMPORT = "pcal-lingua-portuguesa-simulado-02"

EDITAL_SUBTOPICS = {
    "port_1", "port_2", "port_3", "port_4_1", "port_4_2",
    "port_5_1", "port_5_2", "port_5_3", "port_5_4", "port_5_5", "port_5_6", "port_5_7", "port_5_8",
    "port_6_1", "port_6_2", "port_6_3", "port_6_4",
}

SUBTOPIC_MAP = {
    # sintaxe / regência
    "regencia-verbal": "port_5_6",
    "funcao-sintatica-pronomes": "port_5_8",
    "pronomes-relativos": "port_5_8",
    "periodo-simples-composto": "port_5_3",
    "sujeito-predicado": "port_5_3",
    "ordem-direta-inversa": "port_5_3",
    "coordenacao": "port_5_2",
    "oracoes-adjetivas": "port_5_3",
    "oracoes-adverbiais": "port_5_3",
    "oracoes-reduzidas": "port_5_3",
    "conjuncoes": "port_4_1",
    # colocação
    "proclise-enclise-mesoclise": "port_5_8",
    # semântica / léxico
    "sinonimos": "port_6_1",
    "figuras-de-linguagem": "port_6_1",
    "figuras-de-som": "port_6_1",
    "sentido-ambiguidade": "port_6_1",
    "estrangeirismos": "port_6_1",
    # pontuação
    "uso-da-virgula": "port_5_4",
    # tipologia / discurso / linguagem
    "tipos-textuais": "port_2",
    "discurso-direto-indireto": "port_2",
    "verbos-dicendi": "port_4_2",
    "formal-informal": "port_6_4",
    "funcoes-linguagem": "port_2",
    "oralidade": "port_2",
    # fonética / grafia
    "digrafos": "port_3",
}

TOPIC_MAP = {
    "sintaxe": "port_5_3",
    "semantica": "port_6_1",
    "colocacao-pronominal": "port_5_8",
    "linguagem": "port_2",
    "reescrita-de-frases": "port_6_4",
    "tipologia-textual": "port_2",
    "fonetica": "port_3",
    "frase-oracao-periodo": "port_5_3",
    "tipos-de-discurso": "port_2",
    "relacao-coordenacao-subordinacao": "port_5_2",
    "pontuacao": "port_5_4",
}


def norm_text(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def hash_stmt(text):
    return hashlib.sha256(norm_text(text).encode("utf-8")).hexdigest()[:16]


def main(do_import=False):
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    incoming = raw.get("questions") or []
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
        stmt = q.get("questionText") or ""
        h = hash_stmt(stmt)
        row = {"id": qid, "sourceSubtopicId": q.get("subtopicId"), "sourceTopicId": q.get("topicId")}

        src_sub = q.get("subtopicId") or ""
        mapped = SUBTOPIC_MAP.get(src_sub) or TOPIC_MAP.get(q.get("topicId") or "")
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

        t = q.get("type") or ""
        if t in ("true_false", "certo_errado"):
            tipo = "certo_errado"
            alts = []
            ca = q.get("correctAnswer")
            if ca is True or str(ca).lower() in ("true", "c", "certo", "1"):
                resp = "C"
            elif ca is False or str(ca).lower() in ("false", "e", "errado", "0"):
                resp = "E"
            else:
                stats["invalid_answer"] += 1
                row["action"] = "skip_invalid_ce"
                report_rows.append(row)
                continue
            options = ["Certo", "Errado"]
            correct_answer = True if resp == "C" else False
        elif t in ("multiple_choice", "multipla_escolha"):
            tipo = "multipla_escolha"
            raw_alts = q.get("alternatives") or []
            alts = []
            if isinstance(raw_alts, list):
                for i, a in enumerate(raw_alts):
                    if isinstance(a, dict):
                        letra = (a.get("letter") or a.get("letra") or a.get("id") or chr(65 + i))
                        texto = a.get("text") or a.get("texto") or a.get("label") or ""
                        alts.append({"letra": str(letra).upper()[:1], "texto": str(texto)})
                    else:
                        alts.append({"letra": chr(65 + i), "texto": str(a)})
            ca = q.get("correctAnswer")
            resp = str(ca).strip().upper()[:1] if ca is not None else None
            if not resp or len(alts) < 2:
                stats["invalid_answer"] += 1
                row["action"] = "skip_invalid_mc"
                report_rows.append(row)
                continue
            options = [f"{a['letra']}) {a['texto']}" for a in alts]
            correct_answer = resp
        else:
            stats["unknown_type"] += 1
            row["action"] = "skip_unknown_type"
            report_rows.append(row)
            continue

        banca = q.get("board") or ""
        if str(banca).upper() in ("CESPE", "CEBRASPE"):
            banca = "CEBRASPE"

        # needsReview no source → status revisao; demais também em revisão até validação humana
        item = {
            "id": qid,
            "concursoId": "pc_al_2026",
            "cargoId": "agente_policia",
            "disciplinaId": "lingua_portuguesa",
            "assunto": q.get("topicId") or "",
            "subtopico": q.get("subtopicId") or "",
            "banca": banca or "Não informada",
            "ano": q.get("year"),
            "fonteProva": " / ".join(
                [x for x in [q.get("agency"), q.get("exam"), str(q.get("year") or "")] if x]
            ) or (q.get("sourceFile") or "PDF simulado 02"),
            "tipo": tipo,
            "enunciado": stmt,
            "contextoCompartilhado": q.get("supportText") or "",
            "alternativas": alts,
            "respostaCorreta": resp,
            "explicacao": q.get("explanation") or "Sem resolução.",
            "status": "revisao",
            "situacao": "revisao",
            "versao": 1,
            "topicoEditalId": mapped,
            "subtopic_id": mapped,
            "fonte": f"PDF simulado 02 · {q.get('sourceFile') or ''}".strip(" ·"),
            "dificuldade": "",
            "format": tipo,
            "statement": stmt,
            "options": options,
            "correct_answer": correct_answer,
            "explanation": q.get("explanation") or "Sem resolução.",
            "is_user_created": False,
            "created_at": now,
            "createdAt": now,
            "updatedAt": now,
            "metadata": {
                "origemArquivo": q.get("sourceFile") or SRC.name,
                "origemImport": ORIGEM_IMPORT,
                "sourcePage": q.get("sourcePage"),
                "sourceQuestionNumber": q.get("sourceQuestionNumber"),
                "sourceSubtopicId": q.get("subtopicId"),
                "sourceTopicId": q.get("topicId"),
                "mappedTopicoEditalId": mapped,
                "hashQuestao": h,
                "revisado": False,
                "statusImportacao": "revisao",
                "needsReviewSource": bool(q.get("needsReview")),
                "requiresMedia": bool(q.get("requiresMedia")),
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
        "name": "pcal-lingua-portuguesa-simulado-02-ready",
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
        "B_compatibleAfterMapping": stats["converted"],
        "C_converted": stats["converted"],
        "D_duplicates": dup_total,
        "E_unmappedOrMissingSubtopic": stats["unmapped_subtopic"],
        "F_requiresReview": len(converted),
        "G_bankFile": str(BANK) if do_import else "(not modified yet)",
        "subtopicMapUsed": SUBTOPIC_MAP,
        "topicMapUsed": TOPIC_MAP,
        "byTopicoEditalId": dict(by_map),
        "existingBankCountBefore": len(bank),
        "readyFile": str(OUT_READY),
        "noStudentProgressTouch": True,
        "noXpOnImport": True,
        "noReplaceExisting": True,
        "stats": dict(stats),
        "rows": report_rows,
    }
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== PRE-IMPORT SIMULADO 02 ===")
    print(json.dumps({
        "received": analysis["A_received"],
        "converted": analysis["C_converted"],
        "duplicates": analysis["D_duplicates"],
        "unmapped": analysis["E_unmappedOrMissingSubtopic"],
        "byTopico": analysis["byTopicoEditalId"],
        "ready": str(OUT_READY),
        "report": str(OUT_REPORT),
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

    analysis["G_bankFile"] = str(BANK)
    analysis["imported"] = len(converted)
    analysis["bankCountAfter"] = len(bank)
    analysis["bankCountBefore"] = before
    OUT_REPORT.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=== IMPORTED ===", len(converted), "before", before, "after", len(bank))
    return analysis


if __name__ == "__main__":
    import sys
    main(do_import="--import" in sys.argv)
