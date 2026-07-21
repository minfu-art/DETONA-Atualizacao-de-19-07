/**
 * Sessão de foco — máquina de estados pura (cronômetro real).
 */
import { createStudySession, createDistraction, nowIso } from './routineSchema.js';
import { validSessionMinutes } from './routineConsistency.js';

export function createFocusController(options = {}) {
  let session = createStudySession({
    plannedMinutes: options.plannedMinutes || 25,
    mode: options.mode || 'countdown',
    blockId: options.blockId || null,
    userId: options.userId || null,
    contestId: options.contestId || null,
    date: options.date,
  });
  let tickBase = null; // epoch ms when running segment started
  let segmentElapsed = 0; // seconds accumulated in current run segment before pause accounting

  const api = {
    getSession: () => ({ ...session }),

    start() {
      if (session.status === 'completed' || session.status === 'aborted') return session;
      session = {
        ...session,
        status: 'running',
        startedAt: session.startedAt || nowIso(),
        pausedAt: null,
        updatedAt: nowIso(),
      };
      tickBase = Date.now();
      return session;
    },

    pause() {
      if (session.status !== 'running') return session;
      const extra = tickBase ? Math.floor((Date.now() - tickBase) / 1000) : 0;
      session = {
        ...session,
        status: 'paused',
        elapsedSeconds: session.elapsedSeconds + Math.max(0, extra),
        pausedAt: nowIso(),
        totalPausedSeconds: session.totalPausedSeconds,
        updatedAt: nowIso(),
      };
      tickBase = null;
      return session;
    },

    resume() {
      if (session.status !== 'paused') return session;
      session = {
        ...session,
        status: 'running',
        pausedAt: null,
        updatedAt: nowIso(),
      };
      tickBase = Date.now();
      return session;
    },

    /** segundos decorridos no momento (inclui segmento atual se running) */
    currentElapsedSeconds() {
      if (session.status === 'running' && tickBase) {
        return session.elapsedSeconds + Math.max(0, Math.floor((Date.now() - tickBase) / 1000));
      }
      return session.elapsedSeconds;
    },

    remainingSeconds() {
      if (session.mode === 'countup') return null;
      const total = (session.plannedMinutes || 25) * 60;
      return Math.max(0, total - api.currentElapsedSeconds());
    },

    display() {
      const elapsed = api.currentElapsedSeconds();
      if (session.mode === 'countup') {
        return { mode: 'countup', seconds: elapsed, label: formatClock(elapsed) };
      }
      const rem = api.remainingSeconds();
      return { mode: 'countdown', seconds: rem, label: formatClock(rem), elapsed };
    },

    complete({ focusScore = null, difficultyScore = null, note = '' } = {}) {
      if (session.status === 'running') api.pause();
      const elapsed = session.elapsedSeconds;
      session = {
        ...session,
        status: 'completed',
        endedAt: nowIso(),
        focusScore,
        difficultyScore,
        note,
        elapsedSeconds: elapsed,
        updatedAt: nowIso(),
      };
      tickBase = null;
      return {
        session: { ...session },
        actualMinutes: validSessionMinutes(elapsed, { completed: true }),
      };
    },

    abort({ reason = null, focusScore = null, difficultyScore = null, note = '' } = {}) {
      if (session.status === 'running') api.pause();
      const elapsed = session.elapsedSeconds;
      session = {
        ...session,
        status: 'aborted',
        interruptReason: reason,
        endedAt: nowIso(),
        focusScore,
        difficultyScore,
        note,
        updatedAt: nowIso(),
      };
      tickBase = null;
      return {
        session: { ...session },
        actualMinutes: validSessionMinutes(elapsed, { aborted: true }),
      };
    },

    registerDistraction(category, note = '') {
      return createDistraction({
        sessionId: session.id,
        blockId: session.blockId,
        userId: session.userId,
        contestId: session.contestId,
        category,
        note,
      });
    },

    /** Hidrata estado salvo (para testes/restauração UI) */
    hydrate(saved) {
      session = createStudySession(saved);
      tickBase = session.status === 'running' ? Date.now() : null;
      return session;
    },
  };

  return api;
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const FOCUS_PRESETS = Object.freeze([15, 25, 40, 50]);
