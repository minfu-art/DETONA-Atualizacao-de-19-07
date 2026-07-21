/**
 * Parser de questões de apostilas (padrão Estratégia Concursos / CESPE-CEBRASPE).
 *
 * Reconhece seções:
 *   - EXERCÍCIOS COMENTADOS  (com gabarito + comentário)
 *   - EXERCÍCIOS PARA PRATICAR (sem gabarito)
 *
 * Formato típico:
 *   1.  (CESPE – 2019 – ÓRGÃO – CARGO) enunciado...
 *   a) ...
 *   e) ...
 *   COMENTÁRIOS
 *   ...
 *   GABARITO: Letra A  |  GABARITO: ERRADO
 */

const SECTION_COMENTADOS = /EXERC[IÍ]CIOS?\s+COMENTADOS?/i;
const SECTION_PRATICAR = /EXERC[IÍ]CIOS?\s+PARA\s+PRATICAR/i;
const SECTION_LISTA = /LISTA\s+DE\s+QUEST[OÕ]ES/i;

const BANCA_HINT = /\b(CESPE|CEBRASPE|FCC|FGV|VUNESP|IBFC|AOCP|CONSULPLAN|QUADRIX|FUNRIO|IADES|FUNDATEC|CESGRANRIO|ESAF|INSTITUTO\s+AOCP)\b/i;

const GABARITO_RE = /GABARITO\s*[:\-–]?\s*(?:Letra\s*)?([A-Ea-e]|CERTO|ERRADO|CORRETO|CORRETA|INCORRETA|INCORRETO|CERTA|ERRADA|C|E)\b/i;
const GABARITO_ALT = /(?:AFIRMATIVA|ITEM)\s+(?:EST[AÁ]\s+)?(CORRET[AO]|ERRAD[AO]|CERT[OA])\b/i;
const GABARITO_ITEM = /\bITEM\s+(CORRETO|ERRADO|CORRETA|ERRADA)\b/i;
const GABARITO_LETRA_CORRETA = /\b(?:LETRA|ALTERNATIVA)\s*([A-E])\s*(?:[\-\u2013:]\s*)?(?:CORRET[AO]|EST[AÁ]\s+CORRET[AO])?/i;
const GABARITO_A_CORRETA = /^\s*([A-E])\s*[\)\].\-:]\s*CORRET[AO]\b/im;
const COMENT_HEADER = /^\s*COMENT[AÁ]RIOS?\s*$/im;

// a) texto  |  A) texto  |  (A) texto  |  (a) texto
const ALT_LINE = /^\s*(?:\(([a-eA-E])\)|([a-eA-E])\s*[\)\].\-:])\s*(.+)$/;
const PAGE_MARKER = /=====?\s*PAGE\s+(\d+)\s*=====?/i;
const LONE_PAGE_NUM = /^\s*\d{1,3}\s*$/;

