// Static concept glossary. A concept is shown when one of its triggers appears
// in the source text or when a card of a related type exists.
import type { CardType } from '../domain/types.ts';
import type { Lang } from '../i18n.ts';

export interface Concept {
  id: string;
  term: Record<Lang, string>;
  plain: Record<Lang, string>;
  example: Record<Lang, string>;
  triggers: RegExp;
  types: CardType[];
}

export const CONCEPTS: Concept[] = [
  {
    id: 'decision',
    term: { en: 'Option vs. decision', tr: 'Seçenek ve karar' },
    plain: {
      en: 'An option is a possibility. It becomes a decision only when you confirm it.',
      tr: 'Seçenek bir olasılıktır. Ancak sen onayladığında karara dönüşür.',
    },
    example: {
      en: '“Maybe it can move cards automatically” stays out of the task until you confirm it.',
      tr: '“Belki kartları otomatik taşıyabilir” sen onaylayana kadar göreve girmez.',
    },
    triggers: /belki|olabilir|maybe|perhaps|could/iu,
    types: ['option'],
  },
  {
    id: 'constraint',
    term: { en: 'Constraint', tr: 'Kısıt' },
    plain: {
      en: 'A rule the solution must respect, whatever else it does.',
      tr: 'Çözüm ne yaparsa yapsın uyması gereken kural.',
    },
    example: {
      en: '“I stay in control if it misunderstands” limits what the agent may do alone.',
      tr: '“Yanlış anlarsa kontrol bende kalsın” ajanın tek başına yapabileceklerini sınırlar.',
    },
    triggers: /kalsın|asla|sadece|yalnızca|never|only|must/iu,
    types: ['constraint'],
  },
  {
    id: 'provenance',
    term: { en: 'Source link (provenance)', tr: 'Kaynak bağlantısı (provenance)' },
    plain: {
      en: 'Every card points to the exact words it came from, so you can check the interpretation.',
      tr: 'Her kart geldiği kelimelere bağlıdır; böylece yorumu kontrol edebilirsin.',
    },
    example: {
      en: 'If you change those words, the card is marked “Needs review”.',
      tr: 'O kelimeleri değiştirirsen kart “İnceleme gerekiyor” olarak işaretlenir.',
    },
    triggers: /kavram|anlat|söyle|concept|explain|said/iu,
    types: ['need', 'idea'],
  },
  {
    id: 'task',
    term: { en: 'Task package', tr: 'Görev paketi' },
    plain: {
      en: 'A short, bounded instruction for a coding agent built only from your confirmed decisions.',
      tr: 'Yalnızca onayladığın kararlardan oluşan, sınırları belli kısa ajan talimatı.',
    },
    example: {
      en: 'Unconfirmed options are listed as out of scope so the agent does not build them.',
      tr: 'Onaylanmamış seçenekler kapsam dışı yazılır; ajan onları yapmaz.',
    },
    triggers: /claude|ajan|agent|yaptır|görev|task|build/iu,
    types: [],
  },
  {
    id: 'evidence',
    term: { en: 'Reported vs. verified', tr: 'Bildirilen ve doğrulanan' },
    plain: {
      en: 'What the agent says it did is a claim. It counts as verified only after you check it.',
      tr: 'Ajanın yaptığını söylediği şey bir iddiadır. Sen kontrol ettikten sonra doğrulanmış sayılır.',
    },
    example: {
      en: '“All tests pass” stays “reported” until you see the tests pass yourself.',
      tr: '“Tüm testler geçti” sen görene kadar “bildirildi” olarak kalır.',
    },
    triggers: /test|kanıt|evidence|doğrula|verify/iu,
    types: [],
  },
];

export function relevantConcepts(text: string, types: Set<CardType>, max = 3): Concept[] {
  return CONCEPTS.filter((c) => c.triggers.test(text) || c.types.some((t) => types.has(t))).slice(0, max);
}
