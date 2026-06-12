import { describe, expect, it } from 'vitest';
import { MORE_COMMANDS, PRIMARY_COMMANDS } from './runPreview';
import { commandStyleClass } from './commandStyle';

describe('commandStyleClass', () => {
  it('assigns a distinct style to every supported command', () => {
    const commands = [...PRIMARY_COMMANDS, ...MORE_COMMANDS];
    const classes = commands.map(commandStyleClass);
    expect(new Set(classes).size).toBe(commands.length);
  });

  it('normalizes state list API history entries', () => {
    expect(commandStyleClass('state')).toBe(commandStyleClass('state list'));
  });
});
