import { describe, it, expect } from 'vitest';
import {
  getContactDisplayName,
  getVisitorDisplayName,
} from './get-visitor-display-name';

describe('getContactDisplayName', () => {
  it('muestra alias con nombre y apellidos entre paréntesis', () => {
    expect(
      getContactDisplayName({
        alias: 'WEBER',
        nombre: 'Sergio',
        apellidos: 'Garcia',
      })
    ).toBe('WEBER (Sergio Garcia)');
  });

  it('muestra solo alias si no hay nombre ni apellidos', () => {
    expect(getContactDisplayName({ alias: 'WEBER' })).toBe('WEBER');
  });

  it('no añade paréntesis si no hay alias', () => {
    expect(
      getContactDisplayName({
        nombre: 'Sergio',
        apellidos: 'Garcia',
      })
    ).toBe('Sergio Garcia');
  });

  it('usa email si no hay alias ni nombre', () => {
    expect(getContactDisplayName({ email: 'a@b.com' })).toBe('a@b.com');
  });
});

describe('getVisitorDisplayName', () => {
  it('formatea alias con name entre paréntesis', () => {
    expect(
      getVisitorDisplayName({
        alias: 'WEBER',
        name: 'Sergio Garcia',
      })
    ).toBe('WEBER (Sergio Garcia)');
  });

  it('no añade paréntesis si no hay alias', () => {
    expect(getVisitorDisplayName({ name: 'Sergio Garcia' })).toBe(
      'Sergio Garcia'
    );
  });

  it('no duplica formato si name ya incluye alias', () => {
    expect(
      getVisitorDisplayName({
        alias: 'WEBER',
        name: 'WEBER (Sergio Garcia)',
      })
    ).toBe('WEBER (Sergio Garcia)');
  });
});
