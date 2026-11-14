# A 代表會's recording heard by speech recognition on the build's machine (faster-whisper, open source, no AI
# service): each stretch of speech and each word with its time, for lining the day's transcript up with the
# recording (scripts/build-town.mjs). Free: GitHub's runner, a public repo.
#   python scripts/asr.py <audio> <out.json> [model] [prompt]
import json, sys, time
from faster_whisper import WhisperModel

audio, out = sys.argv[1], sys.argv[2]
model = sys.argv[3] if len(sys.argv) > 3 else 'small'
prompt = sys.argv[4] if len(sys.argv) > 4 else '以下是臺灣鄉鎮市民代表會的會議錄音，主席、代表、市長與課長發言。'
t0 = time.time()
m = WhisperModel(model, device='cpu', compute_type='int8')
loaded = time.time() - t0
segs, info = m.transcribe(audio, language='zh', word_timestamps=True, vad_filter=True, initial_prompt=prompt, beam_size=5, condition_on_previous_text=False)
words = []
for s in segs:
    for w in s.words or []:
        words.append([round(w.start, 2), round(w.end, 2), w.word])
json.dump({'model': model, 'dur': info.duration, 'load_s': round(loaded, 1), 'run_s': round(time.time() - t0 - loaded, 1), 'words': words}, open(out, 'w'), ensure_ascii=False)
print(model, 'audio', round(info.duration), 's', 'run', round(time.time() - t0 - loaded), 's', len(words), 'words')
