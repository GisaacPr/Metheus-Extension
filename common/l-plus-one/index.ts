/**
 * ============================================================================
 * L+1 ENGINE - Comprehensible Input Detection
 * ============================================================================
 *
 * Implementación de la teoría de Krashen para detectar input comprensible.
 *
 * L+1 = El nivel óptimo de aprendizaje donde el usuario comprende 80-95%
 * del contenido, con solo 1-2 palabras nuevas por frase.
 *
 * Niveles:
 * - L+0: 100% comprensión (nada nuevo que aprender)
 * - L+1: 85-98% comprensión (ideal para adquisición)
 * - L+2: 75-85% comprensión (desafiante pero posible)
 * - L+3: 60-75% comprensión (difícil)
 * - L+5: <60% comprensión (frustrante, no recomendado)
 */

export * from './l-plus-one-engine';
export * from './frequency-data';
export * from './tokenizer';
export * from './stop-words';
export * from './types';
