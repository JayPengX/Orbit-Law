# A 代表會's recording heard by speech recognition on the build's machine (faster-whisper, open source, no AI
# service): each word with its time and each character's pinyin (for matching misheard names by sound,
# lib/town-speakers.mjs). Free: GitHub's runner, a public repo.
#   python scripts/asr.py <audio> <out.json> [model] [vocab.json]
# vocab.json: { "prompt": the meeting in a line (its town, session, members, 村里), "terms": [proper names to match] }:
# the prompt steers the recognizer to those words; each term's pinyin comes back in `vocab_py`.
import json, sys, time
from faster_whisper import WhisperModel
from opencc import OpenCC
from pypinyin import lazy_pinyin, Style

# (Heard in simplified characters at times: turned into Taiwan's, as the transcripts are.)
tw = OpenCC('s2tw').convert
py = lambda text: [lazy_pinyin(c, style=Style.NORMAL)[0] if '㐀' <= c <= '鿿' else '' for c in text]

audio, out = sys.argv[1], sys.argv[2]
model = sys.argv[3] if len(sys.argv) > 3 else 'medium'
vocab = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
prompt = vocab.get('prompt') or '以下是臺灣鄉鎮市民代表會的會議錄音，主席、代表、市長與課長發言。'
t0 = time.time()
m = WhisperModel(model, device='cpu', compute_type='int8')
loaded = time.time() - t0
segs, info = m.transcribe(audio, language='zh', word_timestamps=True, vad_filter=True, initial_prompt=prompt, beam_size=5, condition_on_previous_text=False)
words = []
for s in segs:
    for w in s.words or []:
        text = tw(w.word)
        words.append([round(w.start, 2), round(w.end, 2), text, py(text), round(w.probability, 2)])
json.dump({'model': model, 'dur': info.duration, 'load_s': round(loaded, 1), 'run_s': round(time.time() - t0 - loaded, 1), 'words': words,
           'vocab_py': {t: py(t) for t in vocab.get('terms', [])}}, open(out, 'w'), ensure_ascii=False)
print(model, 'audio', round(info.duration), 's', 'run', round(time.time() - t0 - loaded), 's', len(words), 'words')
