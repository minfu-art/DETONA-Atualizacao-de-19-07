import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const protectedFiles = new Map([
  ['js/core/routine/studyPlanContract.js', '54F1295655C87A6A91939AA20C85C9C732A5A4576DCE63889E6B603EB91FC85A'],
  ['js/core/routine/routinePlanner.js', '867B6E1974C3E5163557C695FE399C74861F1C6F10D44800AD06C8E618F40709'],
  ['js/core/routine/routineFocus.js', 'FDF6E1C02D7D9DDCEE97B68D9C341E2FDBE1AC3A6D56CDEA2452A14B5A0F950B'],
  ['js/services/routineService.js', 'A14138AEE1E1E2DC58142BC25BBF73AD83008391C3AB941B5B9A4797D1693604'],
  ['js/services/eviDailyMissionService.js', 'D737B25F7959959A63C173DEB7E2939B81620F9458F6477C3FC7C853940A39E7'],
  ['js/repositories/progressRepository.js', 'EB62741A1BF00A51E39F096B04CF5B625CAF3AEE764BA78EF2C50BEBEC714218'],
  ['js/services/academicProgressService.js', 'B7C55B15245698F02D1C110AECA067F1A9CB03B5A1489A7B9DD3A5E2BB5D85E2'],
  ['js/services/dailyGoalService.js', 'F4814596C99488DAA5B38F44F38D945BAC39785A514345FD80306B4E1192804E'],
  ['js/services/studyStreakService.js', '0136320CAC36F39663FE849E1B62F1F04E7E8CFDB690715A9AC08DE3A06B3DD0'],
  ['js/services/emblemService.js', 'B7881F6209C97C760C50351AEC663DB6BA192DD9B94CCB5805B5B7E2137AE103'],
]);

test('Fase 7B preserva o conteúdo versionado dos motores funcionais congelados', async () => {
  for (const [relativePath, expected] of protectedFiles) {
    const contents = await readFile(path.join(appDir, relativePath), 'utf8');
    const normalized = contents.replace(/\r\n/g, '\n');
    const actual = createHash('sha256').update(normalized).digest('hex').toUpperCase();
    assert.equal(actual, expected, relativePath);
  }
});
