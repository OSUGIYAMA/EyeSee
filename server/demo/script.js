// The two-minute demo visit: after-meal stomach pain → a tumour in the lower stomach → consent
// for a distal gastrectomy. Six exchanges, each paced so the audience can follow: the doctor's
// lines wait until the headset has finished speaking them, the patient's lines leave time to read.
// Translations are prepared in advance so the demo runs the same way every time (set
// EYESEE_DEMO_LIVE=1 to send the lines through the live AI instead).

export const DEMO_STEPS = [
  { speaker: 'doctor', text: "Hi, I'm Dr. Carter. What brings you in today?", tr: 'こんにちは、医師のカーターです。今日はどうされましたか？' },
  {
    speaker: 'patient',
    text: '最近、食事のあとに胃がしくしく痛むんです。体重も少し減ってきました。',
    tr: "Lately my stomach aches after meals — a dull, nagging pain (shiku-shiku). I've also lost some weight.",
    terms: [{ term: 'しくしく', display: 'shiku-shiku', explanation: 'Japanese sound word for a mild but persistent, nagging ache — typical of how stomach pain is described.', visual: false }],
    note: 'After-meal epigastric pain with weight loss — worth asking how much weight and over how long.',
  },
  { do: 'symptom', region: { id: 'epigastric', label: { en: 'Upper stomach (epigastric)', ja: 'みぞおち' } }, point: [0, 1.14, 0.14], quality: 'shikushiku', intensity: 5, wait: 3200 },
  {
    speaker: 'doctor',
    text: "Your tests show a small tumor in the lower part of your stomach. I recommend surgery to remove that part — it's called a distal gastrectomy. Removing it gives you the best chance of a cure.",
    tr: '検査の結果、胃の下の部分に小さな腫瘍が見つかりました。その部分を取り除く手術をおすすめします。「幽門側胃切除術」といいます。取り除くことで、治る可能性がいちばん高くなります。',
    terms: [
      { term: 'tumor', display: '腫瘍（しゅよう）', explanation: '体の中にできた、ふつうではない細胞のかたまりです。', visual: false },
      { term: 'distal gastrectomy', display: '幽門側胃切除術（ゆうもんそくいせつじょじゅつ）', explanation: '胃の出口に近い下の部分を切り取り、残った胃を腸につなぐ手術です。', visual: true },
    ],
  },
  { do: 'model', id: 'stomach', step: 0, wait: 2200 },
  { do: 'model', id: 'stomach', step: 1, wait: 2700 },
  { do: 'model', id: 'stomach', step: 2, wait: 2700 },
  { do: 'model', id: 'stomach', step: 3, wait: 2700 },
  {
    speaker: 'doctor',
    text: "You'll be asleep under general anesthesia. The main risks are bleeding, infection, and a leak where the stomach is reconnected — about 1 to 3 in 100 patients.",
    tr: '手術は全身麻酔で、眠っている間に行います。主なリスクは出血、感染、そして胃と腸のつなぎ目からの漏れで、100人に1〜3人ほどです。',
    terms: [{ term: 'general anesthesia', display: '全身麻酔（ぜんしんますい）', explanation: '薬で完全に眠った状態にして、手術中の痛みを感じないようにする麻酔です。', visual: false }],
  },
  { speaker: 'patient', text: '手術のあと、ふつうに食べられるようになりますか？', tr: 'Will I be able to eat normally after the surgery?' },
  {
    speaker: 'doctor',
    text: 'Yes. At first you will eat small meals more often, and most people eat normally again within a few weeks.',
    tr: 'はい。最初は少しずつ回数を分けて食べますが、ほとんどの方は数週間でふつうに食べられるようになります。',
  },
  { do: 'model', id: 'stomach', step: 4, wait: 3400 },
  { do: 'ai', from: 'doctor', question: 'Did I forget anything?', wait: 5200 },
  {
    speaker: 'doctor',
    text: 'Thank you. Other options are endoscopic treatment if the tumor were smaller, chemotherapy, or no surgery — but then the tumor may grow. Could you explain the plan back to me in your own words?',
    tr: 'ほかの選択肢として、腫瘍がもっと小さければ内視鏡治療、抗がん剤治療、または手術をしない選択もあります。ただしその場合、腫瘍が大きくなるおそれがあります。これからの治療を、ご自身の言葉で説明していただけますか？',
    terms: [
      { term: 'endoscopic treatment', display: '内視鏡治療（ないしきょうちりょう）', explanation: '口から細いカメラを入れて、胃の内側から小さな病変を取る治療です。', visual: false },
      { term: 'chemotherapy', display: '抗がん剤治療（こうがんざいちりょう）', explanation: 'がん細胞をへらす薬を使う治療です。', visual: false },
    ],
  },
  {
    speaker: 'patient',
    text: '胃の下の部分を腫瘍ごと取って、残った胃を腸につなぐ手術ですね。出血や感染、つなぎ目の漏れのリスクがあって、ほかに抗がん剤や手術をしない選択もある。',
    tr: "So it's surgery to remove the lower part of my stomach with the tumor and connect the rest to my intestine. There are risks of bleeding, infection and a leak at the connection, and other options are chemotherapy or no surgery.",
  },
  { do: 'consent' },
];

