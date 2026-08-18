export class CourseFactoryAIService {
  constructor(provider) {
    if (!provider || typeof provider.analyzeSources !== 'function') throw new Error('ai_provider_invalid');
    this.provider = provider;
  }

  async analyzeSources(sources) {
    return this.provider.analyzeSources(sources);
  }

  proposeCourseIdentity(analysis) {
    return analysis.identity;
  }

  proposeCurriculum(analysis) {
    return analysis.curriculum;
  }

  proposeEditalMap(analysis) {
    return analysis.edital_map;
  }

  composeProposal(analysis) {
    return {
      identity: this.proposeCourseIdentity(analysis),
      curriculum: this.proposeCurriculum(analysis),
      edital_map: this.proposeEditalMap(analysis),
      relevant_observations: analysis.relevant_observations || [],
    };
  }
}
