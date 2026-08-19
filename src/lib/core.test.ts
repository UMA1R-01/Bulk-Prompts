import { describe, expect, it } from 'vitest';

import { extractOne, groupByVariable } from './extractor';
import {
  generatePrompts,
  projectedRowCount,
  promptText,
  promptValues,
} from './generator';
import { detectVariables, effectivePermutationSize, groupValues, tokenizeTemplate } from './template';
import { UndoStack } from './undoStack';
import { addedFragments, wordDiff } from './wordDiff';

describe('detection', () => {
  it('finds names, trims, de-duplicates, keeps order', () => {
    expect(detectVariables('A [SUBJECT] and [ CLOTHING ] and [SUBJECT] again')).toEqual([
      'SUBJECT',
      'CLOTHING',
    ]);
  });

  it('is case-sensitive', () => {
    expect(detectVariables('[Subject] [SUBJECT]')).toEqual(['Subject', 'SUBJECT']);
  });

  it('ignores empty and whitespace-only brackets', () => {
    expect(detectVariables('a [] b [   ] c')).toEqual([]);
  });

  it('leaves empty brackets in the literal text', () => {
    const tokens = tokenizeTemplate('a [ ] b');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ kind: 'literal', text: 'a [ ] b' });
  });
});

describe('generation', () => {
  const texts = (t: string, v: Record<string, string>) => {
    const out = generatePrompts(t, v);
    if (!out.ok) throw new Error(`blocked: ${out.block}`);
    return out.prompts.map(promptText);
  };

  it('row count is the longest list; short lists repeat their own last', () => {
    expect(texts('[A]-[B]', { A: 'a1\na2\na3', B: 'b1' })).toEqual([
      'a1-b1',
      'a2-b1',
      'a3-b1',
    ]);
  });

  it('does not cycle back to the first value', () => {
    expect(texts('[A]/[B]', { A: '1\n2\n3', B: 'x\ny' })).toEqual(['1/x', '2/y', '3/y']);
  });

  it('a variable with no values contributes empty and does not block', () => {
    expect(texts('[A]|[B]', { A: 'only' })).toEqual(['only|']);
  });

  it('blank lines are not values', () => {
    expect(texts('[A]', { A: 'one\n\n   \ntwo\n' })).toEqual(['one', 'two']);
  });

  it('blocks with a clear reason instead of throwing', () => {
    expect(generatePrompts('', {})).toMatchObject({ ok: false, block: 'empty-template' });
    expect(generatePrompts('no vars', {})).toMatchObject({
      ok: false,
      block: 'no-variables',
    });
    expect(generatePrompts('[A]', {})).toMatchObject({ ok: false, block: 'no-values' });
  });

  it('regenerating after the template changes uses the new template', () => {
    // The worst defect in the reference implementation: this must not throw.
    expect(texts('[A]', { A: 'x' })).toEqual(['x']);
    expect(texts('[A] then [B]', { A: 'x' })).toEqual(['x then ']);
  });

  it('segments keep variable provenance for highlighting', () => {
    const out = generatePrompts('a [X] b', { X: 'v' });
    if (!out.ok) throw new Error('blocked');
    const p = out.prompts[0];
    expect(p.segments.map((s) => s.variable)).toEqual([undefined, 'X', undefined]);
    expect(promptValues(p)).toEqual({ X: 'v' });
  });

  it('projected row count matches what generation produces', () => {
    expect(projectedRowCount('[A][B]', { A: '1\n2', B: '1' })).toBe(2);
  });
});

