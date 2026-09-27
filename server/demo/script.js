// Scripted demo visit: exertional chest pain → angina → consent for PCI (coronary stent).
// Speech lines carry pre-written translations (`tr`) used when no AI is configured; with AI
// credentials the same lines run through the live pipeline instead. Actions simulate the
// taps a patient would make in the headset, so the whole story can be shown from one phone.

export const DEMO_STEPS = [
  { speaker: 'doctor', text: "Hello, I'm Dr. Carter. What brings you in today?", tr: 'こんにちは、医師のカーターです。今日はどうされましたか？' },
  {
    speaker: 'patient',
    text: '最近、階段を上ると胸がぎゅーっと締め付けられるように痛くなるんです。',
    tr: 'Lately, when I climb stairs, my chest gets a tight, squeezing (gyuutto) pain.',
    terms: [{ term: 'ぎゅーっと締め付けられる', display: 'gyuutto shimetsukerareru', explanation: 'Sound-symbolic Japanese for a strong, constricting, pressing sensation — close to the classic "pressure/tightness" description of angina.', visual: false }],
    note: 'Exertional, constricting chest pain — ask about radiation, duration and relief with rest.',
  },
  { do: 'stage', stage: { tool: 'body' } },
  { do: 'symptom', region: { id: 'chest-center', label: { en: 'Center of chest', ja: '胸の中央' } }, point: [0, 1.3, 0.13], quality: 'shimetsuke', intensity: 6 },
  { speaker: 'doctor', text: 'Does the pain spread anywhere, like your arm or jaw?', tr: 'その痛みは、腕やあごなど、どこかに広がりますか？' },
  { do: 'symptom', region: { id: 'upper-arm-left', label: { en: 'Left upper arm', ja: '左上腕' } }, point: [0.24, 1.22, 0.04], quality: 'zuun', intensity: 4 },
  {
    speaker: 'patient',
    text: '左腕のほうまで重くなる感じがします。5分くらい休むと治まります。',
    tr: 'It feels heavy all the way down my left arm. It goes away after about five minutes of rest.',
  },
  {
    speaker: 'doctor',
    text: "Thank you. That pattern sounds like angina — chest pain caused by reduced blood flow to the heart. Let's do an ECG and a stress test.",
    tr: 'ありがとうございます。そのパターンは「狭心症」、つまり心臓への血流が減ることで起こる胸の痛みのようです。心電図と運動負荷試験をしましょう。',
    terms: [
      { term: 'angina', display: '狭心症（きょうしんしょう）', explanation: '心臓に血液を送る血管が細くなり、心臓が酸素不足になって胸が痛くなる病気です。', visual: true },
      { term: 'ECG', display: '心電図（しんでんず）', explanation: '胸や手足にシールを貼って、心臓の電気の動きを記録する検査です。痛みはありません。', visual: false },
      { term: 'stress test', display: '運動負荷試験（うんどうふかしけん）', explanation: '歩いたり自転車をこいだりして、心臓に負担がかかった時の様子を調べる検査です。', visual: false },
    ],
  },
  { do: 'stage', stage: null },
  { speaker: 'doctor', text: "The ECG records your heart's electrical activity. It doesn't hurt at all.", tr: '心電図は、心臓の電気の動きを記録する検査です。まったく痛くありません。' },
  { do: 'model', id: 'heart', highlight: 'stenosis' },
  {
    speaker: 'doctor',
    text: 'Your test results show a severe narrowing in the left anterior descending artery, one of the coronary arteries that supply blood to your heart muscle.',
    tr: '検査の結果、心臓の筋肉に血液を送る「冠動脈」の一つ、「左前下行枝」という血管がひどく狭くなっていることがわかりました。',
    terms: [
      { term: 'coronary arteries', display: '冠動脈（かんどうみゃく）', explanation: '心臓の表面を走り、心臓の筋肉に酸素と栄養を届ける血管です。', visual: true },
      { term: 'left anterior descending artery', display: '左前下行枝（ひだりぜんかこうし）', explanation: '冠動脈の中でも特に大事な一本で、心臓の前側に血液を送っています。', visual: true },
    ],
  },
  { speaker: 'patient', text: 'それは危ない状態なんですか？', tr: 'Is that a dangerous condition?' },
  {
    speaker: 'doctor',
    text: 'If we leave it, it can lead to a heart attack. I recommend a procedure called PCI: we thread a thin tube called a catheter from your wrist to your heart, inflate a small balloon, and place a stent to keep the artery open.',
    tr: 'そのままにすると心筋梗塞につながる可能性があります。「PCI」という治療をおすすめします。手首から「カテーテル」という細い管を心臓まで通し、小さな風船をふくらませて、「ステント」を置いて血管が開いた状態を保ちます。',
    terms: [
      { term: 'heart attack', display: '心筋梗塞（しんきんこうそく）', explanation: '心臓の血管が完全につまり、心臓の筋肉の一部が死んでしまう、命にかかわる状態です。', visual: false },
      { term: 'PCI', display: 'PCI（経皮的冠動脈インターベンション）', explanation: '胸を切らずに、細い管を血管の中から通して、狭くなった心臓の血管を広げる治療です。', visual: true },
      { term: 'catheter', display: 'カテーテル', explanation: '血管の中を通せる、とても細くて柔らかい管です。', visual: true },
      { term: 'stent', display: 'ステント', explanation: '金属の網でできた小さな筒で、広げた血管がまた狭くならないよう内側から支えます。', visual: true },
    ],
  },
  { do: 'model', id: 'artery', step: 0 },
  { do: 'model', id: 'artery', step: 1 },
  { do: 'model', id: 'artery', step: 2 },
  { do: 'model', id: 'artery', step: 3 },
  { do: 'model', id: 'artery', step: 4 },
  {
    speaker: 'doctor',
    text: "You'll be awake: we numb the wrist with local anesthesia and give mild sedation to help you relax.",
    tr: '処置中は意識があります。手首に局所麻酔をして、リラックスできるよう軽い鎮静剤を使います。',
    terms: [
      { term: 'local anesthesia', display: '局所麻酔（きょくしょますい）', explanation: '体の一部分だけの感覚をなくす麻酔です。眠ることはありません。', visual: false },
      { term: 'sedation', display: '鎮静（ちんせい）', explanation: '薬で気持ちを落ち着かせ、うとうとした状態にすることです。', visual: false },
    ],
  },
  { speaker: 'patient', text: '麻酔が途中で切れて、痛くなったりしませんか？', tr: 'Could the anesthesia wear off in the middle and start to hurt?' },
  {
    speaker: 'doctor',
    text: "We'll monitor you the whole time and can give more medicine right away if you feel pain. The benefit is that your chest pain should improve and your risk of a heart attack goes down.",
    tr: '処置のあいだはずっと様子を見ていて、痛みを感じたらすぐに薬を追加できます。この治療で胸の痛みが良くなり、心筋梗塞のリスクが下がることが期待できます。',
  },
  {
    speaker: 'doctor',
    text: 'The main risks are bleeding or bruising at the wrist and an allergic reaction to the contrast dye. Rarely — in less than 1 in 100 patients — the artery can be damaged, or a heart attack or stroke can happen.',
    tr: '主なリスクは、手首の出血やあざ、造影剤へのアレルギー反応です。まれに（100人に1人未満）、血管の損傷や心筋梗塞、脳卒中が起こることがあります。',
    terms: [
      { term: 'contrast dye', display: '造影剤（ぞうえいざい）', explanation: 'X線（レントゲン）に写る特別な液体で、血管の形を見えるようにするために使います。', visual: false },
      { term: 'stroke', display: '脳卒中（のうそっちゅう）', explanation: '脳の血管がつまったり破れたりして、脳の働きが急に悪くなる病気です。', visual: false },
    ],
  },
  { do: 'confused' },
  { speaker: 'doctor', text: 'Contrast dye is a special liquid that shows up on X-rays, so we can see inside your arteries.', tr: '造影剤は、レントゲンに写る特別な液体です。血管の中の様子を見るために使います。' },
  { do: 'isee' },
  { speaker: 'doctor', text: 'Most people go home the next day and are back to normal activities in about a week.', tr: 'ほとんどの方は翌日に退院でき、1週間ほどで普段の生活に戻れます。' },
  { speaker: 'doctor', text: "Can you tell me in your own words what we're going to do?", tr: 'これから行うことを、ご自身の言葉で説明していただけますか？' },
  {
    speaker: 'patient',
    text: '手首から細い管を入れて、狭くなった心臓の血管を風船で広げて、ステントという網の筒を置く。出血やアレルギーのリスクがあって、まれに心筋梗塞や脳卒中もある。',
    tr: "You'll put a thin tube in through my wrist, widen the narrowed heart artery with a balloon, and place a mesh tube called a stent. There's a risk of bleeding or allergy, and rarely a heart attack or stroke.",
  },
  { do: 'ai', from: 'doctor', question: 'Did I forget anything?' },
  {
    speaker: 'doctor',
    text: "I should also go over the alternatives. We could treat this with medications alone, or with bypass surgery, which is a bigger operation. You can also choose not to have any procedure — then we'd manage it with medicine, but your risk of a heart attack stays higher.",
    tr: 'ほかの選択肢についてもお話しします。薬だけで治療する方法や、より大きな手術である「バイパス手術」もあります。また、処置を受けないことも選べます。その場合は薬で様子を見ますが、心筋梗塞のリスクは高いままです。',
    terms: [{ term: 'bypass surgery', display: '冠動脈バイパス手術', explanation: '体の別の場所の血管を使って、つまった血管の先に血液が流れる「迂回路」をつくる手術です。胸を開く大きな手術です。', visual: true }],
  },
  { speaker: 'doctor', text: 'What questions do you have for me?', tr: '何かご質問はありますか？' },
  {
    speaker: 'patient',
    text: '薬だけの治療とPCIの違いがよくわかりました。PCIを受けたいと思います。',
    tr: 'I now understand the difference between medication alone and PCI. I would like to have the PCI.',
  },
];

