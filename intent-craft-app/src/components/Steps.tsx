import { useT } from '../i18n.ts';
import { Icon } from './Icon.tsx';

export type Step = 'tell' | 'check' | 'questions' | 'task';
const STEPS: Step[] = ['tell', 'check', 'questions', 'task'];

export interface StepStatus {
  done: boolean;
  /** Short state shown under the step name, e.g. "3 left". */
  note?: string;
}

/** The four steps across the top: where you are, what is done, what is next. */
export function Steps({ current, status, onPick }: { current: Step; status: Record<Step, StepStatus>; onPick: (s: Step) => void }) {
  const { t } = useT();
  return (
    <nav className="steps" aria-label="Steps">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              id={`step-${s}`}
              className={`step ${status[s].done ? 'is-done' : ''}`}
              aria-current={current === s ? 'step' : undefined}
              onClick={() => onPick(s)}
            >
              <span className="step-num" aria-hidden="true">{status[s].done ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="step-text">
                <span className="step-name">{t.steps[s]}</span>
                {status[s].note && <span className="step-note">{status[s].note}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
