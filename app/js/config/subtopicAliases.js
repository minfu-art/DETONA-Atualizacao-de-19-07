export const IMPORT_SUBTOPIC_MAP = Object.freeze({
  lingua_portuguesa_encontros_vocalicos: 'port_3', lingua_portuguesa_regras_gerais_de_acentuacao: 'port_3',
  lingua_portuguesa_emprego_do_hifen: 'port_3', lingua_portuguesa_acentuacao_do_hiato: 'port_3',
  lingua_portuguesa_acentos_diferenciais: 'port_3', lingua_portuguesa_ortografia_oficial: 'port_3',
  lingua_portuguesa_siglas_e_abreviacoes: 'port_3', lingua_portuguesa_uso_de_letras_maiusculas_e_minusculas: 'port_3',
  lingua_portuguesa_conjuncao: 'port_4_1', lingua_portuguesa_pronomes: 'port_5_8',
  lingua_portuguesa_adverbio: 'port_5_1', lingua_portuguesa_adjetivo: 'port_5_1',
  lingua_portuguesa_substantivo: 'port_5_1', lingua_portuguesa_expressoes_com_substantivo_e_adjetivo: 'port_5_1',
  lingua_portuguesa_expressoes_problematicas: 'port_6_1', lingua_portuguesa_palavras_especiais: 'port_6_1',
  direitos_humanos_1: 'dh_1', direitos_humanos_6: 'dh_6', etica_servico_publico_1: 'etica_2',
  etica_servico_publico_5_1: 'etica_5', dir_constitucional_1: 'const_1', dir_constitucional_1_1: 'const_1',
  dir_constitucional_1_2: 'const_2', legislacao_alagoas_1: 'leg_al_1', legislacao_alagoas_2: 'leg_al_2',
  legislacao_alagoas_3: 'leg_al_3',
});

export function resolveSubtopicAlias(value) {
  const id = String(value || '').trim();
  return IMPORT_SUBTOPIC_MAP[id] || id;
}
