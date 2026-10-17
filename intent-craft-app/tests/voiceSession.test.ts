import test from 'node:test';
import assert from 'node:assert/strict';
import { DictationSession, PhraseSegmenter, type Mic } from '../src/domain/voiceSession.ts';

test('segmenter: speech then a pause makes one phrase; a click is discarded', () => {
  const s = new PhraseSegmenter({ minLevel: 0.02, silenceMs: 800, minSpeechMs: 250 });
  const events: string[] = [];
  const play = (level: number, from: number, to: number) => {
    for (let t = from; t < to; t += 50) {
      const e = s.feed(level, t);
      if (e) events.push(`${e}@${t}`);
    }
  };
  play(0.001, 0, 500); // quiet room
  play(0.2, 500, 1500); // one second of speech: last loud sample at 1450
  play(0.001, 1500, 2500); // pause: 800 ms of quiet ends the phrase at 2250
  play(0.2, 3000, 3100); // a click
  play(0.001, 3100, 4200);
  assert.deepEqual(events, ['start@500', 'end@2250', 'start@3000', 'discard@3850']);
});

test('segmenter: long speech is cut so text keeps arriving', () => {
  const s = new PhraseSegmenter({ maxPhraseMs: 2000 });
  let ends = 0;
  for (let t = 0; t < 5000; t += 50) if (s.feed(0.3, t) === 'end') ends++;
  assert.equal(ends, 2);
});

class FakeMic implements Mic {
  levels: number[] = [];
  recordings = 0;
  open = true;
  private recording = false;
  level() {
    return this.levels.shift() ?? 0;
  }
  startRecording() {
    this.recording = true;
    this.recordings++;
  }
  async stopRecording() {
    const was = this.recording;
    this.recording = false;
    return was ? new Blob([`phrase-${this.recordings}`]) : null;
  }
  close() {
    this.open = false;
  }
}

test('session: phrases are written in speaking order even when transcription finishes out of order', async () => {
  const mic = new FakeMic();
  const out: string[] = [];
  const delays = [60, 5]; // the first phrase takes longer to transcribe than the second
  let finished = 0;
  const session = new DictationSession({
    openMic: async () => mic,
    transcribe: async (blob) => {
      const text = await blob.text();
      await new Promise((r) => setTimeout(r, delays.shift() ?? 0));
      return text;
    },
    onText: (t) => out.push(t),
    onState: () => {},
    onFinished: () => finished++,
    segmenter: { minLevel: 0.02, silenceMs: 200, minSpeechMs: 100 },
  });
  await session.start();
  const say = (ms: number) => mic.levels.push(...Array(ms / 50).fill(0.3), ...Array(6).fill(0));
  say(300);
  say(300);
  for (let t = 0; mic.levels.length; t += 50) session.tick(t);
  await session.stop();
  assert.deepEqual(out, ['phrase-1', 'phrase-2']);
  assert.equal(finished, 1);
  assert.equal(mic.open, false);
  assert.equal(session.current, 'idle');
});

test('session: pause writes the half-finished phrase, resume keeps listening, failed transcription does not stop it', async () => {
  const mic = new FakeMic();
  const out: string[] = [];
  const notes: string[] = [];
  let calls = 0;
  const session = new DictationSession({
    openMic: async () => mic,
    transcribe: async (blob) => {
      if (++calls === 2) throw new Error('speech service HTTP 502');
      return blob.text();
    },
    onText: (t) => out.push(t),
    onState: (s, detail) => detail && notes.push(`${s}:${detail}`),
    segmenter: { minLevel: 0.02, silenceMs: 200, minSpeechMs: 100 },
  });
  await session.start();
  mic.levels.push(0.3, 0.3, 0.3, 0.3); // speaking, then Pause in the middle
  for (let t = 0; mic.levels.length; t += 50) session.tick(t);
  await session.pause();
  assert.deepEqual(out, ['phrase-1']);
  assert.equal(session.current, 'paused');
  await session.start(); // resume
  mic.levels.push(0.3, 0.3, 0.3, 0.3, 0, 0, 0, 0, 0, 0);
  for (let t = 0; mic.levels.length; t += 50) session.tick(t);
  mic.levels.push(0.3, 0.3, 0.3, 0.3, 0, 0, 0, 0, 0, 0);
  for (let t = 1000; mic.levels.length; t += 50) session.tick(t);
  await session.stop();
  assert.deepEqual(out, ['phrase-1', 'phrase-3']);
  assert.deepEqual(notes.map((n) => n.split(':').slice(1).join(':')), ['speech service HTTP 502']); // reported once, session kept going
});

test('session: a denied microphone is an error state, not a crash', async () => {
  const states: string[] = [];
  const session = new DictationSession({
    openMic: async () => {
      throw new Error('Permission denied');
    },
    transcribe: async () => '',
    onText: () => {},
    onState: (s, d) => states.push(d ? `${s}:${d}` : s),
  });
  await session.start();
  assert.deepEqual(states, ['starting', 'error:Permission denied']);
});