// Prepared AI answer for "Did I forget anything?" (the live AI gives the same kind of answer).
export const DEMO_AI = {
  questionForDoctor: 'Did I forget anything?',
  questionForPatient: '言い忘れはありますか？',
  answerDoctor: "You haven't discussed alternatives yet: endoscopic treatment, chemotherapy, or choosing not to have surgery.",
  answerPatient: '手術以外の選択肢（内視鏡治療、抗がん剤、手術をしない選択）の説明がまだです。',
  showModel: null,
  imagePrompt: null,
  imageCaption: null,
  omissions: [{ severity: 'critical', doctor: 'Discuss alternatives: endoscopic treatment, chemotherapy, or no surgery.', patient: '手術以外の選択肢（内視鏡治療・抗がん剤・手術をしない選択）' }],
};

// Consent package for the demo visit (grounded in the lines above).
export const DEMO_CONSENT = {
  procedure: { doctor: 'Distal gastrectomy', patient: '幽門側胃切除術' },
  checkpoints: [
    { category: 'diagnosis', doctor: 'I understand there is a small tumor in the lower part of my stomach.', patient: '胃の下の部分に小さな腫瘍があることを理解しました。' },
    { category: 'procedure', doctor: 'I understand the lower part of my stomach will be removed and the rest connected to my intestine.', patient: '胃の下の部分を切り取り、残った胃を腸につなぐことを理解しました。' },
    { category: 'benefits', doctor: 'I understand that removing it gives the best chance of a cure.', patient: '取り除くことが、治るためにいちばん良い方法だと理解しました。' },
    { category: 'risks', doctor: 'I understand the risks: bleeding, infection and a leak at the connection (about 1–3 in 100).', patient: '出血、感染、つなぎ目の漏れ（100人に1〜3人）のリスクを理解しました。' },
    { category: 'anesthesia', doctor: 'I understand I will be asleep under general anesthesia.', patient: '全身麻酔で眠っている間に手術することを理解しました。' },
    { category: 'alternatives', doctor: 'I understand the alternatives: endoscopic treatment, chemotherapy, or no surgery.', patient: '内視鏡治療、抗がん剤治療、手術をしない選択があることを理解しました。' },
    { category: 'recovery', doctor: 'I understand I will eat small meals at first and normally within a few weeks.', patient: '最初は少しずつ食べ、数週間でふつうに食べられることを理解しました。' },
  ],
  omissions: [],
  quiz: [
    {
      doctor: 'What will the surgery do?',
      patient: '手術では、何をしますか？',
      options: [
        { doctor: 'Remove the lower part of the stomach and connect the rest to the intestine.', patient: '胃の下の部分を取り、残りを腸につなぐ' },
        { doctor: 'Remove the whole stomach and the liver.', patient: '胃と肝臓をすべて取る' },
        { doctor: 'Only take medicine, no surgery.', patient: '薬を飲むだけで、手術はしない' },
      ],
      answer: 0,
      why: { doctor: 'A distal gastrectomy removes the lower stomach and reconnects the rest to the intestine.', patient: '胃の下の部分を切り取り、残った胃を腸につなぐ手術です。' },
    },
    {
      doctor: 'Which risks did the doctor explain?',
      patient: '医師が説明したリスクはどれですか？',
      options: [
        { doctor: 'There are no risks at all.', patient: 'リスクはまったくない' },
        { doctor: 'Bleeding, infection, or a leak at the connection (about 1–3 in 100).', patient: '出血、感染、つなぎ目の漏れ（100人に1〜3人）' },
        { doctor: 'You will definitely need a second operation.', patient: '必ずもう一度手術が必要になる' },
      ],
      answer: 1,
      why: { doctor: 'The main risks are bleeding, infection and a leak at the connection — about 1 to 3 in 100.', patient: '主なリスクは出血、感染、つなぎ目の漏れで、100人に1〜3人ほどです。' },
    },
    {
      doctor: 'Are there options other than surgery?',
      patient: '手術以外の選択肢はありますか？',
      options: [
        { doctor: 'No, surgery is the only way.', patient: 'いいえ、手術しかない' },
        { doctor: 'You are not allowed to refuse surgery.', patient: '手術を断ることはできない' },
        { doctor: 'Yes: endoscopic treatment, chemotherapy, or no surgery.', patient: 'はい。内視鏡治療、抗がん剤、手術をしない選択もある' },
      ],
      answer: 2,
      why: { doctor: 'Alternatives were endoscopic treatment, chemotherapy, or no surgery (the tumor may grow).', patient: '内視鏡治療、抗がん剤治療、手術をしない選択（腫瘍が大きくなるおそれ）があります。' },
    },
  ],
};

// Pen signatures used when the demo signs on everyone's behalf.
export const DEMO_SIGNATURES = {
  patient: 'data:image/png;base64,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',
  doctor: 'data:image/png;base64,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',
};