export function normalizePdfText(raw = '') {
  let text = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // junta hifenização de fim de linha: "ofe-\nnsa" / "ofe-\n nsa"
  text = text.replace(/(\p{L})-\n\s*(\p{L})/gu, '$1$2');
  // espaços excessivos
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

/**
 * Junta páginas em um único texto com âncoras de página.
 */
export function joinPages(pages = []) {
  return pages.map((p) => `===== PAGE ${p.page} =====\n${p.text || ''}`).join('\n');
}

function countQuestionMarkers(slice) {
  const matches = slice.match(/^\s*\d{1,3}\.\s*\([^)]{0,80}\b(?:CESPE|CEBRASPE|FCC|FGV|VUNESP|IBFC|AOCP)\b/gim);
  return matches ? matches.length : 0;
}

function findSectionRanges(text) {
  const markers = [
    { name: 'comentados', re: SECTION_COMENTADOS },
    { name: 'praticar', re: SECTION_PRATICAR },
    { name: 'lista', re: SECTION_LISTA },
  ];
  const hits = [];
  for (const marker of markers) {
    const re = new RegExp(marker.re.source, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
      // ignora entradas de sumário (linha curta + muitos pontinhos)
      const lineEnd = text.indexOf('\n', match.index);
      const line = text.slice(match.index, lineEnd < 0 ? match.index + 120 : lineEnd);
      if (/\.{4,}/.test(line) || /página|\.{2,}\s*\d+\s*$/i.test(line)) continue;
      hits.push({ name: marker.name, index: match.index, label: match[0].replace(/\s+/g, ' ').trim() });
    }
  }
  hits.sort((a, b) => a.index - b.index);

  // deduplica marcadores muito próximos (< 80 chars)
  const compact = [];
  for (const hit of hits) {
    const prev = compact[compact.length - 1];
    if (prev && hit.name === prev.name && hit.index - prev.index < 80) continue;
    compact.push(hit);
  }

  const ranges = [];
  for (let i = 0; i < compact.length; i += 1) {
    const end = i + 1 < compact.length ? compact[i + 1].index : text.length;
    const slice = text.slice(compact[i].index, end);
    ranges.push({
      ...compact[i],
      end,
      score: countQuestionMarkers(slice),
      chars: slice.length,
    });
  }
  return ranges;
}

function pageAt(text, index) {
  const before = text.slice(0, index);
  const matches = [...before.matchAll(/===== PAGE (\d+) =====/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

function parseFonteHeader(header) {
  // "CESPE – 2019 – CGE-CE – AUDITOR..."
  const clean = String(header || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const parts = clean.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const banca = parts[0] || '';
  let ano = null;
  let rest = [];
  for (let i = 1; i < parts.length; i += 1) {
    if (/^\d{4}$/.test(parts[i]) && ano == null) ano = Number(parts[i]);
    else rest.push(parts[i]);
  }
  const fonte = clean;
  const orgao = rest[0] || '';
  const cargo = rest.slice(1).join(' - ');
  return { banca, ano, orgao, cargo, fonte };
}

function normalizarGabarito(raw) {
  const g = String(raw || '').trim().toUpperCase();
  if (!g) return '';
  if (/^(CERTO|CORRETO|CORRETA|CERTA|C)$/.test(g)) return 'C';
  if (/^(ERRADO|ERRADA|INCORRETA|INCORRETO|E)$/.test(g)) return 'E';
  if (/^[A-E]$/.test(g)) return g;
  return '';
}

function detectTipo(body, gabarito) {
  const lines = body.split('\n');
  let altCount = 0;
  for (const line of lines) {
    if (ALT_LINE.test(line.trim())) altCount += 1;
  }
  if (altCount >= 2) return 'multipla_escolha';
  if (gabarito && /^[A-E]$/.test(gabarito) && altCount >= 2) return 'multipla_escolha';
  if (gabarito && /[CE]/.test(gabarito) && altCount < 2) return 'certo_errado';
  // heurística CESPE
  if (/\bjulgue\b|\bcerto\s+ou\s+errado\b|\bitem\s+(seguinte|subsequente|a\s+seguir)\b/i.test(body)) {
    return 'certo_errado';
  }
  if (/\bassinale\b|\ba\s+op[cç][aã]o\s+correta\b/i.test(body) && altCount >= 2) return 'multipla_escolha';
  return altCount >= 2 ? 'multipla_escolha' : 'certo_errado';
}

function extractAlternativas(body) {
  const alts = { A: '', B: '', C: '', D: '', E: '' };
  const lines = body.split('\n');
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (COMENT_HEADER.test(trimmed) || /^GABARITO\b/i.test(trimmed)) break;
    const m = trimmed.match(ALT_LINE);
    if (m) {
      current = (m[1] || m[2]).toUpperCase();
      alts[current] = (m[3] || '').trim();
      continue;
    }
    if (current && trimmed && !LONE_PAGE_NUM.test(trimmed) && !PAGE_MARKER.test(trimmed)) {
      if (/^\d{1,3}\.\s*(?:\(|\[)/.test(trimmed)) break;
      if (/^COMENT/i.test(trimmed)) break;
      alts[current] = `${alts[current]} ${trimmed}`.trim();
    }
  }
  return alts;
}

function inferGabarito(body) {
  let gabarito = '';
  const gabMatch = body.match(GABARITO_RE);
  if (gabMatch) gabarito = normalizarGabarito(gabMatch[1]);
  if (!gabarito) {
    const alt = body.match(GABARITO_ALT) || body.match(GABARITO_ITEM);
    if (alt) gabarito = normalizarGabarito(alt[1]);
  }
  if (!gabarito) {
    const letra = body.match(GABARITO_LETRA_CORRETA);
    if (letra) gabarito = normalizarGabarito(letra[1]);
  }
  if (!gabarito) {
    const aCorr = body.match(GABARITO_A_CORRETA);
    if (aCorr) gabarito = normalizarGabarito(aCorr[1]);
  }
  // "Alternativa A está correta" / "resposta: A"
  if (!gabarito) {
    const r = body.match(/\b(?:resposta|gabarito|alternativa)\s*[:\-–]?\s*([A-E])\b/i);
    if (r) gabarito = normalizarGabarito(r[1]);
  }
  return gabarito;
}

function stripNoiseLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (PAGE_MARKER.test(t)) return false;
      if (LONE_PAGE_NUM.test(t)) return false;
      if (/^www\.|^http/i.test(t)) return false;
      if (/estratégia\s+concursos|estrategia\s+concursos/i.test(t) && t.length < 40) return false;
      return true;
    })
    .join('\n');
}

function splitQuestionBody(block) {
  // header: N. (FONTE) resto
  const headerMatch = block.match(/^\s*(\d{1,3})\.\s*(?:\(([^)]+)\)|\[([^\]]+)\])\s*([\s\S]*)$/);
  if (headerMatch) {
    return {
      numero: Number(headerMatch[1]),
      header: headerMatch[2] || headerMatch[3] || '',
      body: (headerMatch[4] || '').trim(),
    };
  }
  const loose = block.match(/^\s*(\d{1,3})\.\s+([\s\S]*)$/);
  if (loose) {
    return { numero: Number(loose[1]), header: '', body: loose[2].trim() };
  }
  return { numero: null, header: '', body: block.trim() };
}

function extractComentarioEGabarito(body) {
  let comentario = '';
  let enunciadoPart = body;

  const comentIdx = body.search(COMENT_HEADER);
  const gabIdx = body.search(/GABARITO\s*[:\-–]?/i);
  const gabarito = inferGabarito(body);

  if (comentIdx >= 0) {
    enunciadoPart = body.slice(0, comentIdx).trim();
    let after = body.slice(comentIdx).replace(COMENT_HEADER, '').trim();
    after = after.replace(GABARITO_RE, '').trim();
    after = after.replace(GABARITO_ALT, '').trim();
    comentario = after;
  } else if (gabIdx >= 0) {
    enunciadoPart = body.slice(0, gabIdx).trim();
    const afterGab = body.slice(gabIdx).replace(GABARITO_RE, '').trim();
    // se não há cabeçalho COMENTÁRIOS, usa trechos "Item correto/errado..." como comentário
    if (afterGab.length > 20) comentario = afterGab;
  } else {
    // tenta achar comentário por "Item correto/errado" sem header
    const itemIdx = body.search(/\bITEM\s+(CORRETO|ERRADO|CORRETA|ERRADA)\b/i);
    if (itemIdx > 40) {
      enunciadoPart = body.slice(0, itemIdx).trim();
      comentario = body.slice(itemIdx).trim();
    }
  }

  enunciadoPart = enunciadoPart.replace(GABARITO_RE, '').replace(GABARITO_ALT, '').trim();
  return { enunciadoPart, comentario: comentario.trim(), gabarito };
}

function cleanEnunciado(text, tipo, alts) {
  let e = stripNoiseLines(text).trim();
  if (tipo === 'multipla_escolha') {
    const lines = e.split('\n');
    const cut = [];
    for (const line of lines) {
      if (ALT_LINE.test(line.trim())) break;
      cut.push(line);
    }
    e = cut.join('\n').trim();
  }
  // remove rótulos residuais
  e = e.replace(/\bAlternativas\s*$/i, '').trim();
  e = e.replace(/[ \t]{2,}/g, ' ');
  e = e.replace(/\n{3,}/g, '\n\n').trim();
  return e;
}

/**
 * Parse um bloco de seção em questões.
 */
export function parseSectionText(sectionText, { secao = 'comentados', arquivo = '', requireBanca = true } = {}) {
  const text = normalizePdfText(sectionText);
  const questions = [];
  const warnings = [];

  // Preferência: N. (BANCA …) — reduz lixo de teoria/listas
  const starts = [];
  const re = /^\s*(\d{1,3})\.\s*(?:\(|\[)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const preview = text.slice(m.index, m.index + 120);
    if (requireBanca && !BANCA_HINT.test(preview) && !/\(\s*[A-Z]{2,}/.test(preview)) {
      // aceita se parece cabeçalho de banca genérico entre parênteses com ano
      if (!/\(\s*[^)]*\b(19|20)\d{2}\b/.test(preview)) {
        warnings.push({ numero: Number(m[1]), motivo: 'sem_cabecalho_banca' });
        continue;
      }
    }
    starts.push({ index: m.index, numero: Number(m[1]) });
  }

  if (starts.length < 2 && !requireBanca) {
    const re2 = /^\s*(\d{1,3})\.\s+/gm;
    while ((m = re2.exec(text)) !== null) {
      const slice = text.slice(m.index, m.index + 80);
      if (/^\s*\d{1,3}\.\s*(?:Art\.|§|inciso|al[ií]nea)/i.test(slice)) continue;
      if (/^\s*\d{1,3}\.\s*\d/i.test(slice)) continue;
      starts.push({ index: m.index, numero: Number(m[1]) });
    }
    const seen = new Set();
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      if (seen.has(starts[i].index)) starts.splice(i, 1);
      else seen.add(starts[i].index);
    }
    starts.sort((a, b) => a.index - b.index);
  }

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const block = text.slice(start, end).trim();
    const { numero, header, body } = splitQuestionBody(block);
    if (!body || body.length < 20) {
      warnings.push({ numero, motivo: 'bloco_muito_curto' });
      continue;
    }

    const meta = parseFonteHeader(header);
    const { enunciadoPart, comentario, gabarito } = extractComentarioEGabarito(body);
    const alts = extractAlternativas(enunciadoPart);
    let tipo = detectTipo(enunciadoPart, gabarito);
    // se gabarito é A-E e há alternativas, força ME
    if (/^[A-E]$/.test(gabarito) && Object.values(alts).filter(Boolean).length >= 2) {
      tipo = 'multipla_escolha';
    }
    // se gabarito C/E e sem alts, CE
    if (/^[CE]$/.test(gabarito) && Object.values(alts).filter(Boolean).length < 2) {
      tipo = 'certo_errado';
    }
    const enunciado = cleanEnunciado(enunciadoPart, tipo, alts);

    if (!enunciado || enunciado.length < 15) {
      warnings.push({ numero, motivo: 'enunciado_curto' });
      continue;
    }

    // descarta lixo teórico sem cara de questão
    if (!header && !/\bjulgue\b|\bassinale\b|\bcerto\b|\berrado\b|\bop[cç][aã]o\b/i.test(enunciado)) {
      warnings.push({ numero, motivo: 'nao_parece_questao' });
      continue;
    }

    if (tipo === 'multipla_escolha') {
      const filled = Object.values(alts).filter(Boolean).length;
      if (filled < 2) {
        warnings.push({ numero, motivo: 'alternativas_insuficientes', enunciado: enunciado.slice(0, 60) });
      }
    }

    let banca = meta.banca || '';
    if (/^CESPE$/i.test(banca)) banca = 'CEBRASPE';
    if (/CEBRASPE/i.test(banca)) banca = 'CEBRASPE';

    const page = pageAt(text, start);
    questions.push({
      numeroApostila: numero,
      tipo,
      enunciado,
      alternativa_A: tipo === 'multipla_escolha' ? alts.A : '',
      alternativa_B: tipo === 'multipla_escolha' ? alts.B : '',
      alternativa_C: tipo === 'multipla_escolha' ? alts.C : '',
      alternativa_D: tipo === 'multipla_escolha' ? alts.D : '',
      alternativa_E: tipo === 'multipla_escolha' ? alts.E : '',
      gabarito,
      explicacao: comentario,
      banca: banca || 'CEBRASPE',
      ano: meta.ano,
      fonte: meta.fonte,
      orgao: meta.orgao,
      cargo_fonte: meta.cargo,
      secao_material: secao === 'comentados' ? 'Exercícios Comentados' : secao === 'praticar' ? 'Exercícios para Praticar' : 'Lista de Questões',
      pagina_pdf: page,
      arquivo_origem: arquivo,
      status: gabarito ? 'REVISADA' : 'EXTRAIDA',
      observacoes: gabarito ? '' : 'Sem gabarito na apostila (seção prática ou extração incompleta)',
    });
  }

  return { questions, warnings };
}

/**
 * Parse completo do texto de uma apostila.
 * @param {string} fullText
 * @param {{ secao?: 'comentados'|'praticar'|'lista'|'auto'|'todas', arquivo?: string }} options
 */
export function parseApostilaText(fullText, options = {}) {
  const text = normalizePdfText(fullText);
  const ranges = findSectionRanges(text);
  const want = options.secao || 'comentados';
  const arquivo = options.arquivo || '';

  let selected = [];
  if (want === 'todas') {
    selected = ranges.length ? ranges : [{ name: 'auto', index: 0, end: text.length, label: 'documento inteiro', score: 0 }];
  } else if (want === 'auto') {
    selected = ranges.filter((r) => r.name === 'comentados');
    if (!selected.length) selected = ranges.filter((r) => r.name === 'praticar' || r.name === 'lista');
    if (!selected.length) selected = [{ name: 'auto', index: 0, end: text.length, label: 'documento inteiro', score: 0 }];
  } else {
    selected = ranges.filter((r) => r.name === want);
    if (!selected.length) {
      selected = [{ name: want, index: 0, end: text.length, label: `fallback:${want}`, score: 0 }];
    }
  }

  // Para comentados: usa a seção com MAIS questões de banca (evita sumário/teoria)
  if ((want === 'comentados' || want === 'auto') && selected.length > 1) {
    selected.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.chars || 0) - (a.chars || 0));
    // se a melhor tem score > 0, fica só com as de score alto ( >= 50% da melhor )
    const best = selected[0].score || 0;
    if (best > 0) {
      selected = selected.filter((r) => (r.score || 0) >= Math.max(3, Math.floor(best * 0.5)));
    } else {
      selected = [selected[0]];
    }
  }

  const allQuestions = [];
  const allWarnings = [];
  const secoesUsadas = [];

  for (const range of selected) {
    const slice = text.slice(range.index, range.end);
    secoesUsadas.push({
      nome: range.name,
      label: range.label,
      chars: slice.length,
      score: range.score || 0,
    });
    const { questions, warnings } = parseSectionText(slice, {
      secao: range.name,
      arquivo,
      requireBanca: range.name === 'comentados' || range.name === 'praticar' || range.name === 'lista',
    });
    allQuestions.push(...questions);
    allWarnings.push(...warnings.map((w) => ({ ...w, secao: range.name })));
  }

  // dedupe por enunciado normalizado + gabarito
  const seen = new Set();
  const unique = [];
  for (const q of allQuestions) {
    const key = `${q.enunciado.toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}|${q.gabarito}`;
    if (seen.has(key)) {
      allWarnings.push({ numero: q.numeroApostila, motivo: 'duplicata_interna' });
      continue;
    }
    seen.add(key);
    unique.push(q);
  }

  return {
    questions: unique,
    warnings: allWarnings,
    secoesEncontradas: ranges.map((r) => r.name),
    secoesUsadas,
  };
}

