import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_HISTORY_HOME,
  STUDENT_HISTORY_INTERNAL,
  shouldReturnHomeFromHistory,
  studentHistoryTransition,
} from '../js/core/studentHistory.js';
import { shouldDeferMobileMoreNavigation } from '../js/ui/appShell.js';

test('primeira navegação interna cria somente um nível acima da Home', () => {
  assert.deepEqual(studentHistoryTransition({
    screen: 'battle', currentScreen: 'home', currentLevel: STUDENT_HISTORY_HOME,
  }), { action: 'push', level: STUDENT_HISTORY_INTERNAL });
  assert.deepEqual(studentHistoryTransition({
    screen: 'review', currentScreen: 'battle', currentLevel: STUDENT_HISTORY_INTERNAL,
  }), { action: 'replace', level: STUDENT_HISTORY_INTERNAL });
});

test('voltar de qualquer área interna aponta para a Home', () => {
  assert.equal(shouldReturnHomeFromHistory({ level: STUDENT_HISTORY_HOME, currentScreen: 'battle' }), true);
  assert.deepEqual(studentHistoryTransition({
    screen: 'home', currentScreen: 'battle', currentLevel: STUDENT_HISTORY_INTERNAL,
  }), { action: 'back' });
});

test('na Home não é criado outro bloqueio para a saída do aplicativo', () => {
  assert.equal(shouldReturnHomeFromHistory({ level: null, currentScreen: 'home' }), false);
  assert.equal(shouldReturnHomeFromHistory({ level: STUDENT_HISTORY_HOME, currentScreen: 'home' }), false);
});

test('menu Mais aguarda o retorno do historico antes de abrir Desempenho', () => {
  assert.equal(shouldDeferMobileMoreNavigation({ fromMore: true, historyActive: true }), true);
  assert.equal(shouldDeferMobileMoreNavigation({ fromMore: false, historyActive: true }), false);
  assert.equal(shouldDeferMobileMoreNavigation({ fromMore: true, historyActive: false }), false);
});