// Consent package for the demo visit when no AI is configured (grounded in the lines above).
export const DEMO_CONSENT = {
  procedure: { doctor: 'Percutaneous coronary intervention (PCI) with stent', patient: '経皮的冠動脈インターベンション（PCI・ステント留置）' },
  checkpoints: [
    { category: 'diagnosis', doctor: 'I understand that one of my coronary arteries (the LAD) is severely narrowed, which causes my chest pain.', patient: '心臓の血管（冠動脈の左前下行枝）がひどく狭くなっていて、それが胸の痛みの原因だと理解しました。' },
    { category: 'procedure', doctor: 'I understand that a catheter will go in through my wrist and a balloon and stent will open the artery.', patient: '手首からカテーテルを入れ、風船とステントで血管を広げることを理解しました。' },
    { category: 'benefits', doctor: 'I understand that the goal is less chest pain and a lower risk of heart attack.', patient: '胸の痛みを減らし、心筋梗塞のリスクを下げることが目的だと理解しました。' },
    { category: 'risks', doctor: 'I understand the risks: bleeding or bruising, allergy to contrast dye, and rarely (<1 in 100) artery damage, heart attack or stroke.', patient: '出血やあざ、造影剤アレルギー、まれに（100人に1人未満）血管の損傷・心筋梗塞・脳卒中のリスクがあることを理解しました。' },
    { category: 'anesthesia', doctor: 'I understand I will be awake with local anesthesia and mild sedation, and more medicine can be given if I feel pain.', patient: '局所麻酔と軽い鎮静で意識はあり、痛む時はすぐ薬を追加できることを理解しました。' },
    { category: 'alternatives', doctor: 'I understand the alternatives: medication alone, bypass surgery, or no procedure (with a higher heart-attack risk).', patient: '薬だけの治療、バイパス手術、処置を受けない選択（心筋梗塞のリスクは高いまま）があることを理解しました。' },
    { category: 'recovery', doctor: 'I understand most people go home the next day and return to normal activity in about a week.', patient: '多くの人は翌日に退院し、1週間ほどで普段の生活に戻れることを理解しました。' },
  ],
  omissions: [
    { severity: 'recommended', doctor: 'Confirm who will perform the procedure and when.', patient: '誰がいつ処置を行うかの確認がまだです。' },
  ],
};