export function questionsToImportItems(questions, defaults = {}) {
  return questions.map((q, index) => {
    const fonte = q.fonte
      ? `${q.banca || 'CESPE'}${q.ano ? `/${q.ano}` : ''}${q.orgao ? `/${q.orgao}` : ''}${q.cargo_fonte ? `/${q.cargo_fonte}` : ''}`.replace(/\/+/g, '/').replace(/CESPE/gi, (q.banca || 'CEBRASPE'))
      : (q.fonte || defaults.fonte || '');

    // rebuild fonte mais limpa
    const fonteLimpa = [q.banca || 'CEBRASPE', q.ano, q.orgao, q.cargo_fonte].filter(Boolean).join('/');

    return {
      id: defaults.prefixo
        ? `${defaults.prefixo}-${String(q.numeroApostila || index + 1).padStart(4, '0')}`
        : undefined,
      disciplina: defaults.disciplina || '',
      assunto: defaults.assunto || q.secao_material || '',
      subtopico: defaults.subtopico || q.secao_material || '',
      aula: defaults.aula || '00',
      banca: q.banca || defaults.banca || 'CEBRASPE',
      ano: q.ano || defaults.ano || null,
      fonte: fonteLimpa || fonte,
      tipo: q.tipo,
      enunciado: q.enunciado,
      alternativa_A: q.alternativa_A,
      alternativa_B: q.alternativa_B,
      alternativa_C: q.alternativa_C,
      alternativa_D: q.alternativa_D,
      alternativa_E: q.alternativa_E,
      gabarito: q.gabarito,
      explicacao: q.explicacao || '',
      arquivo_origem: q.arquivo_origem || defaults.arquivo || '',
      observacoes: [
        q.observacoes,
        q.pagina_pdf ? `página PDF ${q.pagina_pdf}` : '',
        q.numeroApostila != null ? `nº apostila ${q.numeroApostila}` : '',
      ].filter(Boolean).join(' | '),
      // status for criarBanco — applied via options.status override per item later
      __status: q.status,
      __pagina: q.pagina_pdf,
      __numero: q.numeroApostila,
    };
  });
}
