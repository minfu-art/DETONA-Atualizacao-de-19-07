"""Rebuild a traceable PRF microknowledge map without inventing missing units."""

import hashlib
import json
import pathlib
from collections import Counter

from prf_microknowledge_seeds_v2 import SEEDS


ROOT = pathlib.Path(__file__).resolve().parents[1]
COURSE = ROOT / "course-drafts" / "prf-pre-edital"
CURRICULUM = COURSE / "course-bundle" / "curriculum.json"
OUTPUT = COURSE / "master-microknowledge-map-v2.draft.json"
CONTRAN_SNAPSHOT = COURSE / "sources" / "contran-2026-10-13-official-index.v1.json"
OFFICIAL_URL = "https://www.gov.br/prf/pt-br/concurso-2021/etapa1/provas/edital-verticalizado-1.pdf"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def seed_key(topic, subtopic):
    if subtopic["name"] == "Aplicações" and topic["name"].startswith("2."):
        return "Aplicações — Funções"
    if subtopic["name"] == "Aplicações" and topic["name"].startswith("10."):
        return "Aplicações — Métrica"
    if subtopic["name"] == "Causas de exclusão" and topic["name"].startswith("4."):
        return "Causas de exclusão — Ilicitude"
    if subtopic["name"] == "Causas de exclusão" and topic["name"].startswith("5."):
        return "Causas de exclusão — Culpabilidade"
    if subtopic["name"] == "Gramática relevante para compreensão semântica" and "Inglesa" in topic["name"]:
        return "Gramática relevante para compreensão semântica — Inglês"
    if subtopic["name"] == "Gramática relevante para compreensão semântica" and "Espanhola" in topic["name"]:
        return "Gramática relevante para compreensão semântica — Espanhol"
    return subtopic["name"]