describe('permutation grouping', () => {
  it('chunks consecutive values into brace-wrapped, comma-joined groups', () => {
    expect(groupValues(['cat', 'dog', 'bird', 'fish', 'hamster', 'lizard'], 2)).toEqual([
      '{cat, dog}',
      '{bird, fish}',
      '{hamster, lizard}',
    ]);
  });

  it('a trailing partial group still gets its own row', () => {
    expect(groupValues(['a', 'b', 'c'], 2)).toEqual(['{a, b}', 'c']);
  });

  it('a lone trailing value skips the braces — nothing left to group it with', () => {
    expect(groupValues(['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['{a, b}', '{c, d}', 'e']);
  });

  it('size <= 1 is a no-op — no grouping, no braces', () => {
    expect(groupValues(['a', 'b'], 1)).toEqual(['a', 'b']);
    expect(groupValues(['a', 'b'], 0)).toEqual(['a', 'b']);
  });

  it('generation groups a permutation-enabled variable before assigning rows', () => {
    const out = generatePrompts(
      '[SUBJECT]',
      { SUBJECT: 'cat\ndog\nbird\nfish\nhamster\nlizard' },
      { SUBJECT: 2 },
    );
    if (!out.ok) throw new Error(`blocked: ${out.block}`);
    expect(out.prompts.map(promptText)).toEqual([
      '{cat, dog}',
      '{bird, fish}',
      '{hamster, lizard}',
    ]);
  });

  it('a permutation group counts as one value against another variable\'s list', () => {
    const out = generatePrompts(
      '[SUBJECT] in [STYLE]',
      { SUBJECT: 'cat\ndog\nbird\nfish', STYLE: 'oil\nwatercolor' },
      { SUBJECT: 2 },
    );
    if (!out.ok) throw new Error(`blocked: ${out.block}`);
    // SUBJECT groups down to 2 rows, matching STYLE's own 2 values exactly.
    expect(out.prompts.map(promptText)).toEqual([
      '{cat, dog} in oil',
      '{bird, fish} in watercolor',
    ]);
  });

  it('projected row count reflects grouping too', () => {
    expect(
      projectedRowCount('[A]', { A: '1\n2\n3\n4\n5' }, { A: 2 }),
    ).toBe(3);
  });
});

describe('effective permutation size', () => {
  it('inherits the section-wide default when there is no override', () => {
    expect(effectivePermutationSize('A', { on: true, size: 3 }, {})).toBe(3);
    expect(effectivePermutationSize('A', { on: false, size: 3 }, {})).toBeUndefined();
  });

  it('an override of >= 2 wins regardless of the default', () => {
    expect(effectivePermutationSize('A', { on: false, size: 3 }, { A: 5 })).toBe(5);
    expect(effectivePermutationSize('A', { on: true, size: 3 }, { A: 5 })).toBe(5);
  });

  it('an override of 0 opts out even while the default is on', () => {
    expect(effectivePermutationSize('A', { on: true, size: 3 }, { A: 0 })).toBeUndefined();
  });

  it('only the named variable is affected by its own override', () => {
    expect(effectivePermutationSize('B', { on: true, size: 3 }, { A: 0 })).toBe(3);
  });
});

describe('extraction', () => {
  it('recovers values against static anchors', () => {
    const r = extractOne(
      'A portrait of [SUBJECT] wearing [CLOTHING].',
      'A portrait of a lighthouse keeper wearing an oilskin coat.',
    );
    expect(r.matched).toBe(true);
    if (!r.matched) return;
    expect(r.values.map((v) => v.value)).toEqual([
      'a lighthouse keeper',
      'an oilskin coat',
    ]);
  });

  it('tolerates incidental whitespace differences', () => {
    const r = extractOne('A [X]   and [Y]', '  A    one and two  ');
    expect(r.matched).toBe(true);
    if (!r.matched) return;
    expect(r.values.map((v) => v.value)).toEqual(['one', 'two']);
  });

  it('offsets point at the value inside the source', () => {
    const filled = 'hello world end';
    const r = extractOne('hello [X] end', filled);
    if (!r.matched) throw new Error('expected a match');
    expect(filled.slice(r.values[0].start, r.values[0].end)).toBe('world');
  });

  it('falls back to a diff when the anchors do not match', () => {
    const r = extractOne('a [X] b', 'completely different');
    expect(r.matched).toBe(false);
    if (r.matched) return;
    expect(r.fragments.length).toBeGreaterThan(0);
  });

  it('a template with no variables falls back rather than failing', () => {
    const r = extractOne('plain text', 'plain text extra');
    expect(r.matched).toBe(false);
    if (r.matched) return;
    expect(r.fragments).toContain('extra');
  });

  it('adjacent variables go to the first and are flagged ambiguous', () => {
    const r = extractOne('[FIRST][LAST]', 'AdaLovelace');
    expect(r.matched).toBe(true);
    if (!r.matched) return;
    expect(r.ambiguous).toBe(true);
    expect(r.values[0].value).toBe('AdaLovelace');
    expect(r.values[1].value).toBe('');
  });

  it('a repeated variable name appears once, not once per occurrence', () => {
    const r = extractOne(
      '[SUBJECT] transforms into [SUBJECT] again',
      'porcupine transforms into porcupine again',
    );
    expect(r.matched).toBe(true);
    if (!r.matched) return;
    expect(r.values.map((v) => v.name)).toEqual(['SUBJECT']);
    expect(r.values[0].value).toBe('porcupine');
  });

  it('grouping by variable keeps names from every result', () => {
    const a = extractOne('[A] x [B]', '1 x 2');
    const b = extractOne('[C] y', '3 y');
    const g = groupByVariable([a, b]);
    expect(Object.keys(g).sort()).toEqual(['A', 'B', 'C']);
    expect(g.C).toEqual(['3']);
  });
});

describe('word diff', () => {
  it('marks removals and additions', () => {
    const parts = wordDiff('the quick fox', 'the slow fox');
    expect(parts.some((p) => p.kind === 'removed')).toBe(true);
    expect(addedFragments(parts)).toEqual(['slow']);
  });

  it('identical text produces no changes', () => {
    expect(wordDiff('same words', 'same words').every((p) => p.kind === 'same')).toBe(
      true,
    );
  });

  it('matches the last word of a string against the same word mid-string', () => {
    // Regression: trailing whitespace used to be part of the comparison key, so
    // a string's final word never matched and every diff mis-reported it.
    expect(addedFragments(wordDiff('plain text', 'plain text extra'))).toEqual(['extra']);
  });

  it('does not fold trailing punctuation into an added or removed word', () => {
    // Regression: a value sitting hard against punctuation ("throat,") used
    // to diff as one indivisible token against the template's "[X],", so an
    // identical trailing comma never matched and rode along as "added" text.
    const parts = wordDiff('the [X], done.', 'the throat, done.');
    expect(addedFragments(parts)).toEqual(['throat']);
    const added = parts.find((p) => p.kind === 'added');
    expect(added?.text).toBe('throat');
    const same = parts.filter((p) => p.kind === 'same').map((p) => p.text).join('');
    expect(same).toContain(', done.');
  });

  it('still splits punctuation as its own token when nothing changed', () => {
    expect(wordDiff('done.', 'done.').every((p) => p.kind === 'same')).toBe(true);
  });

  it('keeps a lone punctuation word intact instead of splitting to an empty word', () => {
    expect(addedFragments(wordDiff('a', 'a ,'))).toEqual([',']);
  });
});

describe('undo stack', () => {
  it('undo and redo walk the history', () => {
    const s = new UndoStack(0);
    s.commit(1);
    s.commit(2);
    expect(s.present).toBe(2);
    expect(s.undo()).toBe(1);
    expect(s.undo()).toBe(0);
    expect(s.undo()).toBeNull();
    expect(s.redo()).toBe(1);
  });

  it('a new commit clears the redo branch', () => {
    const s = new UndoStack(0);
    s.commit(1);
    s.undo();
    s.commit(9);
    expect(s.canRedo).toBe(false);
  });

  it('depth is bounded', () => {
    const s = new UndoStack(0, 3);
    for (let i = 1; i <= 10; i++) s.commit(i);
    expect(s.depth).toBe(3);
  });

  it('replacePresent does not add an undo point', () => {
    const s = new UndoStack(0);
    s.commit(1);
    s.replacePresent(2);
    expect(s.depth).toBe(1);
    expect(s.undo()).toBe(0);
  });
});
