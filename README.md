# EyeSee

**See what your doctor means. See what your patient understands.**

So that a doctor and a patient can both say "I see."

医師と患者が、お互いに「I see」と言えるように。

EyeSee is a shared understanding interface for a doctor and a patient who don't share a language.
The doctor uses a phone, the patient wears a Meta Quest, and both see one live, bilingual record of the visit.

EyeSeeは、言葉の違う医師と患者のための「共有理解インターフェース」です。
医師はスマホ、患者はMeta Questを使い、診察の内容を二人で同じ一つの記録としてリアルタイムに見ます。

## Vision

**Start with informed consent: the highest-stakes decision in medicine.**

EyeSee is not a VR app for hospitals. It is a *Shared Understanding Interface* that can be carried into other fields.

The problem it targets has one shape: A explains, B understands something different, a serious decision
is made anyway, and a dispute follows. Informed consent is where this matters most. It is the last step
before an irreversible decision, it carries the widest information gap between the two people in the
room, and it is where legal disputes begin. If shared understanding works there, the same interface
extends to law, insurance, immigration procedures, renting a home and financial contracts: anywhere it
matters that people truly understand before they press "Yes".

## ビジョン

**最高レベルの意思決定である、インフォームド・コンセントから始める。**

EyeSeeが作っているのは医療用VRではなく、ほかの領域へ広げられる *Shared Understanding Interface* です。

狙っている問題の形は一つです。Aが説明した、Bが違う意味で理解した、そのまま重大な意思決定をした、後から紛争になる。
インフォームド・コンセントは、その最後の局面です。やり直しのきかない決定の直前で、医師と患者の情報格差がいちばん大きく、訴訟が生まれる場所でもあります。
医療でこれが機能するなら、将来的には法律、保険、移民手続き、家を借りる契約、金融契約など、「Yesを押す前に本当に理解していること」が重要な領域へ広げられます。

### Who it is for / 誰のために

- Doctors who worry that a gap in communication will turn into a lawsuit, and patients who can't follow medical English.
  情報の伝達不足からの訴訟を恐れている医師と、英語が苦手な患者。
- The patient speaks in whatever language is easiest for them, even with a strong accent. The doctor can see, in real time, which parts the patient did and didn't understand.
  患者は自分がいちばん話しやすい言葉で話せばいい。医師は、患者がどこを理解できていないかをリアルタイムで確認できます。

### Why medicine first / なぜ医療から始めるのか

- CRICO/Candello (2025) analysed U.S. medical professional liability data from 2014–2024, covering about a third of open and closed claims. 40% of asserted malpractice cases involved a communication-related factor, and 63% of those involved a provider–patient communication failure.
  米国の医療賠償データ（2014–2024年）の分析では、訴訟事案の40%にコミュニケーション要因があり、そのうち63%が医療者と患者の間のコミュニケーション失敗でした。
- In another study of 498 claims, 49% involved a communication failure. Those cases cost about $237,600 on average, against about $154,100 without one.
  別の研究（498件）では49%にコミュニケーションの失敗があり、平均総コストは約23.8万ドル（失敗なしは約15.4万ドル）でした。
- Across 21,101 closed claims, the main drivers of patient/family–provider communication problems were expectation communication, inadequate informed consent and poor rapport.
  21,101件のclosed claimsでは、主な要因として期待値の伝え方、不十分なインフォームド・コンセント、信頼関係の不足が挙げられています。
- In 9,500+ surgical malpractice cases, inadequate informed consent made an indemnity payment more likely. Not explaining non-surgical alternatives was a specific risk factor.
  9,500件超の手術関連の事案では、不十分なインフォームド・コンセントが賠償支払いにつながりやすく、特に手術以外の選択肢を説明しなかったことがリスク要因でした。

That last finding is why EyeSee's understanding score cannot reach 7/10 until alternatives have been discussed. The demo shows the doctor asking the AI "Did I forget anything?" and the AI catching that gap.
だからEyeSeeの理解度スコアは、代替案が説明されるまで7/10に届きません。デモでは、医師が「言い忘れはある？」とAIに聞き、AIがそれを指摘します。

