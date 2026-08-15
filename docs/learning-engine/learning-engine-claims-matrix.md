# Matriz promessa → implementação

Classificação usada:

- **Sim**: comportamento completo demonstrado por código e teste.
- **Parcial**: existe comportamento real, mas em granularidade ou escopo inferior ao prometido.
- **Não**: contrato necessário não existe no runtime.

| Promessa ao usuário | Implementação necessária | Existe hoje? | Evidência atual | Gap para V2 |
| --- | --- | --- | --- | --- |
| Identifica pontos fracos | Estado e evidência por microconhecimento | Parcial | `buildEditalInsights` e `routinePlanner` identificam subtópicos frágeis | Não distingue os conhecimentos internos do subtópico |
| Adapta próximas questões | Seletor usa estado granular, cobertura e revisão | Parcial | `questionSelection.js` prioriza inéditas, antigas e erradas; missão diária considera memória/estrelas | Não usa microconhecimento, pré-requisito, diversidade pedagógica ou plano de cobertura |
| Questão ensina | Explicação pedagógica estruturada e obrigatória | Parcial | `questionExplanationService.js`, feedback da batalha/revisão e campos enriquecidos | Explicação pode cair em fallback; não há contrato obrigatório de erro conceitual e aprendizagem extraída |
| Mede domínio real | Projeção baseada em múltiplas evidências por microconhecimento | Não | O domínio atual usa o melhor resultado de 10 questões do subtópico | Faltam estado granular, dificuldade, diversidade, retenção e reincidência |
| Sabe o que foi conquistado | Estado individual por microconhecimento | Não | Há melhor percentual por subtópico | Não existe `user_microknowledge_state` |
| Revisa conhecimento esquecido | Agenda e evidencia retenção por conhecimento | Parcial | Fila por questão, datas, memória e recorrência são reais e testadas | Revisão não é associada ao microconhecimento e não atualiza domínio granular |
| Cobre o edital | Matriz conhecimento → questões → evidências | Parcial | SSOT verticalizado calcula teoria + revisão + combate por subtópico | Não mede cobertura dos 2.545 microconhecimentos nem cobertura editorial de questões |
| Explica o percentual da disciplina | Rollup rastreável desde evidências | Parcial | Média direta dos melhores percentuais dos subtópicos | Não é rastreável até microconhecimentos e evidências |
| Diferencia melhor domínio e retenção atual | Dois valores e transições auditáveis | Parcial | Melhor percentual é preservado; memória da questão/subtópico é separada | Falta projeção por microconhecimento e regra de reconfirmação |
| Isola cursos e alunos | Escopo completo da jornada | Parcial | Usuário + concurso estão isolados e testados | Cargo/oferta não fazem parte da chave; PC BA possui três cargos no mesmo concurso |
| Bloqueia conteúdo não validado | Gate editorial e normativo antes da entrega | Parcial | Snapshot remoto usa somente questões aprovadas | `isQuestionEligible` local aceita status de revisão quando a estrutura é válida; microconhecimento pendente não participa da decisão |
| Seleciona com finalidade pedagógica | Questão declara alvo, papel, competência e raciocínio | Não | Dificuldade e explicação existem de forma opcional | Não há alvo primário/secundário nem papel pedagógico obrigatório |
| Registra por que escolheu uma questão | Decision log auditável | Não | Prioridades são calculáveis em memória | A decisão e seus fatores não são persistidos |
| Não quebra PC AL | Engine versionado com adapter legado | Ainda não aplicável | Regressões atuais protegem PC AL | Falta registry que fixe PC AL em `legacy_subtopic_v1`; qualquer integração direta em `battle/mastery/ssot` seria arriscada |

## Regra de comunicação

Enquanto uma linha estiver marcada como **Parcial** ou **Não**, ela não deve fundamentar afirmação pública absoluta. A comunicação deve usar linguagem compatível com o comportamento comprovado, ou aguardar a implementação e os testes do V2.
