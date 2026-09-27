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