## What happens in a visit

| | Doctor · phone (English) | Patient · Quest (e.g. Japanese) |
|---|---|---|
| Speech | The phone is the doctor's mic. The doctor's words appear in the headset, translated. | The headset mic hears only the wearer. The patient just talks, in whatever language is easiest, and the doctor reads it in English. |
| Minutes | One shared transcript: original + translation on both sides, with live "speaking / translating" indicators. | Large transcript panel in front. Past entries can be scrolled. |
| Hard words | Chips show which terms were explained to the patient. Tap one to generate an illustration. | Glossary panel: plain-language explanations (optionally with a picture). |
| Nuance | Notes such as "『はい』 may mean 'I'm listening', not 'I agree'", or ずきずき → "throbbing (zuki-zuki)". Warnings for risky phrasing ("100% safe"). | — |
| Tools | Pain, Body, Feelings and 3D tools, opened from the phone. | 10 animated pain orbs (ずきずき, ちくちく, しめつけ…) and a 0–10 scale. A life-size body to point at. Rich feelings (rushed, needs time, wants family…). |
| 3D | Rotate the model or tap a part: the headset mirrors it live. | Heart (with stenosis), lungs, coronary stent (PCI) in 5 steps, life-size body. |
| I see | Sees "I see" / "I don't understand" on each utterance. After an "I don't understand", AI suggests a simpler way to say it. | Physical わかった (I see) / わからない (I don't understand) buttons. |
| EyeSee AI | Hold the AI button and ask, e.g. "Did I forget anything?" | Hold the big AI button and ask. The answer is visible to both, in both languages. |
| Consent | Understanding meter 0–10 (JEV), always on top. At **7** the consent step unlocks → AI final check → checkpoints → signatures. | Confirms each checkpoint (理解しました / 質問がある), then signs in the air with a finger. |
| Record | Minutes + checkpoints + score trajectory + AI final check + signatures + SHA-256. | — |

### The understanding score (JEV)

After every utterance, [JEV](https://docs.typesafe.ai) (TypeSafe AI's System One model) answers typed questions about the conversation. Each call takes about 100 ms:
- **score**: a 10-level rubric, from "nothing explained (even if the patient says yes)" to "exemplary".
- **noul** (probability yes/no), one per consent element: diagnosis, procedure, benefits, risks, alternatives, no-treatment option, anesthesia, recovery, invitation to ask questions.
- **choice**, for patient comprehension: none / *claimed* (only "yes / はい") / partial / demonstrated (teach-back).

The server then applies hard caps, so a bare "I agree" can't unlock consent:

| Cap | When |
|---|---|
| 0 | Nothing explained yet |
| 3 | Procedure and risks not explained |
| 4 | The patient only *claims* to understand |
| 6 | A core element (e.g. **alternatives**) is missing, no teach-back yet, or an "I don't understand" or a worry is unresolved |

The score is shown from the start of the visit and updates after every utterance. There are no phases to switch: when it reaches **7/10**, the doctor can open the consent step. Missing non-surgical alternatives is a known driver of inadequate-consent claims (CRICO/Candello). That's why the demo shows the doctor asking "Did I forget anything?" and the AI catching it.

## Quick start

```bash
npm install
cp .env.example .env        # add your keys (optional; without keys it runs in offline demo mode)
npm start
```

The server prints:
```
EyeSee http  → http://localhost:8080
EyeSee https → https://localhost:8443
   on Wi-Fi:   https://192.168.x.x:8443   (Quest & phone; accept the self-signed certificate once)
AI: language=gemini · speech=gemini · images=gemini · understanding judge=jev
```

1. **Doctor**: on the phone, open `https://<LAN-IP>:8443/d` (or scan the QR code at `https://<LAN-IP>:8443/`). Accept the certificate warning once, then tap **Tap to listen**.
2. **Patient**: in the Quest browser, open `https://<LAN-IP>:8443/q` → **はじめる** → **ARで開始** (passthrough, so the patient still sees the doctor).
   - Over USB instead: `adb reverse tcp:8080 tcp:8080`, then open `http://localhost:8080/q` in the Quest (no certificate needed).
3. The phone header shows **Headset live** once both are connected. Just talk.

Rooms: add `?room=er-3` to both URLs to run several exam rooms side by side.
Desktop preview of the headset: `http://localhost:8080/quest?preview` (drag to look around, click to interact, hold Space for AI, type as the patient).

### Demo visit (for pitches)

On the phone, open the **⋯** menu → **Demo visit**. **Next line** or **Auto-play** runs a scripted visit: exertional chest pain → pain orbs & body map → angina → tests → heart model with stenosis → PCI explained with the stent animation → the patient presses "I don't understand" on "contrast dye" → teach-back → the doctor asks AI "Did I forget anything?" → alternatives → 7/10 → consent. With AI keys every line goes through the live pipeline; without keys it uses pre-written translations.

## AI stack

| Job | Default | Also supported |
|---|---|---|
| Speech → transcript + translation + glossary + notes (one call per utterance) | Gemini on Vertex AI (`gemini-3.6-flash`, audio in) | OpenAI STT + text LLM |
| Text: translation, consent checkpoints, AI final check, EyeSee AI | Gemini | **Claude** (`claude-opus-5`) if `ANTHROPIC_API_KEY` is set, OpenAI |
| Understanding score | **JEV** (`api.typesafe.ai/v1/systemone`) | LLM judge, offline heuristic |
| Illustrations | `gemini-2.5-flash-image` (text-free; the UI draws correct captions) | OpenAI images |

Cost guards: 12 images per visit, 60 paid AI calls per minute (configurable in `.env`).

## Architecture

```
 Doctor's phone (PWA)                     Node server                          Quest (WebXR, Three.js)
 ─────────────────────                    ─────────────────────                ────────────────────────
 mic → VAD → WAV ──POST /api/rooms/:r/audio──▶ Gemini: hear+translate ──┐     ◀── mic → VAD → WAV
 taps (tools, AI, consent) ──── WebSocket /ws ──▶ room state (minutes) ─┼──▶ panels, 3D, buttons
 ◀──────────────────────── full state, 40 ms throttle ──────────────────┘      (poke / pinch / trigger)
                                          │  JEV score after each utterance (consent phase)
                                          └─ data/sessions/<id>.json  (the minutes), /record/:room
```

- `server/`: `index.js` (HTTP/HTTPS/WS), `pipeline.js` (speech → minutes → judge → consent), `ai/` (Gemini, Claude, OpenAI, JEV judge, prompts, offline fallbacks), `demo/script.js`, `record.js`
- `public/phone/`: the doctor's app. `public/quest/`: the patient's WebXR app. `public/shared/`: catalogs, recorder, link, **3D models** (`models/heart.js`, `lungs.js`, `artery.js`, `body.js`, `painviz.js`, all procedural).

## Tests

```bash
node tests/flow.mjs http://localhost:8080      # whole visit over the WebSocket protocol: score gate, AI check, consent, signatures, record
node tests/xr.mjs   http://localhost:8080      # emulated Quest 3 (Meta IWER): AR session, recenter, finger pokes, controller ray
node tests/quest-shot.mjs http://localhost:8080 room 12 /tmp/q   # screenshots of the headset view
```
Run `EYESEE_HTTPS=0 GOOGLE_APPLICATION_CREDENTIALS= JEV_API_KEY= PORT=8090 npm start` to test the offline path without spending credits.

## Notes

- Secrets live in `.env` and `secrets/`, which are both gitignored. Never commit keys.
- This is a hackathon prototype on a LAN. There is no authentication, and minutes are stored as plain JSON in `data/`. Real patient data would need HIPAA-grade hosting, access control, BAAs with the AI vendors, and a qualified medical interpreter policy. EyeSee supports the conversation; it does not replace the clinician's judgment.