def main():
    curriculum = read_json(CURRICULUM)
    role = curriculum["roles"][0]
    existing = {}
    for file in sorted((COURSE / "production").glob("portuguese-editorial-batch-*.v1.json")):
        for micro in read_json(file).get("microknowledges", []):
            previous = existing.get(micro["id"])
            if previous and (previous["title"], previous["subtopic_id"]) != (micro["title"], micro["subtopic_id"]):
                raise ValueError(f"Conflicting definition for {micro['id']}")
            existing.setdefault(micro["id"], micro)
    if len(existing) != 378:
        raise ValueError(f"Expected 378 existing units, found {len(existing)}")
    contran_snapshot = read_json(CONTRAN_SNAPSHOT)
    resolutions = {item["subtopic_id"]: item for item in contran_snapshot["resolutions"]}
    if len(resolutions) != 39 or len(contran_snapshot["resolutions"]) != 39:
        raise ValueError("Expected 39 distinct CONTRAN resolutions in official snapshot")
    existing_by_subtopic = {}
    for micro in existing.values():
        existing_by_subtopic.setdefault(micro["subtopic_id"], []).append(micro)

    seen_seed_keys = set()
    subtopics = []
    all_ids = set()
    for discipline in role["disciplines"]:
        for topic in discipline["topics"]:
            for subtopic in topic["subtopics"]:
                key = seed_key(topic, subtopic)
                proposals = SEEDS.get(discipline["name"], {}).get(key, [])
                if proposals:
                    seed_id = (discipline["name"], key)
                    if seed_id in seen_seed_keys:
                        raise ValueError(f"Seed reused for more than one subtopic: {seed_id}")
                    seen_seed_keys.add(seed_id)
                microknowledges = []
                for micro in existing_by_subtopic.get(subtopic["id"], []):
                    if micro["id"] in all_ids:
                        raise ValueError(f"Duplicate microknowledge ID: {micro['id']}")
                    all_ids.add(micro["id"])
                    microknowledges.append({
                        "id": micro["id"], "title": micro["title"],
                        "status": "existing_editorial", "scope_origin": micro.get("scope_origin"),
                        "traces": micro.get("traces", []),
                    })
                for title in proposals:
                    digest = hashlib.sha1(f"{subtopic['id']}|{title}".encode("utf-8")).hexdigest()[:12]
                    micro_id = f"prf_2026_mk_v2_{digest}"
                    if micro_id in all_ids:
                        raise ValueError(f"Duplicate proposed microknowledge ID: {micro_id}")
                    all_ids.add(micro_id)
                    microknowledges.append({
                        "id": micro_id, "title": title,
                        "status": "new_draft_requires_editorial_review",
                        "scope_origin": "canonical_2021_curriculum_decomposition",
                        "traces": [{
                            "source_id": "prf_2021_official_verticalized_edital",
                            "source_url": OFFICIAL_URL,
                            "canonical_subtopic_id": subtopic["id"],
                            "trace_status": "subtopic_heading_only_page_pending",
                        }],
                        "scope_review_required": True,
                    })
                resolution = resolutions.get(subtopic["id"])
                if resolution and discipline["name"] != "Legislação de Trânsito":
                    raise ValueError(f"CONTRAN resolution outside traffic: {subtopic['id']}")
                subtopics.append({
                    "discipline_id": discipline["id"], "discipline": discipline["name"],
                    "topic_id": topic["id"], "topic": topic["name"],
                    "subtopic_id": subtopic["id"], "subtopic": subtopic["name"],
                    "microknowledge_count": len(microknowledges),
                    "coverage_status": "draft_map_present" if microknowledges else "decomposition_pending",
                    "normative_reconciliation_required": discipline["name"] in {
                        "Legislação de Trânsito", "Legislação Especial", "Direito Administrativo",
                        "Direito Constitucional", "Direito Penal", "Direito Processual Penal",
                        "Direitos Humanos", "Ética e Cidadania", "Geopolítica",
                    },
                    "contran_index_evidence": ({
                        "retrieved_on": contran_snapshot["retrieved_on"],
                        "source_url": contran_snapshot["source_url"],
                        "resolution_number": resolution["number"],
                        "edital_year": resolution["edital_year"],
                        "index_year": resolution["index_year"],
                        "edital_index_year_mismatch": resolution["edital_index_year_mismatch"],
                        "retified_2021_scope": resolution["retified_2021_scope"],
                        "retified_2021_year": resolution["retified_2021_year"],
                        "index_description": resolution["description"],
                        "index_note": resolution["index_note"],
                        "index_status": resolution["index_status"],
                        "act_links": resolution["act_links"],
                        "review_status": resolution["normative_review_status"],
                    } if resolution else None),
                    "microknowledges": microknowledges,
                })
    available_seeds = {(discipline, key) for discipline, values in SEEDS.items() for key in values}
    if available_seeds != seen_seed_keys:
        raise ValueError(f"Unused seed definitions: {sorted(available_seeds - seen_seed_keys)}")
    if len(subtopics) != 246 or sum(item["microknowledge_count"] for item in subtopics) != len(all_ids):
        raise ValueError("Canonical subtopics or microknowledge IDs failed reconciliation")
    matched_resolutions = {item["subtopic_id"] for item in subtopics if item["contran_index_evidence"]}
    if matched_resolutions != set(resolutions):
        raise ValueError("CONTRAN snapshot did not match all curriculum resolutions")
    summary = {
        "disciplines": len(role["disciplines"]),
        "canonical_subtopics": len(subtopics),
        "subtopics_with_microknowledge": sum(item["microknowledge_count"] > 0 for item in subtopics),
        "subtopics_pending_decomposition": sum(item["microknowledge_count"] == 0 for item in subtopics),
        "existing_microknowledges_preserved": len(existing),
        "new_draft_microknowledges": len(all_ids) - len(existing),
        "total_microknowledges_in_draft": len(all_ids),
        "contran_resolutions_checked_in_index": len(resolutions),
        "contran_resolutions_index_indicates_revoked": contran_snapshot["index_indicates_revoked"],
        "contran_resolution_year_mismatches": contran_snapshot["edital_index_year_mismatches"],
        "retified_2021_traffic_resolutions": contran_snapshot["retified_2021_resolution_count"],
        "removed_from_retified_2021_list": contran_snapshot["removed_from_retified_2021_list"],
        "by_discipline": dict(Counter(item["discipline"] for item in subtopics if item["microknowledge_count"] > 0)),
    }
    result = {
        "schema_version": "prf_master_microknowledge_map_v2_draft",
        "contest_id": "prf_2026", "position_id": role["id"],
        "status": "curriculum_coverage_complete_draft_unvalidated", "publication_blocked": True,
        "curriculum_source": {"file": "course-bundle/curriculum.json", "official_url": OFFICIAL_URL},
        "normative_sources": {
            "ctb": "https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm",
            "contran_index": "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/resolucoes-contran",
            "contran_snapshot_file": "sources/contran-2026-10-13-official-index.v1.json",
            "prf_2021_edital_2_retification": contran_snapshot["retification_source_url"],
            "status": "reconciliation_pending_for_each_applicable_microknowledge",
        },
        "summary": summary, "subtopics": subtopics,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
